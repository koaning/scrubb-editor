import * as monaco from "monaco-editor";

export interface OpenTab {
  path: string;
  model: monaco.editor.ITextModel;
}

export interface TabBarOptions {
  container: HTMLElement;
  editor: monaco.editor.IStandaloneCodeEditor;
  onActivePathChange: (path: string | null) => void;
}

export class TabBar {
  private container: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor;
  private onActivePathChange: (path: string | null) => void;
  private tabs: OpenTab[] = [];
  private activeIndex = -1;

  constructor(opts: TabBarOptions) {
    this.container = opts.container;
    this.editor = opts.editor;
    this.onActivePathChange = opts.onActivePathChange;
    this.render();
  }

  open(path: string, contents: string, languageId: string) {
    const existing = this.tabs.findIndex((t) => t.path === path);
    if (existing !== -1) {
      this.activate(existing);
      return;
    }
    const model = monaco.editor.createModel(contents, languageId);
    this.tabs.push({ path, model });
    this.activate(this.tabs.length - 1);
  }

  closeIndex(i: number) {
    const tab = this.tabs[i];
    if (!tab) return;
    tab.model.dispose();
    this.tabs.splice(i, 1);
    if (this.tabs.length === 0) {
      this.activeIndex = -1;
      this.editor.setModel(null);
      this.onActivePathChange(null);
    } else {
      const next = Math.min(i, this.tabs.length - 1);
      this.activate(next);
    }
    this.render();
  }

  closeActive() {
    if (this.activeIndex !== -1) this.closeIndex(this.activeIndex);
  }

  closeAll() {
    for (const tab of this.tabs) tab.model.dispose();
    this.tabs = [];
    this.activeIndex = -1;
    this.editor.setModel(null);
    this.onActivePathChange(null);
    this.render();
  }

  next() {
    if (this.tabs.length < 2) return;
    this.activate((this.activeIndex + 1) % this.tabs.length);
  }

  prev() {
    if (this.tabs.length < 2) return;
    this.activate(
      (this.activeIndex - 1 + this.tabs.length) % this.tabs.length
    );
  }

  activePath(): string | null {
    return this.tabs[this.activeIndex]?.path ?? null;
  }

  activeModel(): monaco.editor.ITextModel | null {
    return this.tabs[this.activeIndex]?.model ?? null;
  }

  private activate(i: number) {
    this.activeIndex = i;
    const tab = this.tabs[i];
    if (!tab) return;
    this.editor.setModel(tab.model);
    this.onActivePathChange(tab.path);
    this.render();
  }

  private render() {
    this.container.innerHTML = "";
    this.tabs.forEach((tab, i) => {
      const el = document.createElement("div");
      el.className = "tab" + (i === this.activeIndex ? " active" : "");
      el.title = tab.path;

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = basename(tab.path);
      el.appendChild(name);

      const close = document.createElement("span");
      close.className = "close";
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeIndex(i);
      });
      el.appendChild(close);

      el.addEventListener("mousedown", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          this.closeIndex(i);
        }
      });
      el.addEventListener("click", () => this.activate(i));

      this.container.appendChild(el);
    });
  }
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1);
}
