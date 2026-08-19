use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use notify::RecommendedWatcher;
use notify_debouncer_mini::Debouncer;
use rusqlite::Connection;

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn init(dir: &std::path::Path) -> Result<Self, String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let conn = Connection::open(dir.join("frecency.sqlite")).map_err(|e| e.to_string())?;
        Self::configure(&conn);
        Self::init_schema(&conn)?;
        Ok(Self(Mutex::new(conn)))
    }

    pub fn in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        Self::init_schema(&conn)?;
        Ok(Self(Mutex::new(conn)))
    }

    fn configure(conn: &Connection) {
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    }

    fn init_schema(conn: &Connection) -> Result<(), String> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS visits (
                path TEXT PRIMARY KEY,
                rank REAL NOT NULL,
                last_visit INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}

pub struct TaskRegistry {
    next_id: AtomicU64,
    flags: Mutex<HashMap<u64, Arc<AtomicBool>>>,
}

impl TaskRegistry {
    pub fn new() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            flags: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self) -> (u64, Arc<AtomicBool>) {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let flag = Arc::new(AtomicBool::new(false));
        self.flags.lock().unwrap().insert(id, flag.clone());
        (id, flag)
    }

    pub fn cancel(&self, id: u64) {
        if let Some(flag) = self.flags.lock().unwrap().get(&id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    pub fn unregister(&self, id: u64) {
        self.flags.lock().unwrap().remove(&id);
    }
}

pub struct AppState {
    pub watchers: Mutex<HashMap<PathBuf, Debouncer<RecommendedWatcher>>>,
    pub tasks: TaskRegistry,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
            tasks: TaskRegistry::new(),
        }
    }
}
