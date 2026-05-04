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
| `npm run tauri:dev:here` | Same as `tauri:dev`, but auto-opens the current working directory as the workspace folder |
| `npm run build` | Production build of the frontend into `dist/` |
| `npm run tauri:build` | Build a release desktop binary (produces `.app` + `.dmg`; the `.dmg` step needs Finder Automation permission — see [TODO.md](TODO.md)) |
| `npm run tauri:build:app` | Build only the `.app` bundle, skipping the DMG/AppleScript step |
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

### macOS signing & notarization (optional but recommended)

Without signing, macOS users have to right-click → Open and bypass Gatekeeper. To produce a notarized DMG, add these six secrets to the repo (Settings → Secrets and variables → Actions):

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | `.p12` of your Developer ID Application cert, base64-encoded (`base64 -i cert.p12 \| pbcopy`) |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character team ID from the Apple Developer portal |

The workflow runs even when these are unset — it just skips signing, producing an unsigned DMG. Linux and Windows builds are always unsigned.
