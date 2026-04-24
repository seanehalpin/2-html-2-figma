// ~20 most common CSS named colors as [r, g, b] (0-255).
const NAMED: Record<string, [number, number, number]> = {
  black:   [0, 0, 0],
  white:   [255, 255, 255],
  red:     [255, 0, 0],
  green:   [0, 128, 0],
  blue:    [0, 0, 255],
  yellow:  [255, 255, 0],
  orange:  [255, 165, 0],
  purple:  [128, 0, 128],
  pink:    [255, 192, 203],
  cyan:    [0, 255, 255],
  aqua:    [0, 255, 255],
  magenta: [255, 0, 255],
  fuchsia: [255, 0, 255],
  gray:    [128, 128, 128],
  grey:    [128, 128, 128],
  silver:  [192, 192, 192],
  maroon:  [128, 0, 0],
  navy:    [0, 0, 128],
  teal:    [0, 128, 128],
  lime:    [0, 255, 0],
  brown:   [165, 42, 42],
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n: number) {
  return clamp(n, 0, 1);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function parseNum(s: string, allowPercent = false): number {
  s = s.trim();
  if (allowPercent && s.endsWith('%')) return parseFloat(s) / 100;
  return parseFloat(s);
}

/** Split a function's argument string by commas not inside parens. */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let d = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') { d++; cur += ch; }
    else if (ch === ')') { d--; cur += ch; }
    else if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Parse a CSS color value into Figma's RGBA (all channels 0-1).
 * Returns null for unparseable values.
 * @param currentColor - used to resolve `currentColor`; pass the element's `color` value
 */
export function parseColor(value: string, currentColor?: string): RGBA | null {
  const v = value.trim().toLowerCase();

  if (!v || v === 'none' || v === 'initial' || v === 'inherit' || v === 'unset') return null;
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (v === 'currentcolor') return currentColor ? parseColor(currentColor) : null;
  if (v.startsWith('var(')) return null; // unresolved CSS variable

  // Named colors
  if (NAMED[v]) {
    const [r, g, b] = NAMED[v];
    return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
  }

  // #hex
  if (v.startsWith('#')) {
    const h = v.slice(1);
    const expand3 = (s: string) => s.split('').map(c => c + c).join('');
    const hex = h.length === 3 ? expand3(h) : h.length === 4 ? expand3(h) : h;
    if (hex.length !== 6 && hex.length !== 8) return null;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
  }

  // rgb() / rgba()
  const rgbMatch = v.match(/^rgba?\((.+)\)$/);
  if (rgbMatch) {
    // Handle both comma syntax and modern space/slash syntax
    const inner = rgbMatch[1];
    let parts: string[];
    if (inner.includes(',')) {
      parts = splitArgs(inner);
    } else {
      // "r g b" or "r g b / a"
      const [left, right] = inner.split('/');
      parts = left.trim().split(/\s+/);
      if (right) parts.push(right.trim());
    }
    if (parts.length < 3) return null;
    const r = clamp01(parseNum(parts[0]) / 255);
    const g = clamp01(parseNum(parts[1]) / 255);
    const b = clamp01(parseNum(parts[2]) / 255);
    const a = parts[3] !== undefined
      ? clamp01(parts[3].trim().endsWith('%') ? parseNum(parts[3], true) : parseFloat(parts[3]))
      : 1;
    if ([r, g, b, a].some(isNaN)) return null;
    return { r, g, b, a };
  }

  // hsl() / hsla()
  const hslMatch = v.match(/^hsla?\((.+)\)$/);
  if (hslMatch) {
    const inner = hslMatch[1];
    let parts: string[];
    if (inner.includes(',')) {
      parts = splitArgs(inner);
    } else {
      const [left, right] = inner.split('/');
      parts = left.trim().split(/\s+/);
      if (right) parts.push(right.trim());
    }
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]); // degrees
    const s = parseNum(parts[1], true) * 100; // percent → number
    const l = parseNum(parts[2], true) * 100;
    const a = parts[3] !== undefined
      ? clamp01(parts[3].trim().endsWith('%') ? parseNum(parts[3], true) : parseFloat(parts[3]))
      : 1;
    if ([h, s, l].some(isNaN)) return null;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a };
  }

  // color() — e.g. color(display-p3 r g b) or color(srgb r g b / a)
  // Values are already 0-1, no /255 needed.
  const colorFnMatch = v.match(/^color\((.+)\)$/);
  if (colorFnMatch) {
    const inner = colorFnMatch[1];
    const [left, alphaStr] = inner.split('/');
    const parts = left.trim().split(/\s+/);
    // parts[0] is colorspace name; r/g/b follow
    if (parts.length < 4) return null;
    const r = clamp01(parseFloat(parts[1]));
    const g = clamp01(parseFloat(parts[2]));
    const b = clamp01(parseFloat(parts[3]));
    const a = alphaStr
      ? clamp01(alphaStr.trim().endsWith('%') ? parseNum(alphaStr.trim(), true) : parseFloat(alphaStr.trim()))
      : 1;
    if ([r, g, b, a].some(isNaN)) return null;
    return { r, g, b, a };
  }

  return null;
}
