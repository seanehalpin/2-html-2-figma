import type { CapturedNode } from '../../shared/capture-types';
import type { BuildWarning } from '../../shared/messages';
import { parseColor } from '../colors';

function px(val: string | undefined, fallback = 0): number {
  if (!val || val === 'none') return fallback;
  return parseFloat(val) || fallback;
}

function toSolidPaint(r: number, g: number, b: number, a: number): SolidPaint {
  return { type: 'SOLID', color: { r, g, b }, opacity: a };
}

function splitNotInParens(value: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of value) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === sep && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function tokenise(s: string): string[] {
  const tokens: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ' ' && depth === 0) { if (cur) { tokens.push(cur); cur = ''; } }
    else cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function parseSingleShadow(shadow: string): (DropShadowEffect | InnerShadowEffect) | null {
  const tokens = tokenise(shadow.trim());
  let inset = false;
  const lengths: number[] = [];
  let color: RGBA | null = null;

  for (const tok of tokens) {
    if (tok === 'inset') { inset = true; continue; }
    // Try color first — parseColor handles rgb(...) groups
    const c = parseColor(tok);
    if (c !== null) { color = c; continue; }
    const n = parseFloat(tok);
    if (!isNaN(n)) lengths.push(n);
  }

  if (lengths.length < 2) return null;
  const [offsetX, offsetY, radius = 0, spread = 0] = lengths;
  const c = color || { r: 0, g: 0, b: 0, a: 0.25 };

  return {
    type: inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
    color: { r: c.r, g: c.g, b: c.b, a: c.a },
    offset: { x: offsetX, y: offsetY },
    radius,
    spread,
    visible: true,
    blendMode: 'NORMAL',
  };
}

export function applyFrameProperties(
  frame: FrameNode,
  node: CapturedNode,
  x: number,
  y: number,
  warnings: BuildWarning[],
): void {
  frame.name = `${node.tag}${node.id ? ` · ${node.id}` : ''}`;
  frame.x = Math.round(x);
  frame.y = Math.round(y);
  frame.resize(Math.max(1, node.rect.width), Math.max(1, node.rect.height));

  // Background fill
  const bgRaw = node.computedStyles['background-color'] || '';
  const bgImg = node.computedStyles['background-image'] || 'none';
  const bg = parseColor(bgRaw);

  const hasUrlImage = bgImg !== 'none' && bgImg !== '' && bgImg.includes('url(');

  if (bg && bg.a > 0) {
    frame.fills = [toSolidPaint(bg.r, bg.g, bg.b, bg.a)];
  } else if (hasUrlImage) {
    // No background-color but there is a background image — use a placeholder so the
    // element is at least visible in Figma.
    frame.fills = [toSolidPaint(0.9, 0.9, 0.9, 1)];
    warnings.push({ level: 'info', nodeId: node.id, message: `background-image not reproduced on ${node.id}` });
  } else {
    frame.fills = [];
  }

  // Border radius
  const tl = px(node.computedStyles['border-top-left-radius']);
  const tr = px(node.computedStyles['border-top-right-radius']);
  const br = px(node.computedStyles['border-bottom-right-radius']);
  const bl = px(node.computedStyles['border-bottom-left-radius']);

  if (tl === tr && tr === br && br === bl) {
    frame.cornerRadius = tl;
  } else {
    frame.topLeftRadius = tl;
    frame.topRightRadius = tr;
    frame.bottomRightRadius = br;
    frame.bottomLeftRadius = bl;
  }

  // Stroke / border — use top border, warn if sides differ
  const bw = [
    px(node.computedStyles['border-top-width']),
    px(node.computedStyles['border-right-width']),
    px(node.computedStyles['border-bottom-width']),
    px(node.computedStyles['border-left-width']),
  ];
  const topW = bw[0];

  if (topW > 0) {
    const bc = parseColor(node.computedStyles['border-top-color'] || '');
    if (bc) {
      frame.strokes = [toSolidPaint(bc.r, bc.g, bc.b, bc.a)];
      frame.strokeWeight = topW;
      frame.strokeAlign = 'INSIDE';
      if (!bw.every(w => w === topW)) {
        warnings.push({ level: 'warning', nodeId: node.id, message: `${node.id}: border sides differ — using top border weight for all` });
      }
    }
  }

  // Effects: box-shadow, filter: drop-shadow(), backdrop-filter
  const effects: Effect[] = [];

  const shadowRaw = node.computedStyles['box-shadow'] || 'none';
  if (shadowRaw && shadowRaw !== 'none') {
    for (const part of splitNotInParens(shadowRaw, ',')) {
      const shadow = parseSingleShadow(part.trim());
      if (shadow) effects.push(shadow);
    }
  }

  const filterRaw = node.computedStyles['filter'] || 'none';
  if (filterRaw && filterRaw !== 'none') {
    const dsMatch = filterRaw.match(/drop-shadow\(([^)]+)\)/i);
    if (dsMatch) {
      const shadow = parseSingleShadow(dsMatch[1]);
      if (shadow) effects.push(shadow);
    }
  }

  const backdropRaw = node.computedStyles['backdrop-filter'] || node.computedStyles['-webkit-backdrop-filter'] || 'none';
  if (backdropRaw && backdropRaw !== 'none') {
    const blurMatch = backdropRaw.match(/blur\(\s*([\d.]+)px\s*\)/i);
    if (blurMatch) {
      effects.push({ type: 'BACKGROUND_BLUR', radius: parseFloat(blurMatch[1]), visible: true });
    }
  }

  if (effects.length) frame.effects = effects;

  // Opacity
  const opacity = parseFloat(node.computedStyles['opacity'] || '1');
  if (!isNaN(opacity) && opacity < 1) frame.opacity = opacity;

  // Overflow / clip
  const clips = new Set(['hidden', 'clip', 'scroll', 'auto']);
  frame.clipsContent =
    clips.has(node.computedStyles['overflow-x'] || '') ||
    clips.has(node.computedStyles['overflow-y'] || '');
}
