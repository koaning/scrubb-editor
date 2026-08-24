# scrubb port spike — measured results

Head-to-head between the current **Tauri v2 + Vite + TypeScript + Monaco** app and the
**Rust + GPUI** (via `longbridge/gpui-component`) reimplementation in `spike-gpui/`.

All figures are **measured on this machine** (Apple Silicon, macOS), release builds, on
2026-08-24 — not estimates. Method notes are at the bottom.

## Runtime memory (release build, app open on a source file)

| Approach | Resident memory (RSS) |
|---|---|
| **Rust + GPUI** | **86 MB** — single process, no helpers |
| **Tauri + Monaco** | **~330 MB** — main process 119 MB + dedicated `WebKit.WebContent` renderer (Monaco) 192 MB + networking XPC ~20 MB |

GPUI uses roughly **a quarter** of the RAM. The Tauri overhead is the webview: Monaco runs
in its own WebKit content process (~192 MB by itself).

## Shipped app size

| Approach | Size |
|---|---|
| **Tauri + Monaco** | **4.2 MB** `.app` (2.5 MB `.dmg`); Rust binary 4.3 MB |
| **Rust + GPUI** | **55.5 MB** stripped single binary |

Tauri is **~13× smaller to distribute** because it reuses the OS WebView instead of bundling
a renderer; Monaco ships as minified JS in `dist/` (4.3 MB). GPUI bakes the renderer +
~30 tree-sitter grammars into one self-contained binary.

Runtime dependency: Tauri needs the system WebView (WKWebView is always present on macOS;
**WebView2 must be installed on Windows**). GPUI depends on nothing.

## Development disk footprint

| Approach | Size |
|---|---|
| **Tauri + Monaco** | **~1.05 GB** — `src-tauri/target` 888 MB + `node_modules` 159 MB (Monaco 98 MB) + `dist` 4.3 MB |
| **Rust + GPUI** | **3.2 GB** `target/` (with `debug = "line-tables-only"`; ~10 GB with full DWARF) + **~0.93 GB** shared in `~/.cargo` (Zed git checkout 554 MB + git db 378 MB, shared across all Rust projects) |

## Build time (measured, warm caches on this machine)

| Approach | Time |
|---|---|
| **Tauri** release + bundle | ~2 min (`npm install` on top, seconds–minutes) |
| **GPUI** release | ~1m40s wall — **but the first-ever cold build** (fetch + compile the Zed tree) was **~10–15 min** |

## Bottom line

- **Running**: GPUI is far lighter on RAM (86 MB vs ~330 MB) with zero runtime dependency.
- **Shipping**: Tauri is far smaller to distribute (4 MB vs 55 MB) — the "borrow the OS
  webview" win.
- **Developing**: Tauri is lighter and faster (~1 GB, quick builds); GPUI is heavier
  (~3 GB + ~0.9 GB shared) and slow on the first cold build.

Feature parity reached in the spike (drag-to-scrub with live save, tree-sitter syntax
highlighting, file tree, light/dark theme) is documented in `README.md`, along with the
remaining upstream gaps (undo-transaction grouping, tree-sitter node queries for
string/comment exclusion).

## Method notes

- **RAM**: launched each release build on a folder, sampled RSS via `ps -o rss` after the
  window settled. Tauri's WebKit renderer was isolated by diffing `WebKit.WebContent` PIDs
  before/after launch (a fresh 192 MB process spawned for the app); a naive scan is
  misleading because unrelated apps' WebKit processes coexist.
- **Shipped size**: `du -sh` on `scrubb.app` / the stripped `scrubb-spike` binary.
- **Dev disk**: `du -sh` on `target/`, `node_modules/`, `dist/`, and the shared
  `~/.cargo/git` Zed checkout.
- **Build time**: `time` around `cargo build --release` and `npx tauri build`.
- GPUI release binary built with `[profile.release] strip = true`.
