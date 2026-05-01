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
    };
    await this.loadChildren(node);
    this.root = node;
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
  }

  private renderNode(node: TreeNode, depth: number) {
    const row = document.createElement("div");
    row.className = "tree-row";
    if (node.isDir) row.classList.add("dir");
    if (node.path === this.selectedPath) row.classList.add("selected");
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
