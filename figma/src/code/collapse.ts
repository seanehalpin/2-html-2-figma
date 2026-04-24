import type { CapturedNode } from '../shared/capture-types';
import { parseColor } from './colors';

const NEVER_COLLAPSE = new Set(['html', 'body', '#text']);

function isZero(val: string | undefined): boolean {
  if (!val || val === 'none' || val === 'normal' || val === 'auto') return true;
  return parseFloat(val) === 0;
}

function isTransparent(val: string | undefined): boolean {
  if (!val || val === 'transparent') return true;
  const c = parseColor(val);
  return c === null || c.a === 0;
}

function isIdentityTransform(val: string | undefined): boolean {
  if (!val || val === 'none') return true;
  const m = val.match(/^matrix\(([^)]+)\)$/);
  if (!m) return false;
  const p = m[1].split(',').map(Number);
  return p.length === 6 && p[0] === 1 && p[1] === 0 && p[2] === 0 && p[3] === 1 && p[4] === 0 && p[5] === 0;
}

function hasNoVisualProps(node: CapturedNode): boolean {
  const cs = node.computedStyles;

  if (!isTransparent(cs['background-color'])) return false;
  if (cs['background-image'] && cs['background-image'] !== 'none') return false;

  const borderProps = [
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  ];
  if (borderProps.some(p => !isZero(cs[p]))) return false;

  if (!isZero(cs['box-shadow']) && cs['box-shadow'] !== 'none') return false;

  const paddingProps = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
  if (paddingProps.some(p => !isZero(cs[p]))) return false;

  const radiusProps = [
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
  ];
  if (radiusProps.some(p => !isZero(cs[p]))) return false;

  const opacity = parseFloat(cs['opacity'] || '1');
  if (!isNaN(opacity) && opacity < 1) return false;

  if (!isIdentityTransform(cs['transform'])) return false;

  return true;
}

/**
 * Post-order collapse: removes wrapper nodes that have exactly one child and
 * no visual properties of their own. The child inherits the parent's slot in
 * the tree; its absolute rect is unchanged (correct because rects are
 * viewport-absolute and parent-relative conversion happens at creation time).
 */
export function collapseTree(node: CapturedNode, log: string[]): CapturedNode {
  const children = node.children.map(c => collapseTree(c, log));
  const updated = { ...node, children };

  if (
    children.length === 1 &&
    !NEVER_COLLAPSE.has(node.tag) &&
    hasNoVisualProps(updated)
  ) {
    log.push(`collapsed <${node.tag} id="${node.id}"> → <${children[0].tag} id="${children[0].id}">`);
    return children[0];
  }

  return updated;
}

export function countNodes(node: CapturedNode): number {
  return 1 + node.children.reduce((n, c) => n + countNodes(c), 0);
}
