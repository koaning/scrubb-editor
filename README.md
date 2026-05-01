# scrubb

A code editor with Bret-Victor-style scrubbable numeric literals, built on Tauri + Vite + TypeScript + Monaco.

Drag horizontally on a number in the editor to scrub its value live. Hold Shift while dragging for finer steps.

## Prerequisites

- Node 18+ and npm
- Rust toolchain (`rustup`, `cargo`) — Rust ≥ 1.77
- macOS: Xcode Command Line Tools (for Tauri builds)

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install JS dependencies |
| `npm run dev` | Start the Vite dev server at `http://localhost:1420` (browser-only, no native shell) |
| `npm run tauri:dev` | Run the full desktop app with hot reload |
| `npm run build` | Production build of the frontend into `dist/` |
| `npm run tauri:build` | Build a release desktop binary |
| `npm test` | Run unit tests (vitest) |
| `npm run test:watch` | Watch mode for vitest |
