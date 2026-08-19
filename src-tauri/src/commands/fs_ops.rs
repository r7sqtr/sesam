use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::AppState;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictPolicy {
    Overwrite,
    Skip,
    Rename,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskProgress {
    task_id: u64,
    done: u64,
    total: u64,
    current: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TransferResult {
    source: String,
    dest: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskDone {
    task_id: u64,
    cancelled: bool,
    results: Vec<TransferResult>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskError {
    task_id: u64,
    message: String,
}

enum Job {
    Mkdir(PathBuf),
    CopyFile(PathBuf, PathBuf),
    Symlink(PathBuf, PathBuf),
}

struct Plan {
    source: PathBuf,
    dest: PathBuf,
    overwrite: bool,
    file_count: u64,
}

#[tauri::command]
pub async fn check_conflicts(sources: Vec<String>, dest_dir: String) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dest = Path::new(&dest_dir);
        sources
            .iter()
            .filter_map(|source| {
                let name = Path::new(source).file_name()?.to_string_lossy().into_owned();
                dest.join(&name).exists().then_some(name)
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub fn copy_entries(
    app: AppHandle,
    state: State<'_, AppState>,
    sources: Vec<String>,
    dest_dir: String,
    on_conflict: ConflictPolicy,
) -> u64 {
    let (task_id, cancel) = state.tasks.register();
    tauri::async_runtime::spawn_blocking(move || {
        run_transfer(&app, task_id, cancel, sources, dest_dir, on_conflict, false);
    });
    task_id
}

#[tauri::command]
pub fn move_entries(
    app: AppHandle,
    state: State<'_, AppState>,
    sources: Vec<String>,
    dest_dir: String,
    on_conflict: ConflictPolicy,
) -> u64 {
    let (task_id, cancel) = state.tasks.register();
    tauri::async_runtime::spawn_blocking(move || {
        run_transfer(&app, task_id, cancel, sources, dest_dir, on_conflict, true);
    });
    task_id
}

#[tauri::command]
pub fn cancel_task(state: State<'_, AppState>, task_id: u64) {
    state.tasks.cancel(task_id);
}

#[tauri::command]
pub async fn trash_entries(paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        trash::delete_all(&paths).map_err(|e| format!("ゴミ箱への移動に失敗しました: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn rename_entry(path: String, new_name: String) -> Result<String, String> {
    if new_name.is_empty() || new_name.contains('/') {
        return Err("無効な名前です".into());
    }
    let source = PathBuf::from(&path);
    let Some(parent) = source.parent() else {
        return Err("リネームできない場所です".into());
    };
    let dest = parent.join(&new_name);
    if dest.exists() {
        return Err(format!("「{new_name}」は既に存在します"));
    }
    fs::rename(&source, &dest).map_err(|e| format!("リネームに失敗しました: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn remove_empty_dir(path: String) -> Result<(), String> {
    fs::remove_dir(&path).map_err(|e| format!("フォルダ削除に失敗しました: {e}"))
}

#[tauri::command]
pub fn create_folder(parent: String, name: String) -> Result<String, String> {
    if name.is_empty() || name.contains('/') {
        return Err("無効な名前です".into());
    }
    let dest = Path::new(&parent).join(&name);
    if dest.exists() {
        return Err(format!("「{name}」は既に存在します"));
    }
    fs::create_dir(&dest).map_err(|e| format!("フォルダ作成に失敗しました: {e}"))?;
    Ok(dest.to_string_lossy().into_owned())
}

fn run_transfer(
    app: &AppHandle,
    task_id: u64,
    cancel: Arc<AtomicBool>,
    sources: Vec<String>,
    dest_dir: String,
    on_conflict: ConflictPolicy,
    is_move: bool,
) {
    let result = transfer(app, task_id, &cancel, &sources, &dest_dir, on_conflict, is_move);
    let state = app.state::<AppState>();
    state.tasks.unregister(task_id);
    match result {
        Ok((cancelled, results)) => {
            let _ = app.emit(
                "task-done",
                TaskDone {
                    task_id,
                    cancelled,
                    results,
                },
            );
        }
        Err(message) => {
            let _ = app.emit("task-error", TaskError { task_id, message });
        }
    }
}

fn canonical(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn transfer(
    app: &AppHandle,
    task_id: u64,
    cancel: &AtomicBool,
    sources: &[String],
    dest_dir: &str,
    on_conflict: ConflictPolicy,
    is_move: bool,
) -> Result<(bool, Vec<TransferResult>), String> {
    let dest_root = Path::new(dest_dir);
    let canon_dest = canonical(dest_root);

    for source in sources {
        let canon_source = canonical(Path::new(source));
        if canon_dest == canon_source || canon_dest.starts_with(&canon_source) {
            return Err("コピー/移動先がソース自身またはその内部です".into());
        }
    }

    let mut plans: Vec<Plan> = Vec::new();
    for source in sources {
        let source_path = PathBuf::from(source);
        let Some(name) = source_path.file_name() else {
            continue;
        };
        let mut dest = dest_root.join(name);
        let mut overwrite = false;
        if dest == source_path {
            if on_conflict == ConflictPolicy::Rename {
                dest = available_path(dest_root, name.to_string_lossy().as_ref());
            } else {
                continue;
            }
        } else if dest.exists() {
            match on_conflict {
                ConflictPolicy::Skip => continue,
                ConflictPolicy::Rename => {
                    dest = available_path(dest_root, name.to_string_lossy().as_ref());
                }
                ConflictPolicy::Overwrite => {
                    overwrite = true;
                }
            }
        }
        let file_count = count_files(&source_path);
        plans.push(Plan {
            source: source_path,
            dest,
            overwrite,
            file_count,
        });
    }

    let total: u64 = plans.iter().map(|plan| plan.file_count).sum();
    let mut done: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut results: Vec<TransferResult> = Vec::new();

    for plan in &plans {
        if cancel.load(Ordering::SeqCst) {
            return Ok((true, results));
        }

        let backup = if plan.overwrite {
            let name = plan
                .dest
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let backup = available_path(dest_root, &format!("{name}.sesam-backup"));
            fs::rename(&plan.dest, &backup)
                .map_err(|e| format!("{}: {e}", plan.dest.display()))?;
            Some(backup)
        } else {
            None
        };

        let outcome = execute_plan(
            app,
            task_id,
            cancel,
            plan,
            is_move,
            total,
            &mut done,
            &mut last_emit,
        );

        match outcome {
            Ok(false) => {
                if let Some(backup) = backup {
                    let _ = remove_existing(&backup);
                }
                results.push(TransferResult {
                    source: plan.source.to_string_lossy().into_owned(),
                    dest: plan.dest.to_string_lossy().into_owned(),
                });
            }
            Ok(true) => {
                remove_if_exists(&plan.dest);
                if let Some(backup) = backup {
                    let _ = fs::rename(&backup, &plan.dest);
                }
                return Ok((true, results));
            }
            Err(message) => {
                remove_if_exists(&plan.dest);
                if let Some(backup) = backup {
                    let _ = fs::rename(&backup, &plan.dest);
                }
                return Err(message);
            }
        }
    }

    Ok((false, results))
}

fn execute_plan(
    app: &AppHandle,
    task_id: u64,
    cancel: &AtomicBool,
    plan: &Plan,
    is_move: bool,
    total: u64,
    done: &mut u64,
    last_emit: &mut Instant,
) -> Result<bool, String> {
    if is_move && fs::rename(&plan.source, &plan.dest).is_ok() {
        *done += plan.file_count;
        emit_progress(app, task_id, *done, total, &plan.source, last_emit, true);
        return Ok(false);
    }

    let mut jobs: Vec<Job> = Vec::new();
    collect_jobs(&plan.source, &plan.dest, &mut jobs)
        .map_err(|e| format!("{}: {e}", plan.source.display()))?;

    for job in &jobs {
        if cancel.load(Ordering::SeqCst) {
            return Ok(true);
        }
        match job {
            Job::Mkdir(dir) => {
                if !dir.exists() {
                    fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
                }
            }
            Job::CopyFile(from, to) => {
                fs::copy(from, to).map_err(|e| format!("{}: {e}", from.display()))?;
                *done += 1;
                emit_progress(app, task_id, *done, total, from, last_emit, false);
            }
            Job::Symlink(target, to) => {
                create_symlink(target, to)?;
                *done += 1;
                emit_progress(app, task_id, *done, total, to, last_emit, false);
            }
        }
    }

    if is_move {
        remove_existing(&plan.source)?;
    }

    Ok(false)
}

fn emit_progress(
    app: &AppHandle,
    task_id: u64,
    done: u64,
    total: u64,
    current: &Path,
    last_emit: &mut Instant,
    force: bool,
) {
    if !force && last_emit.elapsed() < PROGRESS_INTERVAL {
        return;
    }
    *last_emit = Instant::now();
    let _ = app.emit(
        "task-progress",
        TaskProgress {
            task_id,
            done,
            total,
            current: current
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
        },
    );
}

#[cfg(unix)]
fn create_symlink(target: &Path, dest: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(target, dest).map_err(|e| format!("{}: {e}", dest.display()))
}

#[cfg(not(unix))]
fn create_symlink(_target: &Path, dest: &Path) -> Result<(), String> {
    Err(format!(
        "{}: シンボリックリンクの作成に未対応です",
        dest.display()
    ))
}

fn collect_jobs(source: &Path, dest: &Path, jobs: &mut Vec<Job>) -> std::io::Result<()> {
    let meta = fs::symlink_metadata(source)?;
    if meta.file_type().is_symlink() {
        let target = fs::read_link(source)?;
        jobs.push(Job::Symlink(target, dest.to_path_buf()));
    } else if meta.is_dir() {
        jobs.push(Job::Mkdir(dest.to_path_buf()));
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            collect_jobs(&entry.path(), &dest.join(entry.file_name()), jobs)?;
        }
    } else {
        jobs.push(Job::CopyFile(source.to_path_buf(), dest.to_path_buf()));
    }
    Ok(())
}

fn count_files(source: &Path) -> u64 {
    let Ok(meta) = fs::symlink_metadata(source) else {
        return 0;
    };
    if meta.file_type().is_symlink() {
        1
    } else if meta.is_dir() {
        let mut count = 0;
        if let Ok(read) = fs::read_dir(source) {
            for entry in read.flatten() {
                count += count_files(&entry.path());
            }
        }
        count
    } else {
        1
    }
}

fn remove_existing(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        fs::remove_file(path).map_err(|e| format!("{}: {e}", path.display()))
    } else {
        fs::remove_dir_all(path).map_err(|e| format!("{}: {e}", path.display()))
    }
}

fn remove_if_exists(path: &Path) {
    if path.symlink_metadata().is_ok() {
        let _ = remove_existing(path);
    }
}

fn available_path(dest_dir: &Path, name: &str) -> PathBuf {
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (name.to_string(), String::new()),
    };
    for index in 2.. {
        let candidate = dest_dir.join(format!("{stem} {index}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}
