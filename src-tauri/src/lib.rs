mod commands;
#[cfg(target_os = "macos")]
mod panel;
mod state;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

#[tauri::command]
fn hide_panel(app: AppHandle) {
    #[cfg(target_os = "macos")]
    panel::hide(&app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[tauri::command]
fn set_pinned(app: AppHandle, pinned: bool) {
    #[cfg(target_os = "macos")]
    panel::set_pinned(&app, pinned);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, pinned);
}

#[tauri::command]
fn get_pinned() -> bool {
    #[cfg(target_os = "macos")]
    return panel::is_pinned();
    #[cfg(not(target_os = "macos"))]
    false
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "sesam を表示", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "設定", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    TrayIconBuilder::with_id("tray")
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                #[cfg(target_os = "macos")]
                panel::show(app);
            }
            "settings" => {
                #[cfg(target_os = "macos")]
                panel::show(app);
                let _ = tauri::Emitter::emit(app, "open-settings", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn register_hotkey(app: &AppHandle, shortcut: &str) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    app.global_shortcut().unregister_all()?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                panel::toggle(app);
            }
        })?;
    Ok(())
}

#[tauri::command]
fn set_hotkey(app: AppHandle, shortcut: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        register_hotkey(&app, &shortcut).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, shortcut);
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .setup(|app| {
            app.manage(state::AppState::new());
            let config_dir = app
                .path()
                .app_config_dir()
                .map_err(|e| tauri::Error::Anyhow(e.into()))?;
            let db = state::Db::init(&config_dir).or_else(|message| {
                eprintln!("frecency DB の初期化に失敗（メモリ内 DB にフォールバック）: {message}");
                state::Db::in_memory()
            });
            match db {
                Ok(db) => {
                    app.manage(db);
                }
                Err(message) => {
                    eprintln!("frecency DB を初期化できません: {message}");
                }
            }
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                panel::init(app.handle())?;
                let hotkey = commands::config_cmd::load_config(app.handle().clone())
                    .and_then(|config| {
                        config
                            .get("hotkey")
                            .and_then(|value| value.as_str().map(String::from))
                    })
                    .unwrap_or_else(|| "ctrl+p".to_string());
                if register_hotkey(app.handle(), &hotkey).is_err() {
                    register_hotkey(app.handle(), "ctrl+p")?;
                }
            }
            setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_panel,
            set_pinned,
            get_pinned,
            commands::listing::list_dir,
            commands::listing::read_text_head,
            commands::watch::watch_dir,
            commands::watch::unwatch_dir,
            commands::fs_ops::check_conflicts,
            commands::fs_ops::copy_entries,
            commands::fs_ops::move_entries,
            commands::fs_ops::cancel_task,
            commands::fs_ops::trash_entries,
            commands::fs_ops::rename_entry,
            commands::fs_ops::create_folder,
            commands::fs_ops::remove_empty_dir,
            commands::config_cmd::load_config,
            commands::config_cmd::save_config,
            commands::open_with::open_entries,
            commands::open_with::open_with_app,
            commands::open_with::reveal_in_finder,
            commands::open_with::list_applications,
            commands::icons::get_file_icon,
            commands::thumbs::get_thumbnail,
            commands::query::record_visit,
            commands::query::query_jump,
            commands::query::prepare_index,
            commands::query::complete_path,
            commands::archive::create_zip,
            commands::archive::extract_archive,
            set_hotkey
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
