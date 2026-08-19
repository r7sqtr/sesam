use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str, Utf32String};
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::state::Db;

const RANK_CAP: f64 = 5000.0;
const INDEX_MAX_ENTRIES: usize = 400_000;
const INDEX_MAX_DEPTH: usize = 10;
const INDEX_TTL_SECS: i64 = 1800;
const RANK_CHECK_INTERVAL: u64 = 50;
const SKIP_DIRS: [&str; 8] = [
    "node_modules",
    "Library",
    "target",
    ".git",
    ".Trash",
    ".cache",
    "Caches",
    "DerivedData",
];

struct IndexEntry {
    path: String,
    name: Utf32String,
    is_dir: bool,
}

fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn index_store() -> &'static RwLock<Arc<Vec<IndexEntry>>> {
    static STORE: OnceLock<RwLock<Arc<Vec<IndexEntry>>>> = OnceLock::new();
    STORE.get_or_init(|| RwLock::new(Arc::new(Vec::new())))
}

static INDEX_BUILT_AT: AtomicI64 = AtomicI64::new(0);
static INDEX_BUILDING: AtomicBool = AtomicBool::new(false);
static VISIT_COUNT: AtomicU64 = AtomicU64::new(0);

fn build_index_blocking() {
    let Ok(home) = std::env::var("HOME") else {
        INDEX_BUILT_AT.store(now_secs(), Ordering::SeqCst);
        return;
    };
    let mut entries: Vec<IndexEntry> = Vec::new();
    let mut stack: Vec<(std::path::PathBuf, usize)> = vec![(home.into(), 0)];
    while let Some((dir, depth)) = stack.pop() {
        if entries.len() >= INDEX_MAX_ENTRIES {
            break;
        }
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in read.flatten() {
            if entries.len() >= INDEX_MAX_ENTRIES {
                break;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            let is_dir = file_type.is_dir();
            entries.push(IndexEntry {
                name: Utf32String::from(name.as_str()),
                path: path.to_string_lossy().into_owned(),
                is_dir,
            });
            if is_dir && depth < INDEX_MAX_DEPTH {
                stack.push((path, depth + 1));
            }
        }
    }
    *index_store().write().unwrap() = Arc::new(entries);
    INDEX_BUILT_AT.store(now_secs(), Ordering::SeqCst);
}

fn ensure_index_fresh(app: &AppHandle) {
    if now_secs() - INDEX_BUILT_AT.load(Ordering::SeqCst) <= INDEX_TTL_SECS {
        return;
    }
    if INDEX_BUILDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        build_index_blocking();
        INDEX_BUILDING.store(false, Ordering::SeqCst);
        let _ = app.emit("index-ready", ());
    });
}

#[tauri::command]
pub fn prepare_index(app: AppHandle) {
    ensure_index_fresh(&app);
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn frecency(rank: f64, last_visit: i64, now: i64) -> f64 {
    let age = (now - last_visit).max(0);
    let multiplier = if age < 3600 {
        4.0
    } else if age < 86400 {
        2.0
    } else if age < 604800 {
        0.5
    } else {
        0.25
    };
    rank * multiplier
}

#[tauri::command]
pub async fn record_visit(db: State<'_, Db>, path: String) -> Result<(), String> {
    let conn = db.0.lock().unwrap();
    let now = now_secs();
    conn.execute(
        "INSERT INTO visits (path, rank, last_visit) VALUES (?1, 1.0, ?2)
         ON CONFLICT(path) DO UPDATE SET rank = rank + 1.0, last_visit = ?2",
        params![path, now],
    )
    .map_err(|e| e.to_string())?;
    if VISIT_COUNT.fetch_add(1, Ordering::Relaxed) % RANK_CHECK_INTERVAL == 0 {
        let total: f64 = conn
            .query_row("SELECT COALESCE(SUM(rank), 0) FROM visits", [], |row| {
                row.get(0)
            })
            .map_err(|e| e.to_string())?;
        if total > RANK_CAP {
            conn.execute("UPDATE visits SET rank = rank * 0.9", [])
                .map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM visits WHERE rank < 1.0", [])
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpCandidate {
    pub path: String,
    pub score: f64,
    pub is_dir: bool,
    pub match_indices: Vec<u32>,
}

#[tauri::command]
pub async fn query_jump(
    app: AppHandle,
    db: State<'_, Db>,
    query: String,
    limit: usize,
) -> Result<Vec<JumpCandidate>, String> {
    let rows: Vec<(String, f64, i64)> = {
        let conn = db.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT path, rank, last_visit FROM visits")
            .map_err(|e| e.to_string())?;
        let result = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|row| row.ok())
            .collect();
        result
    };

    ensure_index_fresh(&app);

    let candidates = tauri::async_runtime::spawn_blocking(move || {
        let now = now_secs();
        let trimmed = query.trim().to_string();
        let mut candidates: Vec<JumpCandidate> = if trimmed.is_empty() {
            rows.into_iter()
                .filter(|(path, _, _)| Path::new(path).is_dir())
                .map(|(path, rank, last)| JumpCandidate {
                    score: frecency(rank, last, now),
                    path,
                    is_dir: true,
                    match_indices: Vec::new(),
                })
                .collect()
        } else {
            let match_full_path = trimmed.contains('/');
            let mut matcher = Matcher::new(Config::DEFAULT);
            let pattern = Pattern::parse(&trimmed, CaseMatching::Ignore, Normalization::Smart);
            let mut buf = Vec::new();
            let mut indices: Vec<u32> = Vec::new();
            let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

            let mut list: Vec<JumpCandidate> = rows
                .into_iter()
                .filter_map(|(path, rank, last)| {
                    indices.clear();
                    let target = if match_full_path { &path } else { basename(&path) };
                    let haystack = Utf32Str::new(target, &mut buf);
                    pattern
                        .indices(haystack, &mut matcher, &mut indices)
                        .map(|fuzzy| {
                            let boost = 1.0 + frecency(rank, last, now).ln_1p();
                            JumpCandidate {
                                score: fuzzy as f64 * boost,
                                is_dir: true,
                                match_indices: if match_full_path {
                                    Vec::new()
                                } else {
                                    indices.clone()
                                },
                                path,
                            }
                        })
                })
                .filter(|candidate| Path::new(&candidate.path).is_dir())
                .collect();
            for candidate in &list {
                seen.insert(candidate.path.clone());
            }

            let index = index_store().read().unwrap().clone();
            let cap = limit.min(100);
            let mut idx_scored: Vec<(f64, usize)> = Vec::new();
            for (i, entry) in index.iter().enumerate() {
                if seen.contains(&entry.path) {
                    continue;
                }
                let score = if match_full_path {
                    let haystack = Utf32Str::new(&entry.path, &mut buf);
                    pattern.score(haystack, &mut matcher)
                } else {
                    pattern.score(entry.name.slice(..), &mut matcher)
                };
                if let Some(score) = score {
                    idx_scored.push((score as f64 * if entry.is_dir { 1.2 } else { 1.0 }, i));
                }
            }
            idx_scored.sort_by(|a, b| {
                b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal)
            });
            idx_scored.truncate(cap);
            for (score, i) in idx_scored {
                let entry = &index[i];
                let match_indices = if match_full_path {
                    Vec::new()
                } else {
                    indices.clear();
                    let _ = pattern.indices(entry.name.slice(..), &mut matcher, &mut indices);
                    indices.clone()
                };
                list.push(JumpCandidate {
                    score,
                    path: entry.path.clone(),
                    is_dir: entry.is_dir,
                    match_indices,
                });
            }
            list
        };

        candidates
            .sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        candidates.truncate(limit.min(100));
        candidates
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(candidates)
}

#[tauri::command]
pub async fn complete_path(partial: String) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || complete_path_blocking(&partial))
        .await
        .unwrap_or_default()
}

fn complete_path_blocking(partial: &str) -> Vec<String> {
    let (dir, prefix) = match partial.rfind('/') {
        Some(index) => (&partial[..index.max(1)], &partial[index + 1..]),
        None => return Vec::new(),
    };
    let dir = if dir.is_empty() { "/" } else { dir };
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let prefix_lower = prefix.to_lowercase();
    let mut results: Vec<String> = read
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.to_lowercase().starts_with(&prefix_lower) {
                return None;
            }
            let is_dir = entry
                .file_type()
                .map(|ft| {
                    ft.is_dir()
                        || (ft.is_symlink() && entry.path().canonicalize().map(|p| p.is_dir()).unwrap_or(false))
                })
                .unwrap_or(false);
            if !is_dir {
                return None;
            }
            if prefix.is_empty() && name.starts_with('.') {
                return None;
            }
            Some(format!(
                "{}/{}",
                if dir == "/" { "" } else { dir },
                name
            ))
        })
        .collect();
    results.sort();
    results.truncate(30);
    results
}
