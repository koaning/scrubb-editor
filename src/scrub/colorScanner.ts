export type ColorFormat = 'hex3' | 'hex6' | 'hex8' | 'named';

export interface ColorToken {
  start: number;
  end: number;
  text: string;
  hex: string;
  format: ColorFormat;
}

const HEX_RE = /#([0-9a-fA-F]{3,8})\b/g;

export function scanColors(source: string): ColorToken[] {
  const tokens: ColorToken[] = [];
  HEX_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEX_RE.exec(source)) !== null) {
    const hex = match[1];
    if (hex.length !== 3 && hex.length !== 6 && hex.length !== 8) continue;

    const start = match.index;
    if (start > 0) {
      const prev = source[start - 1];
      if (prev && /[\w&]/.test(prev)) continue;
    }

    const end = start + match[0].length;
    const text = source.slice(start, end);

    let normalized: string;
    let format: ColorFormat;

    if (hex.length === 3) {
      normalized = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      format = 'hex3';
    } else if (hex.length === 8) {
      normalized = hex.slice(0, 6);
      format = 'hex8';
    } else {
      normalized = hex;
      format = 'hex6';
    }

    tokens.push({ start, end, text, hex: normalized, format });
  }
  return tokens;
}

const NAMED_COLORS: Record<string, string> = {
  aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff',
  aquamarine: '7fffd4', azure: 'f0ffff', beige: 'f5f5dc',
  bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd',
  blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a',
  burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00',
  chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed',
  cornsilk: 'fff8dc', crimson: 'dc143c', cyan: '00ffff',
  darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b',
  darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9',
  darkkhaki: 'bdb76b', darkmagenta: '8b008b', darkolivegreen: '556b2f',
  darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000',
  darksalmon: 'e9967a', darkseagreen: '8fbc8f', darkslateblue: '483d8b',
  darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1',
  darkviolet: '9400d3', deeppink: 'ff1493', deepskyblue: '00bfff',
  dimgray: '696969', dimgrey: '696969', dodgerblue: '1e90ff',
  firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22',
  fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff',
  gold: 'ffd700', goldenrod: 'daa520', gray: '808080',
  green: '008000', greenyellow: 'adff2f', grey: '808080',
  honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c',
  indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c',
  lavender: 'e6e6fa', lavenderblush: 'fff0f5', lawngreen: '7cfc00',
  lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080',
  lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3',
  lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1',
  lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa',
  lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de',
  lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32',
  linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000',
  mediumaquamarine: '66cdaa', mediumblue: '0000cd', mediumorchid: 'ba55d3',
  mediumpurple: '9370db', mediumseagreen: '3cb371', mediumslateblue: '7b68ee',
  mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc', mediumvioletred: 'c71585',
  midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1',
  moccasin: 'ffe4b5', navajowhite: 'ffdead', navy: '000080',
  oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23',
  orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6',
  palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee',
  palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9',
  peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd',
  powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399',
  red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1',
  saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460',
  seagreen: '2e8b57', seashell: 'fff5ee', sienna: 'a0522d',
  silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd',
  slategray: '708090', slategrey: '708090', snow: 'fffafa',
  springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c',
  teal: '008080', thistle: 'd8bfd8', tomato: 'ff6347',
  turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3',
  white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00',
  yellowgreen: '9acd32',
};

const NAMED_RE = new RegExp(
  '\\b(' + Object.keys(NAMED_COLORS).sort((a, b) => b.length - a.length).join('|') + ')\\b',
  'gi'
);

export function scanNamedColors(source: string): ColorToken[] {
  const tokens: ColorToken[] = [];
  NAMED_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NAMED_RE.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    const hex = NAMED_COLORS[name];
    if (!hex) continue;

    const start = match.index;
    const end = start + match[0].length;

    const before = start > 0 ? source[start - 1] : '';
    const after = end < source.length ? source[end] : '';
    const isQuoted =
      (before === '"' || before === "'" || before === '`') &&
      (after === '"' || after === "'" || after === '`');
    if (!isQuoted) continue;

    tokens.push({ start, end, text: source.slice(start, end), hex, format: 'named' });
  }
  return tokens;
}

export function formatColor(hex6: string, format: ColorFormat, alpha?: string): string {
  if (format === 'hex3') {
    if (hex6[0] === hex6[1] && hex6[2] === hex6[3] && hex6[4] === hex6[5]) {
      return '#' + hex6[0] + hex6[2] + hex6[4];
    }
    return '#' + hex6;
  }
  if (format === 'hex8') {
    return '#' + hex6 + (alpha ?? 'ff');
  }
  return '#' + hex6;
}
