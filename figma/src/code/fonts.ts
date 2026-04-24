import type { CapturedNode } from '../shared/capture-types';

// Maps CSS numeric weight → Figma style name.
const WEIGHT_MAP: Record<string, string> = {
  '100': 'Thin',
  '200': 'Extra Light',
  '300': 'Light',
  '400': 'Regular',
  '500': 'Medium',
  '600': 'Semi Bold',
  '700': 'Bold',
  '800': 'Extra Bold',
  '900': 'Black',
  'normal': 'Regular',
  'bold': 'Bold',
};

// Some fonts use condensed style names — try these if the primary fails.
const WEIGHT_ALIASES: Record<string, string[]> = {
  'Semi Bold': ['SemiBold', 'Semibold', 'DemiBold'],
  'Extra Light': ['ExtraLight', 'UltraLight'],
  'Extra Bold': ['ExtraBold', 'UltraBold'],
};

export type FontMap = Map<string, FontName>;

function fontKey(family: string, style: string): string {
  return `${family}::${style}`;
}

/** Extract the first family name from a CSS font-family list. Strips quotes. */
export function parseFontFamily(value: string): string {
  const first = value.split(',')[0].trim();
  const family = first.replace(/^["']|["']$/g, '').trim();
  // Guard against unresolved CSS variables, generic keywords, or other non-names.
  if (!family || family.startsWith('var(') || family.includes('(')) return 'Inter';
  const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);
  if (GENERIC.has(family.toLowerCase())) return 'Inter';
  return family;
}

/** Map a CSS font-weight + italic flag to a Figma style string. */
export function cssWeightToFigmaStyle(weight: string, italic: boolean): string {
  const base = WEIGHT_MAP[weight.trim()] || 'Regular';
  if (!italic) return base;
  return base === 'Regular' ? 'Italic' : `${base} Italic`;
}

/** Walk the tree and collect unique (family, style) combinations from text nodes. */
export function collectFontIds(node: CapturedNode): Set<string> {
  const ids = new Set<string>();
  const isText = node.tag === '#text' || (node.textContent !== undefined && node.children.length === 0);

  if (isText) {
    const family = parseFontFamily(node.computedStyles['font-family'] || 'Inter');
    const weight = node.computedStyles['font-weight'] || '400';
    const italic = (node.computedStyles['font-style'] || '').includes('italic');
    const style = cssWeightToFigmaStyle(weight, italic);
    ids.add(fontKey(family, style));
  }

  for (const child of node.children) {
    for (const id of collectFontIds(child)) ids.add(id);
  }

  return ids;
}

/** Load all required fonts via figma.loadFontAsync. Falls back to Inter Regular. */
export async function loadFonts(
  ids: Set<string>,
): Promise<{ fontMap: FontMap; missing: { family: string; style: string }[] }> {
  const inter: FontName = { family: 'Inter', style: 'Regular' };
  const needed: FontName[] = [inter];

  for (const id of ids) {
    const [family, style] = id.split('::');
    if (family !== 'Inter' || style !== 'Regular') {
      needed.push({ family, style });
    }
  }

  const results = await Promise.allSettled(
    needed.map(f => figma.loadFontAsync(f))
  );

  const fontMap: FontMap = new Map();
  const missing: { family: string; style: string }[] = [];

  for (let i = 0; i < needed.length; i++) {
    const font = needed[i];
    const key = fontKey(font.family, font.style);

    if (results[i].status === 'fulfilled') {
      fontMap.set(key, font);
    } else {
      // Try known aliases (e.g. "Semi Bold" → "SemiBold")
      const aliases = WEIGHT_ALIASES[font.style] || [];
      let resolved = false;
      for (const alias of aliases) {
        try {
          await figma.loadFontAsync({ family: font.family, style: alias });
          fontMap.set(key, { family: font.family, style: alias });
          resolved = true;
          break;
        } catch {
          // try next alias
        }
      }
      if (!resolved) {
        missing.push(font);
        fontMap.set(key, inter);
      }
    }
  }

  return { fontMap, missing };
}

/** Resolve a node's font from the map, with Inter fallback. */
export function resolveFont(
  computedStyles: Record<string, string>,
  fontMap: FontMap,
): FontName {
  const family = parseFontFamily(computedStyles['font-family'] || 'Inter');
  const weight = computedStyles['font-weight'] || '400';
  const italic = (computedStyles['font-style'] || '').includes('italic');
  const style = cssWeightToFigmaStyle(weight, italic);
  return fontMap.get(fontKey(family, style)) || { family: 'Inter', style: 'Regular' };
}
