# Developers

Notes for working on scrubb locally and cutting releases.

## Prerequisites

- Node 18+ and npm
- Rust toolchain (`rustup`, `cargo`) with Rust 1.77+
- macOS: Xcode Command Line Tools for Tauri builds

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install JS dependencies |
| `npm run dev` | Start the Vite dev server at `http://localhost:1420` without the native shell |
| `npm run tauri:dev` | Run the full desktop app with hot reload |
| `npm run tauri:dev:here` | Run the desktop app and open the current working directory |
| `npm run build` | Build the frontend into `dist/` |
| `npm run tauri:build` | Build all configured Tauri bundles |
| `npm run tauri:build:app` | Build only the macOS `.app` bundle |
| `npm run tauri:install` | Build the `.app` and copy it to `/Applications`, replacing any existing `scrubb.app` |
| `npm test` | Run unit tests with vitest |
| `npm run test:watch` | Run vitest in watch mode |
| `make dev` | Run `npm run tauri:dev` |
| `make app` | Regenerate icons and build the `.app` bundle |
| `make build` | Regenerate icons and build all configured Tauri bundles |
| `make install` | Regenerate icons, build the `.app`, and copy it to `/Applications` |
| `make test` | Run `npm test` |
| `make icons` | Regenerate Tauri icon assets from `src-tauri/icons/logo-c-double-b.svg` |
| `make clean` | Remove `dist/` and `src-tauri/target/` |

## Local Workflow

scrubb can open a folder automatically on startup, picked from this order:

1. The first non-flag command-line argument: `scrubb /path/to/folder`
2. The `SCRUBB_INITIAL_FOLDER` environment variable

The path must be an existing directory. Anything else is ignored and the app starts on the empty welcome state.

`npm run tauri:dev:here` uses `SCRUBB_INITIAL_FOLDER="$PWD"` to open the project root during development.

To see the effect of scrubbing on a Python script in real time, run a watcher alongside scrubb:

```sh
uvx watchfiles "python demofile.py" demofile.py
```

Every save in scrubb triggers a fresh run, so dragging on a number gives you a scrub, save, re-execute loop.

## Builds

`npm run tauri:build:app` produces:

```text
src-tauri/target/release/bundle/macos/scrubb.app
```

`npm run tauri:install` and `make install` copy that bundle to `/Applications`, replacing any existing `scrubb.app`.

`npm run tauri:build` builds all configured Tauri targets. On macOS that includes the `.app` bundle and a `.dmg` in:

```text
src-tauri/target/release/bundle/dmg/
```

The DMG step can prompt for Finder Automation permission so the window can be styled.

## Project Page

The project page is built straight from `docs/`. To publish it, enable GitHub Pages in the repo settings with:

- Source: Deploy from a branch
- Branch: `main` / `/docs`

## Releasing

Cross-platform installers are built by the `release` GitHub Action. It runs on macOS, Linux, and Windows, and attaches artifacts to a draft GitHub Release.

To cut a release:

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Commit and push to `main`.
3. Tag and push, for example: `git tag v0.1.0 && git push origin v0.1.0`.
4. Wait for the release workflow in the **Actions** tab.
5. Edit the draft release on GitHub, write release notes, and publish.
