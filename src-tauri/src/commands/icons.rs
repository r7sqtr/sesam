use std::sync::{Arc, OnceLock};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tokio::sync::Semaphore;

static ICON_SEMAPHORE: OnceLock<Arc<Semaphore>> = OnceLock::new();

#[tauri::command]
pub async fn get_file_icon(path: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let semaphore = ICON_SEMAPHORE
            .get_or_init(|| Arc::new(Semaphore::new(4)))
            .clone();
        let _permit = semaphore
            .acquire_owned()
            .await
            .map_err(|e| e.to_string())?;
        let bytes = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<u8>, String> {
            let png = tauri_nspanel::objc2::rc::autoreleasepool(|_| icon_png(&path))?;
            shrink_png(&png)
        })
        .await
        .map_err(|e| e.to_string())??;
        Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("このプラットフォームでは未対応です".into())
    }
}

#[cfg(target_os = "macos")]
pub fn nsimage_to_png(
    image: &tauri_nspanel::objc2_app_kit::NSImage,
) -> Result<Vec<u8>, String> {
    use tauri_nspanel::objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use tauri_nspanel::objc2_foundation::NSDictionary;

    let tiff = image
        .TIFFRepresentation()
        .ok_or("画像データの取得に失敗しました")?;
    let rep = NSBitmapImageRep::imageRepWithData(&tiff).ok_or("画像変換に失敗しました")?;
    let png = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }
    .ok_or("PNG 変換に失敗しました")?;
    Ok(png.to_vec())
}

#[cfg(target_os = "macos")]
fn icon_png(path: &str) -> Result<Vec<u8>, String> {
    use tauri_nspanel::objc2_app_kit::NSWorkspace;
    use tauri_nspanel::objc2_foundation::NSString;

    let workspace = NSWorkspace::sharedWorkspace();
    let image = workspace.iconForFile(&NSString::from_str(path));
    nsimage_to_png(&image)
}

#[cfg(target_os = "macos")]
fn shrink_png(png: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Cursor;
    let img = image::load_from_memory_with_format(png, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(64, 64);
    let mut out = Cursor::new(Vec::new());
    thumb
        .write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}
