use std::fs;
use std::io;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::state::AppState;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);
const MAX_EXTRACT_TOTAL_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_EXTRACT_ENTRIES: usize = 200_000;

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
struct TaskDone {
    task_id: u64,
    cancelled: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskError {
    task_id: u64,
    message: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TaskNote {
    task_id: u64,
    message: String,
}

fn finish(app: &AppHandle, task_id: u64, result: Result<bool, String>) {
    let state = app.state::<AppState>();
    state.tasks.unregister(task_id);
    match result {
        Ok(cancelled) => {
            let _ = app.emit("task-done", TaskDone { task_id, cancelled });
        }
        Err(message) => {
            let _ = app.emit("task-error", TaskError { task_id, message });
        }
    }
}

fn available_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (name.to_string(), String::new()),
    };
    for index in 2.. {
        let candidate = dir.join(format!("{stem} {index}{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

#[tauri::command]
pub fn create_zip(
    app: AppHandle,
    state: State<'_, AppState>,
    sources: Vec<String>,
    dest_dir: String,
) -> u64 {
    let (task_id, cancel) = state.tasks.register();
    tauri::async_runtime::spawn_blocking(move || {
        let result = run_create_zip(&app, task_id, &cancel, &sources, &dest_dir);
        finish(&app, task_id, result);
    });
    task_id
}

fn run_create_zip(
    app: &AppHandle,
    task_id: u64,
    cancel: &AtomicBool,
    sources: &[String],
    dest_dir: &str,
) -> Result<bool, String> {
    if sources.is_empty() {
        return Ok(false);
    }
    let dest_root = Path::new(dest_dir);
    let zip_name = if sources.len() == 1 {
        let stem = Path::new(&sources[0])
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "アーカイブ".to_string());
        format!("{stem}.zip")
    } else {
        "アーカイブ.zip".to_string()
    };
    let dest = available_path(dest_root, &zip_name);

    let mut files: Vec<(PathBuf, String)> = Vec::new();
    let mut skipped_symlinks: u64 = 0;
    for source in sources {
        let source_path = Path::new(source);
        let Some(base_name) = source_path.file_name() else {
            continue;
        };
        let base_name = base_name.to_string_lossy().into_owned();
        collect_files(source_path, &base_name, &mut files, &mut skipped_symlinks)
            .map_err(|e| format!("{source}: {e}"))?;
    }

    let result = write_zip(app, task_id, cancel, &files, &dest);
    if matches!(result, Ok(true) | Err(_)) {
        let _ = fs::remove_file(&dest);
    }
    if matches!(result, Ok(false)) && skipped_symlinks > 0 {
        let _ = app.emit(
            "task-note",
            TaskNote {
                task_id,
                message: format!(
                    "シンボリックリンク {skipped_symlinks} 件は圧縮から除外しました"
                ),
            },
        );
    }
    result
}

fn write_zip(
    app: &AppHandle,
    task_id: u64,
    cancel: &AtomicBool,
    files: &[(PathBuf, String)],
    dest: &Path,
) -> Result<bool, String> {
    use zip::write::SimpleFileOptions;

    let file = fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut writer = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let total = files.len() as u64;
    let mut done: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;

    for (path, rel) in files {
        if cancel.load(Ordering::SeqCst) {
            drop(writer);
            return Ok(true);
        }
        if path.is_dir() {
            writer
                .add_directory(format!("{rel}/"), options)
                .map_err(|e| e.to_string())?;
        } else {
            writer.start_file(rel, options).map_err(|e| e.to_string())?;
            let mut reader = fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
            io::copy(&mut reader, &mut writer).map_err(|e| e.to_string())?;
        }
        done += 1;
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                "task-progress",
                TaskProgress {
                    task_id,
                    done,
                    total,
                    current: rel.clone(),
                },
            );
        }
    }
    writer.finish().map_err(|e| e.to_string())?;
    Ok(false)
}

fn collect_files(
    source: &Path,
    rel: &str,
    out: &mut Vec<(PathBuf, String)>,
    skipped_symlinks: &mut u64,
) -> std::io::Result<()> {
    let meta = fs::symlink_metadata(source)?;
    if meta.file_type().is_symlink() {
        *skipped_symlinks += 1;
    } else if meta.is_dir() {
        out.push((source.to_path_buf(), rel.to_string()));
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            collect_files(&entry.path(), &format!("{rel}/{name}"), out, skipped_symlinks)?;
        }
    } else if meta.is_file() {
        out.push((source.to_path_buf(), rel.to_string()));
    }
    Ok(())
}

#[tauri::command]
pub fn extract_archive(
    app: AppHandle,
    state: State<'_, AppState>,
    archive: String,
    dest_dir: String,
) -> u64 {
    let (task_id, cancel) = state.tasks.register();
    tauri::async_runtime::spawn_blocking(move || {
        let result = run_extract(&app, task_id, &cancel, &archive, &dest_dir);
        finish(&app, task_id, result);
    });
    task_id
}

fn run_extract(
    app: &AppHandle,
    task_id: u64,
    cancel: &AtomicBool,
    archive: &str,
    dest_dir: &str,
) -> Result<bool, String> {
    let archive_path = Path::new(archive);
    let stem = archive_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "展開".to_string());
    let dest = available_path(Path::new(dest_dir), &stem);
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    let result = extract_into(app, task_id, cancel, archive_path, &dest);
    if matches!(result, Ok(true) | Err(_)) {
        let _ = fs::remove_dir_all(&dest);
    }
    result
}

fn extract_into(
    app: &AppHandle,
    task_id: u64,
    cancel: &AtomicBool,
    archive_path: &Path,
    dest: &Path,
) -> Result<bool, String> {
    let file = fs::File::open(archive_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("zip を開けません: {e}"))?;
    if zip.len() > MAX_EXTRACT_ENTRIES {
        return Err(format!(
            "アーカイブのエントリ数が上限（{MAX_EXTRACT_ENTRIES}）を超えています"
        ));
    }
    let total = zip.len() as u64;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let mut total_written: u64 = 0;

    for index in 0..zip.len() {
        if cancel.load(Ordering::SeqCst) {
            return Ok(true);
        }
        let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else {
            continue;
        };
        let out_path = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            let remaining = MAX_EXTRACT_TOTAL_BYTES - total_written;
            let written = io::copy(&mut (&mut entry).take(remaining + 1), &mut out)
                .map_err(|e| e.to_string())?;
            if written > remaining {
                return Err("展開後のサイズが上限を超えました（zip 爆弾の可能性）".to_string());
            }
            total_written += written;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Some(mode) = entry.unix_mode() {
                    let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
                }
            }
        }
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                "task-progress",
                TaskProgress {
                    task_id,
                    done: index as u64 + 1,
                    total,
                    current: entry.name().to_string(),
                },
            );
        }
    }
    Ok(false)
}
