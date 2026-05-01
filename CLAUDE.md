# scrubb — orientation for Claude

A desktop code editor with drag-to-scrub numeric literals.

## Stack

- Tauri v2 (desktop shell, Rust backend)
- Vite + TypeScript (frontend build & dev server)
- Monaco Editor (the editor surface)
- Vitest (unit tests)

## Where things live

- `src/main.ts` — app orchestrator: wires Monaco, the file tree, tabs, the scrub controller, and the status bar; owns keyboard shortcuts.
- `src/scrub/` — the drag-to-edit-numbers feature.
  - `numberScanner.ts` — finds numeric literals in source text.
  - `decorations.ts` — applies the `scrubbable` Monaco decoration, filtering out tokens that lie inside strings/comments.
  - `scrubController.ts` — mouse handling for the drag interaction.
  - `numberScanner.test.ts` — vitest unit tests for the scanner.
- `src/sidebar/fileTree.ts` — folder browser panel.
- `src/tabs/tabBar.ts` — tab bar for open files; manages Monaco model lifecycle.
- `src-tauri/src/lib.rs` — Rust commands exposed to the frontend (`read_dir`, `read_file`, `write_file`).
- `src-tauri/tauri.conf.json` — window/title/identifier/bundle settings.

## Tests

- Run with `npm test`.
- Tests live next to source as `*.test.ts`.
