// Pure extraction logic — no chrome.* calls, no DOM mutations.
// Safe to unit-test in isolation.
import { COMPUTED_STYLE_PROPERTIES } from './styles';
import type { CapturedNode, Capture, CapturePayload, Viewport } from './types';

const SKIP_TAGS = new Set([
  'script', 'style', 'meta', 'link', 'noscript', 'head',
]);

// Subset of ARIA implicit roles for common HTML elements.
const IMPLICIT_ROLES: Record<string, string> = {
  a: 'link',
  button: 'button',
  h1: 'heading', h2: 'heading', h3: 'heading',
  h4: 'heading', h5: 'heading', h6: 'heading',
  img: 'img',
  input: 'textbox',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  aside: 'complementary',
  section: 'region',
  form: 'form',
  ul: 'list', ol: 'list',
  li: 'listitem',
  table: 'table',
  th: 'columnheader',
  td: 'cell',
  select: 'listbox',
  textarea: 'textbox',
  dialog: 'dialog',
  article: 'article',
  figure: 'figure',
};

let nodeCounter = 0;

const SVG_PAINT_PROPS = ['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity', 'color', 'stop-color', 'stop-opacity'];

/**
 * Clone an SVG element and inline all computed paint values so CSS variables,
 * currentColor, and class-based colours are self-contained in the markup.
 * Figma's SVG parser has no access to page styles, so unresolved references render as black.
 */
function serializeSvgWithComputedStyles(svgEl: Element): string {
  const liveEls = [svgEl, ...Array.from(svgEl.querySelectorAll('*'))];
  const clone = svgEl.cloneNode(true) as Element;
  const cloneEls = [clone, ...Array.from(clone.querySelectorAll('*'))];

  for (let i = 0; i < liveEls.length; i++) {
    const cs = window.getComputedStyle(liveEls[i]);
    const cloneEl = cloneEls[i] as Element;
    for (const prop of SVG_PAINT_PROPS) {
      const val = cs.getPropertyValue(prop);
      if (val) cloneEl.setAttribute(prop, val);
    }
    cloneEl.removeAttribute('class');
    cloneEl.removeAttribute('style');
  }

  return new XMLSerializer().serializeToString(clone);
}



/** Parse the first url(...) from a CSS value and resolve it against the page. */
function parseCssUrl(cssValue: string): string | null {
  const m = cssValue.match(/url\(['"]?([^'")\s]+)['"]?\)/);
  if (!m) return null;
  const raw = m[1];
  if (raw.startsWith('data:')) return null; // data URLs not fetched
  try { return new URL(raw, window.location.href).href; } catch { return null; }
}

/**
 * Fetch an SVG from a URL and tint all fills with iconColor (for mask icons).
 * Returns the tinted SVG markup, or null on failure.
 */
async function fetchMaskSvg(url: string, iconColor: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const text = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return null;
    const root = doc.documentElement;
    if (root.tagName !== 'svg') return null;
    // Override fill on root; also walk children and replace any non-none fill
    root.setAttribute('fill', iconColor);
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const f = el.getAttribute('fill');
      if (f && f !== 'none') el.setAttribute('fill', iconColor);
      el.removeAttribute('class');
    }
    return new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeRect(r: DOMRect) {
  return { x: r2(r.x), y: r2(r.y), width: r2(r.width), height: r2(r.height) };
}

/**
 * `display: contents` removes an element's own box: getBoundingClientRect returns
 * 0×0 even though its children render normally. Common in component libraries
 * (e.g. Tines's HidableButtonContent wrapper) for spans that hold flex items
 * without participating in layout themselves. For these, fall back to the union
 * of child rects so the captured node has a meaningful size.
 */
function getEffectiveRect(el: Element, cs: CSSStyleDeclaration): DOMRect {
  if (cs.display !== 'contents') return el.getBoundingClientRect();

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const child of Array.from(el.childNodes)) {
    let r: DOMRect | null = null;
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childCs = window.getComputedStyle(child as Element);
      r = getEffectiveRect(child as Element, childCs);
    } else if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim()) {
      try {
        const range = document.createRange();
        range.selectNodeContents(child);
        r = range.getBoundingClientRect();
      } catch {
        // Range not measurable — skip.
      }
    }
    if (r && (r.width > 0 || r.height > 0)) {
      if (r.x < minX) minX = r.x;
      if (r.y < minY) minY = r.y;
      if (r.right > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    }
  }
  if (!isFinite(minX)) return el.getBoundingClientRect();
  return new DOMRect(minX, minY, maxX - minX, maxY - minY);
}

// Recursively collects CSSStyleRules from a rule list, descending into
// @media, @supports, @layer, and any other grouping rules (CSSGroupingRule).
function collectStyleRules(rules: CSSRuleList): CSSStyleRule[] {
  const result: CSSStyleRule[] = [];
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      result.push(rule);
    } else if ('cssRules' in rule) {
      result.push(...collectStyleRules((rule as CSSGroupingRule).cssRules));
    }
  }
  return result;
}

// Approximate cascade resolution: later rule in document order wins over
// earlier; inline style wins over all; !important beats non-!important.
// Full specificity ordering (a,b,c weight) is NOT implemented — this is an
// intentional approximation that is good enough for token extraction.
function getOriginalDeclarations(
  el: Element,
  allRules: CSSStyleRule[],
): CapturedNode['originalDeclarations'] {
  type Entry = { value: string; important: boolean; order: number };
  const map = new Map<string, Entry>();

  for (let i = 0; i < allRules.length; i++) {
    const rule = allRules[i];
    let matches = false;
    try {
      matches = el.matches(rule.selectorText);
    } catch {
      continue; // skip unparseable selectors
    }
    if (!matches) continue;

    for (const prop of Array.from(rule.style)) {
      const value = rule.style.getPropertyValue(prop);
      const important = rule.style.getPropertyPriority(prop) === 'important';
      const existing = map.get(prop);

      if (!existing) {
        map.set(prop, { value, important, order: i });
      } else if (important && !existing.important) {
        map.set(prop, { value, important, order: i });
      } else if (!existing.important && i > existing.order) {
        map.set(prop, { value, important, order: i });
      } else if (important && existing.important && i > existing.order) {
        map.set(prop, { value, important, order: i });
      }
    }
  }

  // Inline styles override all stylesheet rules (per-property).
  const inline = (el as HTMLElement).style;
  if (inline?.length) {
    for (const prop of Array.from(inline)) {
      map.set(prop, {
        value: inline.getPropertyValue(prop),
        important: inline.getPropertyPriority(prop) === 'important',
        order: Infinity,
      });
    }
  }

  return Array.from(map.entries()).map(([property, { value, important }]) => ({
    property,
    value,
    important,
  }));
}

function getComputedStylesFiltered(el: Element): Record<string, string> {
  const cs = window.getComputedStyle(el);
  const result: Record<string, string> = {};
  for (const prop of COMPUTED_STYLE_PROPERTIES) {
    const val = cs.getPropertyValue(prop);
    if (val) result[prop] = val.trim();
  }
  return result;
}

function isSkipped(el: Element, cs: CSSStyleDeclaration, rect: DOMRect): boolean {
  if (SKIP_TAGS.has(el.tagName.toLowerCase())) return true;
  if (el.getAttribute('data-expanded') === 'false') return true;
  if (cs.display === 'none') return true;
  if (cs.visibility === 'hidden') return true;
  // "Visually hidden" accessibility pattern — clip: rect(0,0,0,0) or clip-path: inset(50%).
  // Browser extensions (1Password etc.) use this to inject off-screen text into the DOM.
  const clip = cs.getPropertyValue('clip').replace(/\s/g, '');
  if (clip === 'rect(0px,0px,0px,0px)' || clip === 'rect(0,0,0,0)') return true;
  const clipPath = cs.getPropertyValue('clip-path');
  if (clipPath === 'inset(50%)') return true;
  // Leaf elements with no visible area are purely decorative or injected off-screen.
  // Exception: preserve elements that carry text — they may be CSS-animated to 0-size
  // (e.g. collapsed flex items) but still represent real content.
  const hasElementChildren = Array.from(el.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE);
  const hasTextContent = !!el.textContent?.trim();
  if (!hasElementChildren && !hasTextContent && rect.width <= 1 && rect.height <= 1) return true;
  return false;
}

// TODO: Shadow DOM traversal not implemented.
// TODO: iframe traversal not implemented.
// TODO: pseudo-element capture not implemented.
async function walkElement(el: Element, allRules: CSSStyleRule[]): Promise<CapturedNode | null> {
  const cs = window.getComputedStyle(el);
  const rect = getEffectiveRect(el, cs);

  if (isSkipped(el, cs, rect)) return null;

  const id = `n-${nodeCounter++}`;
  const tag = el.tagName.toLowerCase();
  const capturedRect = makeRect(rect);

  // SVG: capture as an atomic leaf with computed paint values inlined so CSS variables
  // and currentColor are resolved — Figma has no access to page styles.
  if (tag === 'svg') {
    // DOM rect can be 0 when a CSS transform collapses the parent (e.g. scaleX(0)).
    // Fall back to the SVG's own width/height attributes for a sensible size.
    let svgRect = capturedRect;
    if (svgRect.width < 1 || svgRect.height < 1) {
      const attrW = parseFloat(el.getAttribute('width') || '0');
      const attrH = parseFloat(el.getAttribute('height') || '0');
      if (attrW >= 1) svgRect = { ...svgRect, width: attrW };
      if (attrH >= 1) svgRect = { ...svgRect, height: attrH };
    }
    return {
      id,
      tag,
      svgData: serializeSvgWithComputedStyles(el),
      rect: svgRect,
      computedStyles: getComputedStylesFiltered(el),
      originalDeclarations: getOriginalDeclarations(el, allRules),
      children: [],
    };
  }

  const role = el.getAttribute('role') ?? IMPLICIT_ROLES[tag];
  const dataComponent = el.getAttribute('data-component') ?? undefined;

  const computedStyles = getComputedStylesFiltered(el);
  const originalDeclarations = getOriginalDeclarations(el, allRules);

  // Mask-image icon: an element using an SVG file as a CSS mask (common icon pattern).
  // Fetch the SVG and tint it with the element's background-color so Figma gets a vector.
  const maskRaw = computedStyles['mask-image'] || computedStyles['-webkit-mask-image'] || '';
  if (maskRaw && maskRaw !== 'none') {
    const maskUrl = parseCssUrl(maskRaw);
    if (maskUrl && maskUrl.endsWith('.svg')) {
      const iconColor = computedStyles['background-color'] || computedStyles['color'] || 'black';
      const svgData = await fetchMaskSvg(maskUrl, iconColor);
      if (svgData) {
        return {
          id,
          tag,
          svgData,
          rect: capturedRect,
          computedStyles,
          originalDeclarations,
          children: [],
        };
      }
    }
  }

  const childNodes = Array.from(el.childNodes);
  // Inline formatting tags — transparent text wrappers, not block children.
  // <i> is intentionally excluded: in practice it's almost always an icon-font glyph
  // (Font Awesome, Material Icons, etc.) where the text content is a private-use
  // codepoint or a screen-reader label, not anything we want to render.
  const INLINE_TAGS = new Set(['strong', 'em', 'b', 'u', 's', 'code', 'mark', 'cite', 'small', 'abbr', 'time']);
  const hasBlockChildren = childNodes.some(n =>
    n.nodeType === Node.ELEMENT_NODE &&
    !INLINE_TAGS.has((n as Element).tagName.toLowerCase())
  );

  let textContent: string | undefined;
  let textRuns: { text: string; computedStyles: Record<string, string> }[] | undefined;
  const children: CapturedNode[] = [];

  if (tag === 'i') {
    // Icon-font element: skip text extraction. Element is preserved as an empty
    // leaf so its position/size and computed styles are still available downstream.
  } else if (!hasBlockChildren) {
    const hasInlineEls = childNodes.some(n =>
      n.nodeType === Node.ELEMENT_NODE &&
      INLINE_TAGS.has((n as Element).tagName.toLowerCase())
    );

    if (hasInlineEls) {
      // Build runs: each text node and inline element becomes a styled segment.
      const runs: { text: string; computedStyles: Record<string, string> }[] = [];
      for (const child of childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent ?? '';
          if (t.trim()) runs.push({ text: t, computedStyles });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as Element;
          if (INLINE_TAGS.has(childEl.tagName.toLowerCase())) {
            const t = childEl.textContent ?? '';
            if (t) runs.push({ text: t, computedStyles: getComputedStylesFiltered(childEl) });
          }
        }
      }
      if (runs.length > 0) textRuns = runs;
    } else {
      const text = el.textContent?.trim() ?? '';
      if (text) textContent = text;
    }
  } else {
    // Mixed or element-only: walk children, promote inline text nodes to #text entries.
    for (const child of childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const captured = await walkElement(child as Element, allRules);
        if (captured) children.push(captured);
      } else if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? '').trim();
        if (!text) continue;

        // Use Range to get an accurate bounding rect for the text run.
        let textRect = capturedRect;
        try {
          const range = document.createRange();
          range.selectNodeContents(child);
          textRect = makeRect(range.getBoundingClientRect());
        } catch {
          // fall back to parent rect
        }

        children.push({
          id: `n-${nodeCounter++}`,
          tag: '#text',
          textContent: text,
          rect: textRect,
          computedStyles,
          originalDeclarations: [],
          children: [],
        });
      }
    }
  }

  return {
    id,
    tag,
    ...(role !== undefined && { role }),
    ...(dataComponent !== undefined && { dataComponent }),
    ...(textContent !== undefined && { textContent }),
    ...(textRuns !== undefined && { textRuns }),
    rect: capturedRect,
    computedStyles,
    originalDeclarations,
    children,
  };
}

function getCssCustomProperties(sheets: CSSStyleSheet[]): Record<string, string> {
  const cs = window.getComputedStyle(document.documentElement);
  const props: Record<string, string> = {};

  for (const sheet of sheets) {
    for (const rule of collectStyleRules(sheet.cssRules)) {
      if (rule.selectorText !== ':root' && rule.selectorText !== 'html') continue;
      for (const prop of Array.from(rule.style)) {
        if (prop.startsWith('--')) {
          props[prop] = cs.getPropertyValue(prop).trim();
        }
      }
    }
  }

  // Also check inline custom properties declared directly on the root element.
  for (const prop of Array.from(document.documentElement.style)) {
    if (prop.startsWith('--')) {
      props[prop] = cs.getPropertyValue(prop).trim();
    }
  }

  return props;
}

function getFonts(): Capture['fonts'] {
  const result: Capture['fonts'] = [];
  try {
    for (const face of document.fonts) {
      result.push({
        family: face.family,
        weight: face.weight,
        style: face.style,
        status: face.status,
      });
    }
  } catch {
    // FontFaceSet unavailable in this context
  }
  return result;
}

export async function extract(requestedWidth: number): Promise<CapturePayload> {
  nodeCounter = 0;
  const warnings: string[] = [];

  // Pre-filter accessible stylesheets. Cross-origin sheets throw on .cssRules access.
  const accessibleSheets: CSSStyleSheet[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      void sheet.cssRules;
      accessibleSheets.push(sheet);
    } catch {
      warnings.push(`Cross-origin stylesheet skipped: ${sheet.href ?? '<unknown>'}`);
    }
  }

  // Collect all style rules once for the whole traversal (O(n_rules), not O(n_elements × n_rules)).
  const allRules: CSSStyleRule[] = [];
  for (const sheet of accessibleSheets) {
    allRules.push(...collectStyleRules(sheet.cssRules));
  }

  const rootEl = document.documentElement;
  const tree = await walkElement(rootEl, allRules);

  if (!tree) throw new Error('Root element was unexpectedly filtered out');

  const rootFontSize = parseFloat(window.getComputedStyle(rootEl).fontSize) || 16;

  const viewport: Viewport = {
    requestedWidth,
    actualWidth: window.innerWidth,
    actualHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };

  return {
    url: window.location.href,
    title: document.title,
    capturedAt: new Date().toISOString(),
    viewport,
    rootFontSize,
    cssCustomProperties: getCssCustomProperties(accessibleSheets),
    fonts: getFonts(),
    warnings,
    tree,
  };
}
