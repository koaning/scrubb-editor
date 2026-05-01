export interface NumberToken {
  start: number;
  end: number;
  text: string;
  value: number;
  decimals: number;
}

const PATTERN = /(-)?\d+(\.\d+)?/g;

export function scanNumbers(source: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATTERN.exec(source)) !== null) {
    let start = match.index;
    let end = start + match[0].length;
    const hasMinus = match[1] !== undefined;

    if (hasMinus) {
      if (start > 0 && isIdentOrDot(source.charCodeAt(start - 1))) {
        start += 1;
      }
    } else if (start > 0 && isIdentOrDot(source.charCodeAt(start - 1))) {
      continue;
    }

    const text = source.slice(start, end);
    const value = Number(text);
    if (!Number.isFinite(value)) continue;

    const dot = text.indexOf(".");
    const decimals = dot === -1 ? 0 : text.length - dot - 1;

    tokens.push({ start, end, text, value, decimals });
  }
  return tokens;
}

export function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function computeStep(value: number, decimals: number): number {
  const mag = Math.max(1, Math.abs(value));
  const base = Math.pow(10, -decimals);
  return base * Math.max(1, Math.floor(mag / 100));
}

function isIdentOrDot(ch: number): boolean {
  if (ch === 0x2e) return true;
  if (ch === 0x5f) return true;
  if (ch >= 0x30 && ch <= 0x39) return true;
  if (ch >= 0x41 && ch <= 0x5a) return true;
  if (ch >= 0x61 && ch <= 0x7a) return true;
  return ch >= 0x80;
}
