ICON_SRC := src-tauri/icons/logo-c-double-b.svg
ICON_OUT := src-tauri/icons/icon.icns

.PHONY: help dev build app install test icons clean

help:
	@echo "Targets:"
	@echo "  dev      - run the Tauri app in dev mode"
	@echo "  build    - build the Tauri app (all bundle targets)"
	@echo "  app      - build only the macOS .app bundle"
	@echo "  install  - build the .app and copy it to /Applications"
	@echo "  test     - run vitest"
	@echo "  icons    - regenerate icon files from $(ICON_SRC)"
	@echo "  clean    - remove dist/ and src-tauri/target/"

icons: $(ICON_OUT)

$(ICON_OUT): $(ICON_SRC)
	npx --yes @tauri-apps/cli icon $(ICON_SRC) -o src-tauri/icons
	@# Tauri's icon CLI emits assets for every platform; drop the mobile
	@# and Windows Store SKUs we don't ship, but keep icon.ico and the
	@# PNGs that the Windows / Linux bundlers consume.
	rm -rf src-tauri/icons/ios src-tauri/icons/android
	rm -f src-tauri/icons/Square*Logo.png src-tauri/icons/StoreLogo.png

dev:
	npm run tauri:dev

build: icons
	npm run tauri:build

app: icons
	npm run tauri:build:app

install: app
	rm -rf /Applications/scrubb.app
	cp -R src-tauri/target/release/bundle/macos/scrubb.app /Applications/

test:
	npm test

clean:
	rm -rf dist src-tauri/target
