import type { CapturedNode } from '../../shared/capture-types';

function px(val: string | undefined, fallback = 0): number {
  if (!val || val === 'none' || val === 'normal') return fallback;
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

function mapJustifyContent(val: string): 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' {
  switch (val) {
    case 'flex-end':
    case 'end':
    case 'right':
      return 'MAX';
    case 'center':
      return 'CENTER';
    case 'space-between':
    case 'space-around':
    case 'space-evenly':
      return 'SPACE_BETWEEN';
    default:
      return 'MIN';
  }
}

function mapAlignItems(val: string): 'MIN' | 'CENTER' | 'MAX' | 'BASELINE' {
  switch (val) {
    case 'flex-end':
    case 'end':
      return 'MAX';
    case 'center':
      return 'CENTER';
    case 'baseline':
      return 'BASELINE';
    default:
      return 'MIN';
  }
}

export function isFlexContainer(node: CapturedNode): boolean {
  const display = node.computedStyles['display'] || '';
  return display === 'flex' || display === 'inline-flex';
}

export function applyAutoLayoutProperties(frame: FrameNode, node: CapturedNode): void {
  const cs = node.computedStyles;

  const direction = cs['flex-direction'] || 'row';
  const horizontal = direction === 'row' || direction === 'row-reverse';
  frame.layoutMode = horizontal ? 'HORIZONTAL' : 'VERTICAL';

  // Lock the captured size; setting layoutMode can otherwise collapse the frame to AUTO.
  frame.primaryAxisSizingMode = 'FIXED';
  frame.counterAxisSizingMode = 'FIXED';
  frame.resize(Math.max(1, node.rect.width), Math.max(1, node.rect.height));

  const wrap = cs['flex-wrap'] || 'nowrap';
  frame.layoutWrap = wrap === 'wrap' || wrap === 'wrap-reverse' ? 'WRAP' : 'NO_WRAP';

  const rowGap = px(cs['row-gap'] || cs['gap']);
  const colGap = px(cs['column-gap'] || cs['gap']);
  frame.itemSpacing = horizontal ? colGap : rowGap;
  if (frame.layoutWrap === 'WRAP') {
    frame.counterAxisSpacing = horizontal ? rowGap : colGap;
  }

  frame.paddingTop    = px(cs['padding-top']);
  frame.paddingRight  = px(cs['padding-right']);
  frame.paddingBottom = px(cs['padding-bottom']);
  frame.paddingLeft   = px(cs['padding-left']);

  frame.primaryAxisAlignItems = mapJustifyContent(cs['justify-content'] || 'flex-start');
  const alignItems = cs['align-items'] || 'stretch';
  // Children are sized from their captured rects, so 'stretch' is already satisfied.
  frame.counterAxisAlignItems =
    alignItems === 'stretch' || alignItems === 'normal'
      ? 'MIN'
      : mapAlignItems(alignItems);
}

export function applyAutoLayoutChildOverrides(child: SceneNode, node: CapturedNode): void {
  const pos = node.computedStyles['position'] || '';
  if ((pos === 'absolute' || pos === 'fixed' || pos === 'sticky') && 'layoutPositioning' in child) {
    (child as FrameNode).layoutPositioning = 'ABSOLUTE';
  }
}
