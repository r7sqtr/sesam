use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

const MAX_ENTRIES: usize = 50_000;
const MAX_READ_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub is_hidden: bool,
    pub size: u64,
    pub mtime_ms: u64,
    pub ext: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub entries: Vec<Entry>,
    pub truncated: bool,
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<DirListing, String> {
    tauri::async_runtime::spawn_blocking(move || list_dir_blocking(&path))
        .await
        .map_err(|e| e.to_string())?
}

fn list_dir_blocking(path: &str) -> Result<DirListing, String> {
    let dir = Path::new(path);
    let read = fs::read_dir(dir).map_err(|e| readable_error(path, &e))?;

    let mut entries = Vec::new();
    let mut truncated = false;

    for item in read {
        if entries.len() >= MAX_ENTRIES {
            truncated = true;
            break;
        }
        let Ok(item) = item else {
            continue;
        };
        let Ok(file_type) = item.file_type() else {
            continue;
        };
        let name = item.file_name().to_string_lossy().into_owned();
        let entry_path = item.path();
        let is_symlink = file_type.is_symlink();
        let is_dir = if is_symlink {
            fs::metadata(&entry_path)
                .map(|meta| meta.is_dir())
                .unwrap_or(false)
        } else {
            file_type.is_dir()
        };
        let (size, mtime_ms) = item
            .metadata()
            .map(|meta| {
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis() as u64)
                    .unwrap_or(0);
                (meta.len(), mtime)
            })
            .unwrap_or((0, 0));
        let ext = if is_dir {
            String::new()
        } else {
            entry_path
                .extension()
                .map(|ext| ext.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };

        entries.push(Entry {
            is_hidden: name.starts_with('.'),
            path: entry_path.to_string_lossy().into_owned(),
            name,
            is_dir,
            is_symlink,
            size,
            mtime_ms,
            ext,
        });
    }

    Ok(DirListing { entries, truncated })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextHead {
    pub text: String,
    pub truncated: bool,
    pub binary: bool,
}

#[tauri::command]
pub async fn read_text_head(path: String, max_bytes: u64) -> Result<TextHead, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let file = fs::File::open(&path).map_err(|e| readable_error(&path, &e))?;
        let total = file.metadata().ok().map(|meta| meta.len());
        let cap = max_bytes.min(MAX_READ_BYTES);
        let mut buf = Vec::new();
        file.take(cap)
            .read_to_end(&mut buf)
            .map_err(|e| readable_error(&path, &e))?;
        let binary = buf.iter().take(8192).any(|byte| *byte == 0);
        let truncated = total.map(|len| len > buf.len() as u64).unwrap_or(false);
        let text = if binary {
            String::new()
        } else {
            String::from_utf8_lossy(&buf).into_owned()
        };
        Ok(TextHead {
            text,
            truncated,
            binary,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn readable_error(path: &str, error: &std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::PermissionDenied => format!(
            "アクセス権限がありません: {path}（システム設定 > プライバシーとセキュリティ でフォルダへのアクセスを許可してください）"
        ),
        std::io::ErrorKind::NotFound => format!("フォルダが見つかりません: {path}"),
        _ => format!("{path}: {error}"),
    }
}
