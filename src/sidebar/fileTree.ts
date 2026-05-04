import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_EXTENSIONS = [
  "lua", "js", "mjs", "cjs", "ts", "tsx", "jsx",
  "py", "swift", "rs", "go",
  "c", "cc", "cpp", "h", "hpp",
  "java", "kt", "rb", "php",
  "css", "scss", "html",
  "json", "yaml", "yml", "toml",
  "md", "txt",
];

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[] | null;
  expanded: boolean;
  parent: TreeNode | null;
}

export interface FileTreeOptions {
  container: HTMLElement;
  folderLabel?: HTMLElement;
  onSelect: (path: string) => void;
  extensions?: string[];
}

export class FileTree {
  private container: HTMLElement;
  private folderLabel?: HTMLElement;
  private onSelect: (path: string) => void;
  private extensions: Set<string>;
  private root: TreeNode | null = null;
  private selectedPath: string | null = null;
  private visibleNodes: TreeNode[] = [];
  private focusedIndex = -1;

  constructor(opts: FileTreeOptions) {
    this.container = opts.container;
    this.folderLabel = opts.folderLabel;
    this.onSelect = opts.onSelect;
    this.extensions = new Set(opts.extensions ?? DEFAULT_EXTENSIONS);
  }

  async openDirectory(dirPath: string) {
    const node: TreeNode = {
      name: basename(dirPath),
      path: dirPath,
      isDir: true,
      children: null,
      expanded: true,
      parent: null,
    };
    await this.loadChildren(node);
    this.root = node;
    this.focusedIndex = -1;
    if (this.folderLabel) this.folderLabel.textContent = dirPath;
    this.render();
  }

  selectPath(path: string) {
    this.selectedPath = path;
    this.render();
  }

  currentRoot(): string | null {
    return this.root?.path ?? null;
  }

  focus() {
    this.container.focus();
    if (this.focusedIndex < 0 || this.focusedIndex >= this.visibleNodes.length) {
      const selectedIdx = this.selectedPath
        ? this.visibleNodes.findIndex((n) => n.path === this.selectedPath)
        : -1;
      this.focusedIndex = selectedIdx >= 0 ? selectedIdx : (this.visibleNodes.length > 0 ? 0 : -1);
      this.render();
      this.scrollFocusedIntoView();
    }
  }

  bindKeyboard() {
    this.container.addEventListener("keydown", this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.visibleNodes.length === 0) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const ensureFocus = () => {
      if (this.focusedIndex < 0) this.focusedIndex = 0;
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        ensureFocus();
        this.focusedIndex = Math.min(this.focusedIndex + 1, this.visibleNodes.length - 1);
        this.render();
        this.scrollFocusedIntoView();
        break;
      case "ArrowUp":
        e.preventDefault();
        ensureFocus();
        this.focusedIndex = Math.max(this.focusedIndex - 1, 0);
        this.render();
        this.scrollFocusedIntoView();
        break;
      case "ArrowRight": {
        e.preventDefault();
        ensureFocus();
        const node = this.visibleNodes[this.focusedIndex];
        if (node.isDir) {
          if (!node.expanded) {
            void this.toggleDir(node);
          } else if (this.focusedIndex < this.visibleNodes.length - 1) {
            this.focusedIndex += 1;
            this.render();
            this.scrollFocusedIntoView();
          }
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        ensureFocus();
        const node = this.visibleNodes[this.focusedIndex];
        if (node.isDir && node.expanded) {
          void this.toggleDir(node);
        } else if (node.parent && node.parent !== this.root) {
          const parentIdx = this.visibleNodes.indexOf(node.parent);
          if (parentIdx >= 0) {
            this.focusedIndex = parentIdx;
            this.render();
            this.scrollFocusedIntoView();
          }
        }
        break;
      }
      case "Enter": {
        e.preventDefault();
        ensureFocus();
        const node = this.visibleNodes[this.focusedIndex];
        if (node.isDir) {
          void this.toggleDir(node);
        } else {
          this.selectedPath = node.path;
          this.render();
          this.onSelect(node.path);
        }
        break;
      }
      case "Home":
        e.preventDefault();
        this.focusedIndex = 0;
        this.render();
        this.scrollFocusedIntoView();
        break;
      case "End":
        e.preventDefault();
        this.focusedIndex = this.visibleNodes.length - 1;
        this.render();
        this.scrollFocusedIntoView();
        break;
    }
  };

  private scrollFocusedIntoView() {
    const row = this.container.querySelector(".tree-row.focused") as HTMLElement | null;
    row?.scrollIntoView({ block: "nearest" });
  }

  private async loadChildren(node: TreeNode) {
    try {
      const entries = await invoke<DirEntry[]>("read_dir", {
        path: node.path,
      });
      node.children = entries
        .filter((e) => e.is_dir || this.allowed(e.name))
        .map((e) => ({
          name: e.name,
          path: e.path,
          isDir: e.is_dir,
          children: null,
          expanded: false,
          parent: node,
        }));
    } catch (err) {
      console.error("read_dir failed:", err);
      node.children = [];
    }
  }

  private allowed(name: string): boolean {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return this.extensions.has(ext);
  }

  private async toggleDir(node: TreeNode) {
    if (!node.isDir) return;
    if (!node.expanded) {
      if (!node.children) await this.loadChildren(node);
      node.expanded = true;
    } else {
      node.expanded = false;
    }
    this.render();
  }

  private render() {
    this.container.innerHTML = "";
    this.visibleNodes = [];
    if (!this.root) {
      const empty = document.createElement("div");
      empty.className = "tree-row";
      empty.style.color = "#555";
      empty.textContent = "(no folder open)";
      this.container.appendChild(empty);
      return;
    }
    if (!this.root.children) return;
    for (const child of this.root.children) {
      this.renderNode(child, 0);
    }
    if (this.focusedIndex >= this.visibleNodes.length) {
      this.focusedIndex = this.visibleNodes.length - 1;
    }
  }

  private renderNode(node: TreeNode, depth: number) {
    const index = this.visibleNodes.length;
    this.visibleNodes.push(node);

    const row = document.createElement("div");
    row.className = "tree-row";
    if (node.isDir) row.classList.add("dir");
    if (node.path === this.selectedPath) row.classList.add("selected");
    if (index === this.focusedIndex) row.classList.add("focused");
    row.style.paddingLeft = `${4 + depth * 14}px`;

    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = node.isDir ? (node.expanded ? "▾" : "▸") : "";
    row.appendChild(chevron);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = node.name;
    row.appendChild(name);

    row.title = node.path;
    row.addEventListener("click", () => {
      this.focusedIndex = this.visibleNodes.indexOf(node);
      if (node.isDir) {
        void this.toggleDir(node);
      } else {
        this.selectedPath = node.path;
        this.render();
        this.onSelect(node.path);
      }
    });

    this.container.appendChild(row);

    if (node.isDir && node.expanded && node.children) {
      for (const child of node.children) {
        this.renderNode(child, depth + 1);
      }
    }
  }
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1);
}
