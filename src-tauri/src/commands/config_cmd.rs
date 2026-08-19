use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn load_config(app: AppHandle) -> Option<serde_json::Value> {
    let dir = app.path().app_config_dir().ok()?;
    let data = std::fs::read_to_string(dir.join("config.json")).ok()?;
    serde_json::from_str(&data).ok()
}

static TMP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[tauri::command]
pub fn save_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let data = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let seq = TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = dir.join(format!("config.json.{}.{}.tmp", std::process::id(), seq));
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("config.json")).map_err(|e| e.to_string())?;
    Ok(())
}
