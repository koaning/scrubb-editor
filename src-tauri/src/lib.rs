use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Default)]
struct WatcherState {
    debouncer: Mutex<Option<Debouncer<RecommendedWatcher, FileIdMap>>>,
    watched: Mutex<HashSet<PathBuf>>,
}

#[derive(Clone, Serialize)]
struct FileChangedPayload {
    path: String,
    kind: String,
    contents: String,
}

#[tauri::command]
fn read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let p = PathBuf::from(&path);
    let entries = fs::read_dir(&p).map_err(|e| e.to_string())?;
    let mut out: Vec<DirEntry> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        out.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
        });
    }
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(Path::new(&path), contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_initial_folder() -> Option<String> {
    let candidate = env::args()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .or_else(|| env::var("SCRUBB_INITIAL_FOLDER").ok());
    let raw = candidate?;
    let p = PathBuf::from(&raw);
    let abs = fs::canonicalize(&p).ok()?;
    if abs.is_dir() {
        Some(abs.to_string_lossy().into_owned())
    } else {
        None
    }
}

fn safe_canonicalize(p: &Path) -> PathBuf {
    if let Ok(c) = fs::canonicalize(p) {
        return c;
    }
    if let (Some(parent), Some(name)) = (p.parent(), p.file_name()) {
        if let Ok(c) = fs::canonicalize(parent) {
            return c.join(name);
        }
    }
    p.to_path_buf()
}

fn handle_events(app: &AppHandle, result: DebounceEventResult) {
    let events = match result {
        Ok(events) => events,
        Err(errors) => {
            for err in errors {
                eprintln!("file watcher error: {err:?}");
            }
            return;
        }
    };

    let state = app.state::<WatcherState>();
    let watched: HashSet<PathBuf> = match state.watched.lock() {
        Ok(g) => g.clone(),
        Err(_) => return,
    };

    let mut emitted: HashSet<PathBuf> = HashSet::new();

    for event in events {
        for raw_path in &event.paths {
            let canonical = safe_canonicalize(raw_path);
            if !watched.contains(&canonical) {
                continue;
            }
            if !emitted.insert(canonical.clone()) {
                continue;
            }

            let payload = if !canonical.exists() {
                FileChangedPayload {
                    path: canonical.to_string_lossy().into_owned(),
                    kind: "removed".to_string(),
                    contents: String::new(),
                }
            } else {
                match fs::read_to_string(&canonical) {
                    Ok(contents) => FileChangedPayload {
                        path: canonical.to_string_lossy().into_owned(),
                        kind: "modified".to_string(),
                        contents,
                    },
                    Err(e) => {
                        eprintln!(
                            "file watcher read failed {}: {}",
                            canonical.display(),
                            e
                        );
                        FileChangedPayload {
                            path: canonical.to_string_lossy().into_owned(),
                            kind: "error".to_string(),
                            contents: String::new(),
                        }
                    }
                }
            };

            if let Err(e) = app.emit("file-changed", &payload) {
                eprintln!("emit file-changed failed: {e}");
            }
        }
    }
}

#[tauri::command]
fn watch_file(
    state: State<'_, WatcherState>,
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    let canonical = safe_canonicalize(Path::new(&path));

    let mut watched = state.watched.lock().map_err(|e| e.to_string())?;
    if watched.contains(&canonical) {
        return Ok(());
    }

    let mut debouncer_guard = state.debouncer.lock().map_err(|e| e.to_string())?;
    if debouncer_guard.is_none() {
        let app_for_cb = app.clone();
        let debouncer = new_debouncer(
            Duration::from_millis(150),
            None,
            move |result: DebounceEventResult| handle_events(&app_for_cb, result),
        )
        .map_err(|e| e.to_string())?;
        *debouncer_guard = Some(debouncer);
    }

    let debouncer = debouncer_guard.as_mut().unwrap();
    debouncer
        .watcher()
        .watch(&canonical, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    watched.insert(canonical);

    Ok(())
}

#[tauri::command]
fn unwatch_file(state: State<'_, WatcherState>, path: String) -> Result<(), String> {
    let canonical = safe_canonicalize(Path::new(&path));

    let mut watched = state.watched.lock().map_err(|e| e.to_string())?;
    if !watched.remove(&canonical) {
        return Ok(());
    }

    let mut debouncer_guard = state.debouncer.lock().map_err(|e| e.to_string())?;
    if let Some(debouncer) = debouncer_guard.as_mut() {
        let _ = debouncer.watcher().unwatch(&canonical);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            read_dir,
            read_file,
            write_file,
            get_initial_folder,
            watch_file,
            unwatch_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running scrubb");
}
