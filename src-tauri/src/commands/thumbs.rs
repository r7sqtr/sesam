use std::sync::{Arc, OnceLock};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tokio::sync::Semaphore;

static THUMB_SEMAPHORE: OnceLock<Arc<Semaphore>> = OnceLock::new();

#[tauri::command]
pub async fn get_thumbnail(path: String, size: f64) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let semaphore = THUMB_SEMAPHORE
            .get_or_init(|| Arc::new(Semaphore::new(3)))
            .clone();
        let _permit = semaphore
            .acquire_owned()
            .await
            .map_err(|e| e.to_string())?;
        let bytes = tauri::async_runtime::spawn_blocking(move || ql_thumbnail_png(&path, size))
            .await
            .map_err(|e| e.to_string())??;
        Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, size);
        Err("このプラットフォームでは未対応です".into())
    }
}

#[cfg(target_os = "macos")]
fn ql_thumbnail_png(path: &str, size: f64) -> Result<Vec<u8>, String> {
    use block2::RcBlock;
    use objc2_core_foundation::CGSize;
    use objc2_quick_look_thumbnailing::{
        QLThumbnailGenerationRequest, QLThumbnailGenerationRequestRepresentationTypes,
        QLThumbnailGenerator, QLThumbnailRepresentation,
    };
    use std::sync::mpsc::channel;
    use tauri_nspanel::objc2::AllocAnyThread;
    use tauri_nspanel::objc2_foundation::{NSError, NSString, NSURL};

    let url = NSURL::fileURLWithPath(&NSString::from_str(path));
    let request = unsafe {
        QLThumbnailGenerationRequest::initWithFileAtURL_size_scale_representationTypes(
            QLThumbnailGenerationRequest::alloc(),
            &url,
            CGSize {
                width: size,
                height: size,
            },
            2.0,
            QLThumbnailGenerationRequestRepresentationTypes::Thumbnail,
        )
    };

    let (tx, rx) = channel::<Result<Vec<u8>, String>>();
    let block = RcBlock::new(
        move |rep: *mut QLThumbnailRepresentation, error: *mut NSError| {
            let result = if rep.is_null() {
                if error.is_null() {
                    Err("サムネイルを生成できませんでした".to_string())
                } else {
                    Err(unsafe { (*error).localizedDescription().to_string() })
                }
            } else {
                let image = unsafe { (*rep).NSImage() };
                crate::commands::icons::nsimage_to_png(&image)
            };
            let _ = tx.send(result);
        },
    );

    unsafe {
        QLThumbnailGenerator::sharedGenerator()
            .generateBestRepresentationForRequest_completionHandler(&request, &block);
    }

    rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "サムネイル生成がタイムアウトしました".to_string())?
}
