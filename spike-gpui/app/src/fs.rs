//! Filesystem helpers lifted almost verbatim from `src-tauri/src/lib.rs`, with the
//! `#[tauri::command]` attributes and `State`/`AppHandle` plumbing removed so they are
//! plain in-process functions. The `notify`-based file watcher is intentionally left out
//! of the spike (noted as a TODO in the README).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: PathBuf,
    pub is_dir: bool,
}

/// Port of `read_dir`: lists a directory, skipping dotfiles, dirs-first then
/// case-insensitive by name.
pub fn read_dir(path: &Path) -> Result<Vec<DirEntry>, String> {
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
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
            path: entry.path(),
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

/// Port of `read_file`.
pub fn read_file(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Port of `write_file`. Unlike scrubb (which autosaves on every edit), the spike only
/// writes on an explicit Cmd/Ctrl+S, so scrubbing never silently mutates a real file.
pub fn write_file(path: &Path, contents: &str) -> Result<(), String> {
    fs::write(path, contents).map_err(|e| e.to_string())
}

/// Port of `get_initial_folder`: first non-flag CLI arg, else `SCRUBB_INITIAL_FOLDER`,
/// canonicalized and verified to be a directory.
pub fn get_initial_folder() -> Option<PathBuf> {
    let candidate = env::args()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .or_else(|| env::var("SCRUBB_INITIAL_FOLDER").ok())?;
    let abs = fs::canonicalize(PathBuf::from(&candidate)).ok()?;
    if abs.is_dir() {
        Some(abs)
    } else {
        None
    }
}

/// File extension -> the language name gpui-component's tree-sitter registry understands
/// (see `crates/ui/src/highlighter/languages.rs`). Unknown extensions fall back to
/// "text" (no grammar -> plain, unhighlighted).
pub fn language_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "rs" => "rust",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "ts" => "typescript",
        "tsx" => "tsx",
        "py" => "python",
        "go" => "go",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" => "cpp",
        "cs" => "csharp",
        "java" => "java",
        "kt" | "kts" => "kotlin",
        "rb" => "ruby",
        "php" => "php",
        "swift" => "swift",
        "scala" => "scala",
        "zig" => "zig",
        "lua" => "lua",
        "sh" | "bash" => "bash",
        "sql" => "sql",
        "json" => "json",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "md" | "markdown" => "markdown",
        "html" | "htm" => "html",
        "css" => "css",
        _ => "text",
    }
}
