import type { CapturedNode } from '../../shared/capture-types';
import type { BuildWarning } from '../../shared/messages';
import type { FontMap } from '../fonts';
import { parseColor } from '../colors';
import { resolveFont } from '../fonts';

function px(val: string | undefined, fallback = 0): number {
  if (!val || val === 'none' || val === 'normal') return fallback;
  return parseFloat(val) || fallback;
}

function parseLineHeight(val: string | undefined, fontSize: number): LineHeight {
  if (!val || val === 'normal') return { unit: 'AUTO' };
  if (val.endsWith('px')) return { value: parseFloat(val), unit: 'PIXELS' };
  if (val.endsWith('%')) return { value: parseFloat(val), unit: 'PERCENT' };
  // Unitless multiplier
  const n = parseFloat(val);
  if (!isNaN(n)) return { value: n * fontSize, unit: 'PIXELS' };
  return { unit: 'AUTO' };
}

function parseLetterSpacing(val: string | undefined, fontSize: number): LetterSpacing {
  if (!val || val === 'normal') return { value: 0, unit: 'PIXELS' };
  if (val.endsWith('px')) return { value: parseFloat(val), unit: 'PIXELS' };
  if (val.endsWith('em')) return { value: parseFloat(val) * fontSize, unit: 'PIXELS' };
  if (val.endsWith('%')) return { value: parseFloat(val), unit: 'PERCENT' };
  return { value: 0, unit: 'PIXELS' };
}

const ALIGN_MAP: Record<string, TextNode['textAlignHorizontal']> = {
  left: 'LEFT', start: 'LEFT',
  center: 'CENTER',
  right: 'RIGHT', end: 'RIGHT',
  justify: 'JUSTIFIED',
};

export function applyTextProperties(
  text: TextNode,
  node: CapturedNode,
  x: number,
  y: number,
  fontMap: FontMap,
  warnings: BuildWarning[],
): void {
  const cs = node.computedStyles;
  const fontSize = px(cs['font-size'], 16);

  text.name = node.id || '#text';
  text.x = Math.round(x);
  text.y = Math.round(y);
  // Add 10% width buffer: browser and Figma font metrics differ slightly,
  // causing text to wrap earlier in Figma. The extra room prevents line breaks
  // that don't exist in the original rendering.
  text.resize(Math.max(1, Math.ceil(node.rect.width * 1.1)), Math.max(1, node.rect.height));
  text.textAutoResize = 'HEIGHT';

  // Base font — must be set before characters
  const fontName = resolveFont(cs, fontMap);
  text.fontName = fontName;
  text.fontSize = fontSize;

  if (node.textRuns && node.textRuns.length > 0) {
    text.characters = node.textRuns.map(r => r.text).join('');

    let offset = 0;
    for (const run of node.textRuns) {
      const len = run.text.length;
      if (len === 0) { offset += len; continue; }
      const start = offset;
      const end = offset + len;
      const rcs = run.computedStyles;
      const runFontSize = px(rcs['font-size'], fontSize);

      text.setRangeFontName(start, end, resolveFont(rcs, fontMap));
      text.setRangeFontSize(start, end, runFontSize);
      text.setRangeLetterSpacing(start, end, parseLetterSpacing(rcs['letter-spacing'], runFontSize));

      const runColor = parseColor(rcs['color'] || '');
      if (runColor) {
        text.setRangeFills(start, end, [{ type: 'SOLID', color: { r: runColor.r, g: runColor.g, b: runColor.b }, opacity: runColor.a }]);
      }

      const deco = rcs['text-decoration'] || '';
      if (deco.includes('underline')) text.setRangeTextDecoration(start, end, 'UNDERLINE');
      else if (deco.includes('line-through')) text.setRangeTextDecoration(start, end, 'STRIKETHROUGH');

      offset += len;
    }
  } else {
    text.characters = node.textContent || '';
    text.letterSpacing = parseLetterSpacing(cs['letter-spacing'], fontSize);

    const color = parseColor(cs['color'] || '');
    if (color) {
      text.fills = [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a }];
    }
  }

  // Line height and alignment apply to the whole node
  text.lineHeight = parseLineHeight(cs['line-height'], fontSize);
  const align = ALIGN_MAP[cs['text-align'] || 'left'];
  if (align) text.textAlignHorizontal = align;

  // Opacity — skip opacity:0 on text so visually-hidden-but-structural text still shows
  const opacity = parseFloat(cs['opacity'] || '1');
  if (!isNaN(opacity) && opacity < 1 && opacity > 0) text.opacity = opacity;

  // Warn about transforms — not applied to text in v1
  const transform = cs['transform'];
  if (transform && transform !== 'none') {
    warnings.push({ level: 'warning', nodeId: text.id, message: `${node.id}: transform "${transform}" not applied` });
  }
}
