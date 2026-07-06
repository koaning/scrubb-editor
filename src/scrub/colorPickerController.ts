import * as monaco from "monaco-editor";
import { scanColors, scanNamedColors, ColorToken, formatColor } from "./colorScanner";

export interface ColorPickerOptions {
  editor: monaco.editor.IStandaloneCodeEditor;
}

export class ColorPickerController {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private collection: monaco.editor.IEditorDecorationsCollection;
  private currentTokens: ColorToken[] = [];
  private popup: HTMLElement | null = null;
  private disposables: monaco.IDisposable[] = [];

  constructor(opts: ColorPickerOptions) {
    this.editor = opts.editor;
    this.collection = opts.editor.createDecorationsCollection();

    this.disposables.push(
      opts.editor.onMouseDown(this.onMouseDown),
      opts.editor.onDidChangeModel(() => this.closePicker()),
      opts.editor.onDidScrollChange(() => this.closePicker()),
    );
  }

  rescan(model: monaco.editor.ITextModel): ColorToken[] {
    const source = model.getValue();
    this.currentTokens = [...scanColors(source), ...scanNamedColors(source)];

    const decos: monaco.editor.IModelDeltaDecoration[] = this.currentTokens.map(
      (t) => ({
        range: rangeFromOffsets(model, t.start, t.end),
        options: {
          inlineClassName: "colorizable",
          stickiness:
            monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })
    );
    this.collection.set(decos);
    return this.currentTokens;
  }

  tokens(): ColorToken[] {
    return this.currentTokens;
  }

  isColorAt(position: monaco.IPosition | null): boolean {
    if (!position) return false;
    const model = this.editor.getModel();
    if (!model) return false;
    const offset = model.getOffsetAt(position);
    return this.currentTokens.some(
      (t) => offset >= t.start && offset <= t.end
    );
  }

  private onMouseDown = (e: monaco.editor.IEditorMouseEvent) => {
    if (!e.event.leftButton) return;
    const model = this.editor.getModel();
    if (!model) return;
    const pos = e.target.position;
    if (!pos) return;

    const offset = model.getOffsetAt(pos);
    const token = this.currentTokens.find(
      (t) => offset >= t.start && offset <= t.end
    );
    if (!token) return;

    e.event.preventDefault();
    e.event.stopPropagation();
    this.showPicker(token, pos);
  };

  private showPicker(token: ColorToken, position: monaco.IPosition) {
    this.closePicker();

    const visiblePos = this.editor.getScrolledVisiblePosition(position);
    if (!visiblePos) return;
    const editorDom = this.editor.getDomNode();
    if (!editorDom) return;
    const editorRect = editorDom.getBoundingClientRect();

    const x = editorRect.left + visiblePos.left + visiblePos.height / 2;
    const y = editorRect.top + visiblePos.top;

    const popup = document.createElement("div");
    popup.className = "color-picker-popup";

    const input = document.createElement("input");
    input.type = "color";
    input.value = "#" + token.hex;
    input.className = "color-picker-swatch";

    popup.appendChild(input);
    document.body.appendChild(popup);
    this.popup = popup;

    const popupRect = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.round(x - popupRect.width / 2))}px`;
    popup.style.top = `${Math.max(8, Math.round(y - popupRect.height - 8))}px`;

    const onInput = () => {
      this.updateColor(token, input.value);
    };
    input.addEventListener("input", onInput);

    const closeHandler = (ev: MouseEvent) => {
      if (!popup.contains(ev.target as Node)) {
        this.closePicker();
      }
    };
    document.addEventListener("mousedown", closeHandler, true);

    const keyHandler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        this.closePicker();
      }
    };
    document.addEventListener("keydown", keyHandler);

    (popup as any).__cleanup = () => {
      input.removeEventListener("input", onInput);
      document.removeEventListener("mousedown", closeHandler, true);
      document.removeEventListener("keydown", keyHandler);
    };
  }

  private updateColor(token: ColorToken, newHex: string) {
    const model = this.editor.getModel();
    if (!model) return;

    const hex = newHex.replace("#", "");
    const alpha =
      token.format === "hex8" && token.text.length === 9
        ? token.text.slice(7, 9)
        : undefined;
    const formatted = formatColor(hex, token.format, alpha);

    const startPos = model.getPositionAt(token.start);
    const endPos = model.getPositionAt(token.end);
    const range = new monaco.Range(
      startPos.lineNumber,
      startPos.column,
      endPos.lineNumber,
      endPos.column
    );

    model.pushEditOperations(this.editor.getSelections(), [
      { range, text: formatted, forceMoveMarkers: true },
    ], () => null);
  }

  private closePicker() {
    if (this.popup) {
      const cleanup = (this.popup as any).__cleanup;
      if (cleanup) cleanup();
      this.popup.remove();
      this.popup = null;
    }
  }

  dispose() {
    this.closePicker();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.collection.clear();
  }
}

function rangeFromOffsets(
  model: monaco.editor.ITextModel,
  start: number,
  end: number
): monaco.IRange {
  const s = model.getPositionAt(start);
  const e = model.getPositionAt(end);
  return {
    startLineNumber: s.lineNumber,
    startColumn: s.column,
    endLineNumber: e.lineNumber,
    endColumn: e.column,
  };
}
