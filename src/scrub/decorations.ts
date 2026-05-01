import * as monaco from "monaco-editor";
import { scanNumbers, NumberToken } from "./numberScanner";

export class ScrubDecorations {
  private collection: monaco.editor.IEditorDecorationsCollection;
  private currentTokens: NumberToken[] = [];

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.collection = editor.createDecorationsCollection();
  }

  rescan(model: monaco.editor.ITextModel): NumberToken[] {
    const source = model.getValue();
    const exclude = stringAndCommentRanges(source, model.getLanguageId());
    const all = scanNumbers(source);
    this.currentTokens = all.filter((t) => !overlapsAny(t, exclude));

    const decos: monaco.editor.IModelDeltaDecoration[] = this.currentTokens.map(
      (t) => ({
        range: rangeFromOffsets(model, t.start, t.end),
        options: {
          inlineClassName: "scrubbable",
          stickiness:
            monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })
    );
    this.collection.set(decos);
    return this.currentTokens;
  }

  tokens(): NumberToken[] {
    return this.currentTokens;
  }

  clear() {
    this.currentTokens = [];
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

interface ExcludeRange {
  start: number;
  end: number;
}

function stringAndCommentRanges(
  source: string,
  languageId: string
): ExcludeRange[] {
  const ranges: ExcludeRange[] = [];
  let tokensPerLine: monaco.Token[][];
  try {
    tokensPerLine = monaco.editor.tokenize(source, languageId);
  } catch {
    return ranges;
  }

  const lines = source.split("\n");
  let lineOffset = 0;

  for (let i = 0; i < tokensPerLine.length; i++) {
    const lineTokens = tokensPerLine[i];
    const lineLen = lines[i]?.length ?? 0;
    for (let j = 0; j < lineTokens.length; j++) {
      const t = lineTokens[j];
      const next = lineTokens[j + 1];
      const tEnd = next ? next.offset : lineLen;
      const type = t.type;
      if (type.includes("string") || type.includes("comment")) {
        ranges.push({
          start: lineOffset + t.offset,
          end: lineOffset + tEnd,
        });
      }
    }
    lineOffset += lineLen + 1;
  }
  return ranges;
}

function overlapsAny(token: NumberToken, ranges: ExcludeRange[]): boolean {
  for (const r of ranges) {
    if (token.start < r.end && token.end > r.start) return true;
  }
  return false;
}
