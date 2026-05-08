import * as monaco from "monaco-editor";
import { NumberToken, computeStep, formatNumber } from "./numberScanner";

export interface ScrubControllerOptions {
  editor: monaco.editor.IStandaloneCodeEditor;
  getTokens: () => NumberToken[];
  onLiveChange: () => void;
  onScrubEnd: () => void;
  onHoverChange?: (token: NumberToken | null) => void;
}

export class ScrubController {
  private opts: ScrubControllerOptions;
  private disposables: monaco.IDisposable[] = [];

  private isScrubbing = false;
  private dragStartX = 0;
  private dragStartValue = 0;
  private dragDecimals = 0;
  private dragStartOffset = 0;
  private dragCurrentLength = 0;

  constructor(opts: ScrubControllerOptions) {
    this.opts = opts;
    const editor = opts.editor;

    this.disposables.push(
      editor.onMouseDown(this.onMonacoMouseDown),
      editor.onMouseMove(this.onMonacoMouseMove),
      editor.onMouseLeave(() => {
        if (!this.isScrubbing) {
          document.body.classList.remove("scrubbing-cursor");
          this.opts.onHoverChange?.(null);
        }
      })
    );

    document.addEventListener("mousemove", this.onDocMouseMove);
    document.addEventListener("mouseup", this.onDocMouseUp, true);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    document.removeEventListener("mousemove", this.onDocMouseMove);
    document.removeEventListener("mouseup", this.onDocMouseUp, true);
  }

  isActive(): boolean {
    return this.isScrubbing;
  }

  private tokenAt(position: monaco.IPosition | null): NumberToken | null {
    if (!position) return null;
    const model = this.opts.editor.getModel();
    if (!model) return null;
    const offset = model.getOffsetAt(position);
    for (const t of this.opts.getTokens()) {
      if (offset >= t.start && offset <= t.end) return t;
    }
    return null;
  }

  private onMonacoMouseDown = (e: monaco.editor.IEditorMouseEvent) => {
    if (!e.event.leftButton) return;
    const token = this.tokenAt(e.target.position);
    if (!token) return;

    e.event.preventDefault();
    e.event.stopPropagation();

    this.isScrubbing = true;
    this.dragStartX = e.event.posx;
    this.dragStartValue = token.value;
    this.dragDecimals = token.decimals;
    this.dragStartOffset = token.start;
    this.dragCurrentLength = token.end - token.start;

    const model = this.opts.editor.getModel();
    if (model) model.pushStackElement();

    document.body.classList.add("scrubbing-cursor");
    document.body.style.userSelect = "none";
  };

  private onMonacoMouseMove = (e: monaco.editor.IEditorMouseEvent) => {
    if (this.isScrubbing) return;
    const token = this.tokenAt(e.target.position);
    if (token) {
      document.body.classList.add("scrubbing-cursor");
    } else {
      document.body.classList.remove("scrubbing-cursor");
    }
    this.opts.onHoverChange?.(token);
  };

  private onDocMouseMove = (e: MouseEvent) => {
    if (!this.isScrubbing) return;
    e.preventDefault();
    const model = this.opts.editor.getModel();
    if (!model) return;

    const dx = e.pageX - this.dragStartX;
    const step = computeStep(this.dragStartValue, this.dragDecimals);
    const scale = e.shiftKey ? 0.1 : 1.0;
    const newValue = this.dragStartValue + dx * step * scale;
    const newText = formatNumber(newValue, this.dragDecimals);

    const startPos = model.getPositionAt(this.dragStartOffset);
    const endPos = model.getPositionAt(
      this.dragStartOffset + this.dragCurrentLength
    );
    const range = new monaco.Range(
      startPos.lineNumber,
      startPos.column,
      endPos.lineNumber,
      endPos.column
    );

    // Use pushEditOperations (not executeEdits) so we can supply both the
    // before-cursor state (used on undo) and a cursor-state computer (used
    // forward). Without this, Monaco's default undo selects the restored
    // range — surfacing as a "phantom" highlight when the user hits Cmd+Z.
    const beforeCursorState = this.opts.editor.getSelections();
    model.pushEditOperations(
      beforeCursorState,
      [{ range, text: newText, forceMoveMarkers: true }],
      () => {
        const pos = model.getPositionAt(
          this.dragStartOffset + newText.length
        );
        return [
          new monaco.Selection(
            pos.lineNumber,
            pos.column,
            pos.lineNumber,
            pos.column
          ),
        ];
      }
    );
    this.dragCurrentLength = newText.length;

    this.opts.onLiveChange();
  };

  private onDocMouseUp = (_e: MouseEvent) => {
    if (!this.isScrubbing) return;
    this.isScrubbing = false;
    document.body.classList.remove("scrubbing-cursor");
    document.body.style.userSelect = "";
    const model = this.opts.editor.getModel();
    if (model) model.pushStackElement();
    this.opts.onScrubEnd();
  };
}
