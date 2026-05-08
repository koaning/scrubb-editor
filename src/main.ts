import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ScrubDecorations } from "./scrub/decorations";
import { ScrubController } from "./scrub/scrubController";
import { FileTree } from "./sidebar/fileTree";
import { attachSidebarResizer, loadSidebarWidth } from "./sidebar/sidebarResizer";
import { TabBar } from "./tabs/tabBar";

const SIDEBAR_COLLAPSED_KEY = "scrubb.sidebarCollapsed";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

const EXT_TO_LANG: Record<string, string> = {
  lua: "lua", js: "javascript", mjs: "javascript", cjs: "javascript",
  jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", swift: "swift", rs: "rust", go: "go",
  c: "c", cc: "cpp", cpp: "cpp", h: "cpp", hpp: "cpp",
  java: "java", kt: "kotlin", rb: "ruby", php: "php",
  css: "css", scss: "scss", html: "html",
  json: "json", yaml: "yaml", yml: "yaml", toml: "ini",
  md: "markdown", txt: "plaintext",
};

monaco.editor.defineTheme("scrubb-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#14141c",
    "editor.foreground": "#ebebeb",
    "editorLineNumber.foreground": "#3a3a48",
    "editorLineNumber.activeForeground": "#888",
    "editorCursor.foreground": "#ebebeb",
    "editor.selectionBackground": "#2e3852",
    "editor.lineHighlightBackground": "#1a1a26",
  },
});

const appEl = document.getElementById("app")!;
const sidebarResizer = document.getElementById("sidebar-resizer")!;
const editorHost = document.getElementById("editor-host")!;
const sidebarList = document.getElementById("file-list")!;
const folderName = document.getElementById("folder-name")!;
const openBtn = document.getElementById("open-folder")!;
const tabBarHost = document.getElementById("tab-bar")!;
const statusPath = document.getElementById("status-path")!;
const statusTokens = document.getElementById("status-tokens")!;

const savedWidth = loadSidebarWidth();
if (savedWidth !== null) {
  appEl.style.setProperty("--sidebar-width", `${savedWidth}px`);
}
if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
  appEl.classList.add("sidebar-collapsed");
}

attachSidebarResizer({ app: appEl, handle: sidebarResizer });

function toggleSidebar() {
  const collapsed = appEl.classList.toggle("sidebar-collapsed");
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}

function focusSidebar() {
  appEl.classList.remove("sidebar-collapsed");
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "0");
  } catch {
    // ignore
  }
  tree.focus();
}

const editor = monaco.editor.create(editorHost, {
  value: "",
  language: "plaintext",
  theme: "scrubb-dark",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
  fontSize: 14,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  renderLineHighlight: "none",
  smoothScrolling: true,
  padding: { top: 16, bottom: 16 },
});
editor.setModel(null);

const decorations = new ScrubDecorations(editor);
let saveInFlight = false;
let pendingSave = false;
const lastSavedContent = new Map<string, string>();
let pendingReload: { path: string; contents: string } | null = null;

function applyReload(path: string, contents: string) {
  const model = tabBar.findModel(path);
  if (!model) return;
  if (model.getValue() === contents) return;
  const range = model.getFullModelRange();
  model.pushStackElement();
  model.pushEditOperations(
    [],
    [{ range, text: contents }],
    () => null,
  );
  model.pushStackElement();
  lastSavedContent.set(path, contents);
}

const tabBar = new TabBar({
  container: tabBarHost,
  editor,
  onActivePathChange: (path) => {
    statusPath.textContent = path ?? "no file";
    refreshDecorations();
    requestAnimationFrame(refreshDecorations);
    setTimeout(refreshDecorations, 100);
  },
  onOpen: (path, contents) => {
    lastSavedContent.set(path, contents);
    void invoke("watch_file", { path });
  },
  onClose: (path) => {
    lastSavedContent.delete(path);
    void invoke("unwatch_file", { path });
  },
});

const tree = new FileTree({
  container: sidebarList,
  folderLabel: folderName,
  onSelect: (path) => void openFile(path),
});
tree.bindKeyboard();

const scrub = new ScrubController({
  editor,
  getTokens: () => decorations.tokens(),
  onLiveChange: () => requestSave(),
  onScrubEnd: () => {
    refreshDecorations();
    requestSave();
    if (pendingReload) {
      applyReload(pendingReload.path, pendingReload.contents);
      pendingReload = null;
    }
  },
  onHoverChange: (tok) => {
    if (tok) {
      statusTokens.textContent = `hover: ${tok.text} (drag to scrub)`;
    } else {
      const n = decorations.tokens().length;
      statusTokens.textContent = `${n} scrubbables`;
    }
  },
});
void scrub;

editor.onDidChangeModelContent(() => {
  refreshDecorations();
  requestSave();
});

editor.onDidChangeModelLanguage(() => refreshDecorations());

function refreshDecorations() {
  const model = editor.getModel();
  if (!model) {
    statusTokens.textContent = "0 scrubbables";
    return;
  }
  const tokens = decorations.rescan(model);
  statusTokens.textContent = `${tokens.length} scrubbables`;
}

async function requestSave() {
  const path = tabBar.activePath();
  if (!path) return;
  const contents = editor.getValue();
  if (lastSavedContent.get(path) === contents) return;
  if (saveInFlight) {
    pendingSave = true;
    return;
  }
  saveInFlight = true;
  try {
    await invoke("write_file", { path, contents });
    lastSavedContent.set(path, contents);
  } catch (err) {
    console.error("save failed:", err);
  } finally {
    saveInFlight = false;
    if (pendingSave) {
      pendingSave = false;
      void requestSave();
    }
  }
}

async function openFile(path: string) {
  try {
    const contents = await invoke<string>("read_file", { path });
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const lang = EXT_TO_LANG[ext] ?? "plaintext";
    tabBar.open(path, contents, lang);
    tree.selectPath(path);
  } catch (err) {
    console.error("load failed:", err);
  }
}

async function pickFolder() {
  const result = await openDialog({ directory: true, multiple: false });
  if (typeof result === "string") {
    tabBar.closeAll();
    await tree.openDirectory(result);
  }
}

openBtn.addEventListener("click", () => void pickFolder());

window.addEventListener("keydown", (e) => {
  const cmd = e.metaKey || e.ctrlKey;
  if (!cmd) return;
  if (e.code === "KeyO" && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    void pickFolder();
  } else if (e.code === "BracketLeft" && e.shiftKey) {
    e.preventDefault();
    tabBar.prev();
  } else if (e.code === "BracketRight" && e.shiftKey) {
    e.preventDefault();
    tabBar.next();
  } else if (e.code === "KeyW" && !e.shiftKey) {
    e.preventDefault();
    tabBar.closeActive();
  } else if (e.code === "KeyS" && !e.shiftKey) {
    e.preventDefault();
    void requestSave();
  } else if (e.code === "KeyB" && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    toggleSidebar();
  } else if (e.code === "Digit0" && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    focusSidebar();
  }
});

interface FileChangedPayload {
  path: string;
  kind: "modified" | "removed" | "error";
  contents: string;
}

void listen<FileChangedPayload>("file-changed", (e) => {
  const { path, kind, contents } = e.payload;
  if (kind !== "modified") return;
  if (scrub.isActive() && path === tabBar.activePath()) {
    pendingReload = { path, contents };
    return;
  }
  applyReload(path, contents);
});

void (async () => {
  try {
    const initial = await invoke<string | null>("get_initial_folder");
    if (initial) {
      await tree.openDirectory(initial);
    }
  } catch (err) {
    console.error("get_initial_folder failed:", err);
  }
})();
