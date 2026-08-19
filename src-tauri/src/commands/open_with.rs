use std::process::Command;

fn run_open(mut cmd: Command) -> Result<(), String> {
    let status = cmd.status().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("open コマンドが失敗しました ({status})"))
    }
}

fn ensure_absolute(paths: &[String]) -> Result<(), String> {
    for path in paths {
        if !path.starts_with('/') {
            return Err(format!("絶対パスではありません: {path}"));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn open_entries(paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    ensure_absolute(&paths)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("/usr/bin/open");
        cmd.arg("--").args(&paths);
        run_open(cmd)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_with_app(paths: Vec<String>, app: String) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    ensure_absolute(&paths)?;
    if app.is_empty() || app.starts_with('-') {
        return Err(format!("アプリの指定が不正です: {app}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("/usr/bin/open");
        cmd.arg("-a").arg(&app).arg("--").args(&paths);
        run_open(cmd)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reveal_in_finder(path: String) -> Result<(), String> {
    if !path.starts_with('/') {
        return Err(format!("絶対パスではありません: {path}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("/usr/bin/open");
        cmd.arg("-R").arg("--").arg(&path);
        run_open(cmd)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub async fn list_applications() -> Vec<AppInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut apps = std::collections::BTreeSet::new();
        let mut roots = vec![
            "/Applications".to_string(),
            "/System/Applications".to_string(),
            "/System/Applications/Utilities".to_string(),
        ];
        if let Ok(home) = std::env::var("HOME") {
            roots.push(format!("{home}/Applications"));
        }
        for root in roots {
            collect_apps(std::path::Path::new(&root), &mut apps, 2);
        }
        apps.into_iter()
            .map(|(name, path)| AppInfo { name, path })
            .collect()
    })
    .await
    .unwrap_or_default()
}

fn collect_apps(
    dir: &std::path::Path,
    out: &mut std::collections::BTreeSet<(String, String)>,
    depth: u8,
) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in read.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.ends_with(".app") {
            out.insert((
                name.trim_end_matches(".app").to_string(),
                path.to_string_lossy().into_owned(),
            ));
        } else if depth > 0 && path.is_dir() && !name.starts_with('.') {
            collect_apps(&path, out, depth - 1);
        }
    }
}
