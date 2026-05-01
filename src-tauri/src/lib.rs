use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_dir,
            read_file,
            write_file,
            get_initial_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running scrubb");
}
