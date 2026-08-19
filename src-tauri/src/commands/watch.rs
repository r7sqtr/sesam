use std::path::PathBuf;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

const MAX_WATCHERS: usize = 128;

#[tauri::command]
pub fn watch_dir(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    let mut watchers = state.watchers.lock().unwrap();
    if watchers.contains_key(&path_buf) {
        return Ok(());
    }
    if watchers.len() >= MAX_WATCHERS {
        return Err(format!(
            "監視できるフォルダ数の上限（{MAX_WATCHERS}）に達しました"
        ));
    }

    let emit_path = path.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        move |result: DebounceEventResult| {
            if result.is_ok() {
                let _ = app.emit("dir-changed", &emit_path);
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(&path_buf, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    watchers.insert(path_buf, debouncer);
    Ok(())
}

#[tauri::command]
pub fn unwatch_dir(state: State<'_, AppState>, path: String) -> Result<(), String> {
    state
        .watchers
        .lock()
        .unwrap()
        .remove(&PathBuf::from(path));
    Ok(())
}
