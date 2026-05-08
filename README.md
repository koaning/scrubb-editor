# scrubb

A code editor with Bret-Victor-style scrubbable numeric literals, built on Tauri + Vite + TypeScript + Monaco.

Drag horizontally on a number in the editor to scrub its value live. Hold Shift while dragging for finer steps.

## Installing

There are no prebuilt downloads yet, so you build it locally from this repo.

```
git clone https://github.com/koaning/scrubb-editor.git
cd scrubb-editor
npm install
npm run tauri:install    # or: make install
```

This builds `src-tauri/target/release/bundle/macos/scrubb.app` and copies it to `/Applications` (overwriting any existing `scrubb.app` there). To build without installing, run `npm run tauri:build:app` (or `make app`) and drag the resulting bundle in yourself.

Because the build is unsigned, macOS will Gatekeeper-block the first launch. Right-click the app → **Open** → **Open** to whitelist it once; subsequent launches work normally.

Prefer a `.dmg` installer? Run `npm run tauri:build` (or `make build`) — macOS will prompt once for Finder Automation permission so the DMG window can be styled. The `.dmg` lands in `src-tauri/target/release/bundle/dmg/`.

### Adding a `scrubb` CLI shortcut

Symlink the bundled binary onto your `PATH` so you can launch the editor from any terminal:

```
sudo ln -s /Applications/scrubb.app/Contents/MacOS/scrubb /usr/local/bin/scrubb
```

Then `scrubb .` opens the current folder, `scrubb ~/code/myproject` opens that folder, and so on. Append `&` if you want the terminal prompt back immediately (`scrubb . &`).

If `/usr/local/bin` isn't on your `PATH` (Apple Silicon Homebrew uses `/opt/homebrew/bin` instead), substitute a directory that is.

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
| `npm run tauri:dev:here` | Same as `tauri:dev`, but auto-opens the current working directory as the workspace folder |
| `npm run build` | Production build of the frontend into `dist/` |
| `npm run tauri:build` | Build a release desktop binary (produces `.app` + `.dmg`; the `.dmg` step needs Finder Automation permission — see [TODO.md](TODO.md)) |
| `npm run tauri:build:app` | Build only the `.app` bundle, skipping the DMG/AppleScript step |
| `npm run tauri:install` | Build the `.app` and copy it to `/Applications` (replacing any existing `scrubb.app`) |
| `npm test` | Run unit tests (vitest) |
| `npm run test:watch` | Watch mode for vitest |

## Opening a folder at launch

scrubb can open a folder automatically on startup, picked from (in order):

1. The first non-flag command-line argument: `scrubb /path/to/folder`
2. The `SCRUBB_INITIAL_FOLDER` environment variable

The path must be an existing directory — anything else is ignored and the app starts on the empty welcome state. `npm run tauri:dev:here` uses the env-var form to pre-load the project root during development.

## Live-running a Python file while you scrub

To see the effect of scrubbing on a script in real time, run a watcher in a terminal alongside scrubb. The simplest setup uses [`watchfiles`](https://github.com/samuelcolvin/watchfiles) via `uv`:

```
uvx watchfiles "python demofile.py" demofile.py
```

The first argument is the command to re-run; the second is the path to watch (a file or directory). Every save in scrubb triggers a fresh run, so dragging on a number gives you a tight scrub → save → re-execute loop.

## Releasing

Cross-platform installers are built by the `release` GitHub Action (`.github/workflows/release.yml`). It runs on macOS (universal arm64 + x86_64), Linux (Ubuntu 22.04), and Windows, and attaches the artifacts to a draft GitHub Release.

To cut a release:

1. Bump the version in three places: `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Commit and push to `main`.
3. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
4. Wait for the workflow in the **Actions** tab — Linux ~5 min, macOS ~10–12 min, Windows ~7 min.
5. Edit the draft release on GitHub, write release notes, and publish.
