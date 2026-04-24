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

  // Font — must be set before characters
  const fontName = resolveFont(cs, fontMap);
  text.fontName = fontName;
  text.fontSize = fontSize;

  // Characters
  text.characters = node.textContent || '';

  // Line height
  text.lineHeight = parseLineHeight(cs['line-height'], fontSize);

  // Letter spacing
  text.letterSpacing = parseLetterSpacing(cs['letter-spacing'], fontSize);

  // Text align
  const align = ALIGN_MAP[cs['text-align'] || 'left'];
  if (align) text.textAlignHorizontal = align;

  // Color fill
  const color = parseColor(cs['color'] || '', cs['color']);
  if (color) {
    text.fills = [{ type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a }];
  }

  // Opacity
  const opacity = parseFloat(cs['opacity'] || '1');
  if (!isNaN(opacity) && opacity < 1) text.opacity = opacity;

  // Warn about transforms — not applied to text in v1
  const transform = cs['transform'];
  if (transform && transform !== 'none') {
    warnings.push({ level: 'warning', nodeId: node.id, message: `${node.id}: transform "${transform}" not applied` });
  }
}
