use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager};
use tauri_nspanel::objc2_app_kit::NSScreen;
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

static PINNED: AtomicBool = AtomicBool::new(false);

tauri_panel! {
    panel!(SesamPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false
        }
    })

    panel_event!(SesamPanelEvents {
        window_did_resign_key(notification: &NSNotification) -> ()
    })
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let window = app
        .get_webview_window("main")
        .expect("main window not found");
    let panel = window.to_panel::<SesamPanel>()?;

    panel.set_level(PanelLevel::Floating.value());
    panel.set_style_mask(StyleMask::empty().nonactivating_panel().resizable().value());
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .full_screen_auxiliary()
            .stationary()
            .value(),
    );
    panel.set_floating_panel(true);
    panel.set_hides_on_deactivate(false);

    let handler = SesamPanelEvents::new();
    let app_handle = app.clone();
    handler.window_did_resign_key(move |_notification| {
        if !PINNED.load(Ordering::SeqCst) {
            hide(&app_handle);
        }
    });
    panel.set_event_handler(Some(handler.as_ref()));

    Ok(())
}

pub fn show(app: &AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || show_inner(&app));
}

pub fn hide(app: &AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || hide_inner(&app));
}

pub fn toggle(app: &AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let Ok(panel) = app.get_webview_panel("main") else {
            return;
        };
        if panel.is_visible() {
            hide_inner(&app);
        } else {
            show_inner(&app);
        }
    });
}

pub fn set_pinned(app: &AppHandle, pinned: bool) {
    PINNED.store(pinned, Ordering::SeqCst);
    let _ = app.emit("pin-changed", pinned);
}

pub fn is_pinned() -> bool {
    PINNED.load(Ordering::SeqCst)
}

fn show_inner(app: &AppHandle) {
    let Ok(panel) = app.get_webview_panel("main") else {
        return;
    };
    position_on_active_screen(panel.as_panel());
    panel.show_and_make_key();
    let _ = app.emit("panel-shown", ());
}

fn hide_inner(app: &AppHandle) {
    let Ok(panel) = app.get_webview_panel("main") else {
        return;
    };
    if panel.is_visible() {
        panel.hide();
        let _ = app.emit("panel-hidden", ());
    }
}

fn position_on_active_screen(ns_panel: &tauri_nspanel::NSPanel) {
    let Some(mtm) = tauri_nspanel::objc2::MainThreadMarker::new() else {
        return;
    };
    let Some(screen) = NSScreen::mainScreen(mtm) else {
        return;
    };
    let screen_frame = screen.visibleFrame();
    let window_frame = ns_panel.frame();
    let x = screen_frame.origin.x + (screen_frame.size.width - window_frame.size.width) / 2.0;
    let y = (screen_frame.origin.y
        + (screen_frame.size.height - window_frame.size.height) / 2.0)
        .max(screen_frame.origin.y);
    ns_panel.setFrameOrigin(tauri_nspanel::NSPoint { x, y });
}
