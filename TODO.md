# TODO

## Real macOS distribution

Right now `npm run tauri:build:app` produces an unsigned `.app`. That's fine for local use but Gatekeeper will block it on any other machine. To actually ship to users:

- [ ] Apple Developer Program membership ($99/yr) — needed to issue a Developer ID Application certificate.
- [ ] Configure code signing in `src-tauri/tauri.conf.json` under `bundle.macOS.signingIdentity`.
- [ ] Set up notarization credentials (`APPLE_ID` + app-specific password, or App Store Connect API key) and confirm `tauri build` runs `notarytool` + `staple` end-to-end.
- [ ] Decide on a bundle format. Default plan: ship a signed+notarized `.app` inside a `.tar.gz` (or `.zip`), served from GitHub Releases. Skip the DMG unless we want it for branding — the AppleScript-driven layout step costs more than it's worth.
- [ ] Build a universal binary: `tauri build --target universal-apple-darwin` so the app runs on Intel Macs too (currently aarch64-only).
- [ ] Wire up `tauri-plugin-updater` so users get patches automatically instead of re-downloading.
- [ ] Pick a distribution channel — direct download from a site, GitHub Releases, Homebrew Cask, etc.

## If we ever do want the DMG layout

`bundle_dmg.sh` fails on this machine because the parent process doesn't have **System Settings → Privacy & Security → Automation → Finder** turned on for whatever shell is running `tauri build`. Granting that one permission and re-running `npm run tauri:build` would produce the full DMG with the drag-to-Applications layout.
