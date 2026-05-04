ICON_SRC := src-tauri/icons/logo-c-double-b.svg
ICON_OUT := src-tauri/icons/icon.icns

.PHONY: help dev build app test icons clean

help:
	@echo "Targets:"
	@echo "  dev    - run the Tauri app in dev mode"
	@echo "  build  - build the Tauri app (all bundle targets)"
	@echo "  app    - build only the macOS .app bundle"
	@echo "  test   - run vitest"
	@echo "  icons  - regenerate icon files from $(ICON_SRC)"
	@echo "  clean  - remove dist/ and src-tauri/target/"

icons: $(ICON_OUT)

$(ICON_OUT): $(ICON_SRC)
	npx tauri icon $(ICON_SRC) -o src-tauri/icons
	@# Tauri's icon CLI emits assets for every platform; keep only the
	@# files referenced by tauri.conf.json's bundle.icon array.
	rm -rf src-tauri/icons/ios src-tauri/icons/android
	rm -f src-tauri/icons/Square*Logo.png src-tauri/icons/StoreLogo.png \
	      src-tauri/icons/icon.ico src-tauri/icons/icon.png \
	      src-tauri/icons/64x64.png

dev:
	npm run tauri:dev

build: icons
	npm run tauri:build

app: icons
	npm run tauri:build:app

test:
	npm test

clean:
	rm -rf dist src-tauri/target
