import type { Capture, CapturedNode } from '../shared/capture-types';
import type { BuildResult, BuildWarning } from '../shared/messages';
import type { FontMap } from './fonts';
import { collapseTree, countNodes } from './collapse';
import { collectFontIds, loadFonts } from './fonts';
import { parseColor } from './colors';
import { applyFrameProperties } from './nodes/frame';
import { applyTextProperties } from './nodes/text';
import { applyAutoLayoutChildOverrides, applyAutoLayoutProperties, isFlexContainer } from './nodes/autolayout';

const ICON_PARENT_TAGS = new Set(['a', 'span', 'button']);
const GEOMETRY_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE', 'POLYGON', 'RECTANGLE', 'LINE']);

// Defensive cap on stroke width after rescale. Real-world SVG icons/illustrations never
// need anything close to this — anything larger means we mis-detected the SVG's natural
// size and blew up the stroke by the rescale ratio (see extract.ts svg handling).
const MAX_STROKE_WEIGHT_PX = 20;

function clampStrokeWeights(node: SceneNode): void {
  if ('strokeWeight' in node) {
    const sw = (node as MinimalStrokesMixin).strokeWeight;
    if (typeof sw === 'number' && sw > MAX_STROKE_WEIGHT_PX) {
      (node as MinimalStrokesMixin).strokeWeight = MAX_STROKE_WEIGHT_PX;
    }
  }
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      clampStrokeWeights(child);
    }
  }
}

// After serializeSvgWithComputedStyles, all CSS vars and currentColor are resolved to real
// RGB values. If an SVG has fill-opacity variations OR multiple distinct fill colors, it's an
// illustration with intentional multi-color design — not a single-color icon to be recolored.
function svgHasOwnColors(svgData: string): boolean {
  const fills = [...svgData.matchAll(/\bfill="([^"]+)"/g)]
    .map(m => m[1])
    .filter(v => v !== 'none' && v !== 'inherit');
  if (fills.length === 0) return false;
  if (new Set(fills).size > 1) return true;
  const opacities = [...svgData.matchAll(/\bfill-opacity="([^"]+)"/g)].map(m => m[1]);
  return opacities.some(o => o !== '1' && o !== '');
}

/**
 * Recursively extract all leaf geometry nodes from an SVG-created node tree,
 * placing them directly in `target` at the correct absolute position.
 * All intermediate containers (Frame, Group, clip-path wrappers) are discarded.
 *
 * dx/dy accumulate the offset chain from the original svgFrame's position down
 * through any nested containers so every leaf ends up at the right spot.
 */
function removeClipGroups(node: BaseNode): void {
  if (!('children' in node)) return;
  for (const child of [...(node as ChildrenMixin).children]) {
    if (/clip\d/i.test(child.name)) {
      child.remove();
    } else {
      removeClipGroups(child);
    }
  }
}

function paintVectors(
  node: SceneNode,
  color: { r: number; g: number; b: number; a: number },
  iconMode: 'stroke' | 'fill',
): void {
  if (GEOMETRY_TYPES.has(node.type)) {
    const paint: SolidPaint = { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
    if (iconMode === 'stroke') {
      (node as GeometryMixin).fills = [];
      (node as GeometryMixin).strokes = [paint];
    } else {
      (node as GeometryMixin).strokes = [];
      (node as GeometryMixin).fills = [paint];
    }
    return;
  }
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      paintVectors(child, color, iconMode);
    }
  }
}

function extractVectors(
  node: SceneNode,
  target: FrameNode | PageNode,
  dx: number,
  dy: number,
  iconMode: 'stroke' | 'fill',
  iconColor?: { r: number; g: number; b: number; a: number },
): void {
  if (GEOMETRY_TYPES.has(node.type)) {
    node.x += dx;
    node.y += dy;
    if (iconColor) {
      const paint: SolidPaint = { type: 'SOLID', color: { r: iconColor.r, g: iconColor.g, b: iconColor.b }, opacity: iconColor.a };
      if (iconMode === 'stroke') {
        (node as GeometryMixin).fills = [];
        (node as GeometryMixin).strokes = [paint];
      } else {
        (node as GeometryMixin).strokes = [];
        (node as GeometryMixin).fills = [paint];
      }
    }
    target.appendChild(node);
    return;
  }
  if ('children' in node) {
    const nx = 'x' in node ? (node as { x: number }).x : 0;
    const ny = 'y' in node ? (node as { y: number }).y : 0;
    for (const child of [...(node as ChildrenMixin).children]) {
      extractVectors(child, target, dx + nx, dy + ny, iconMode, iconColor);
    }
    node.remove();
  }
}

export interface BuildOptions {
  simplify: boolean;
  iconMode: 'stroke' | 'fill';
  useAutoLayout: boolean;
  onProgress: (current: number, total: number, phase: string) => void;
}

function isTextNode(node: CapturedNode): boolean {
  return node.tag === '#text' ||
    (node.textContent !== undefined && node.children.length === 0) ||
    (node.textRuns !== undefined && node.children.length === 0);
}

// CSS properties that cascade down to child text nodes.
const INHERITED_TEXT_PROPS = [
  'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-transform', 'white-space',
] as const;

async function walkTree(
  node: CapturedNode,
  parent: FrameNode | PageNode,
  parentAbsRect: { x: number; y: number },
  fontMap: FontMap,
  warnings: BuildWarning[],
  counter: { n: number; total: number },
  onProgress: (current: number, total: number, phase: string) => void,
  iconMode: 'stroke' | 'fill',
  useAutoLayout: boolean,
  parentHasAutoLayout: boolean,
  inherited: Record<string, string> = {},
  parentTag = '',
): Promise<void> {
  counter.n++;

  // Build effective styles: start from inherited, override with this node's own values.
  const cs = node.computedStyles;
  const effective: Record<string, string> = { ...inherited };
  for (const key of INHERITED_TEXT_PROPS) {
    if (cs[key]) effective[key] = cs[key];
  }

  const relX = node.rect.x - parentAbsRect.x;
  const relY = node.rect.y - parentAbsRect.y;

  if (node.svgData !== undefined) {
    try {
      const svgFrame = figma.createNodeFromSvg(node.svgData);
      removeClipGroups(svgFrame);
      const targetW = Math.max(1, node.rect.width);
      if (svgFrame.width > 0) svgFrame.rescale(targetW / svgFrame.width);
      clampStrokeWeights(svgFrame);

      const isMaskIcon = node.tag !== 'svg';
      const isInlineIcon = node.tag === 'svg' && ICON_PARENT_TAGS.has(parentTag);

      if (isMaskIcon) {
        // Mask-image icon: append whole frame into parent, then paint vectors in-place
        const maskColor = parseColor(node.computedStyles['background-color'] || node.computedStyles['color'] || '') ?? { r: 0, g: 0, b: 0, a: 1 };
        svgFrame.name = `svg · ${node.id}`;
        svgFrame.x = Math.round(relX);
        svgFrame.y = Math.round(relY);
        parent.appendChild(svgFrame);
        if (parentHasAutoLayout) applyAutoLayoutChildOverrides(svgFrame, node);
        paintVectors(svgFrame, maskColor, iconMode);
      } else if (isInlineIcon && !svgHasOwnColors(node.svgData!)) {
        // Inline SVG monochrome icon: recolor with parent text color
        const iconColor = parseColor(effective['color'] || '') ?? undefined;
        extractVectors(svgFrame, parent, Math.round(relX), Math.round(relY), iconMode, iconColor);
      } else if (isInlineIcon) {
        // Inline SVG with its own colors: preserve as-is
        svgFrame.name = `svg · ${node.id}`;
        svgFrame.x = Math.round(relX);
        svgFrame.y = Math.round(relY);
        parent.appendChild(svgFrame);
        if (parentHasAutoLayout) applyAutoLayoutChildOverrides(svgFrame, node);
      } else {
        // Illustration: keep the full SVG frame structure intact
        svgFrame.name = `svg · ${node.id}`;
        svgFrame.x = Math.round(relX);
        svgFrame.y = Math.round(relY);
        parent.appendChild(svgFrame);
        if (parentHasAutoLayout) applyAutoLayoutChildOverrides(svgFrame, node);
      }
    } catch {
      const frame = figma.createFrame();
      frame.name = `svg · ${node.id}`;
      frame.x = Math.round(relX);
      frame.y = Math.round(relY);
      frame.resize(Math.max(1, node.rect.width), Math.max(1, node.rect.height));
      frame.fills = [];
      parent.appendChild(frame);
      if (parentHasAutoLayout) applyAutoLayoutChildOverrides(frame, node);
    }
  } else if (isTextNode(node)) {
    const textNode = figma.createText();
    // Merge node's own styles on top of inherited so text always has correct color/font.
    const nodeWithInherited: CapturedNode = { ...node, computedStyles: effective };

    if (node.tag !== '#text') {
      // Element node (e.g. <a>, <span>) collapsed to text: wrap in a frame so the
      // element's actual height (which may exceed the text's line-height) is preserved.
      const frame = figma.createFrame();
      applyFrameProperties(frame, node, relX, relY, warnings);
      applyTextProperties(textNode, nodeWithInherited, 0, 0, fontMap, warnings);
      frame.appendChild(textNode);
      // Vertically center the text within the frame
      if (textNode.height < frame.height) {
        textNode.y = Math.round((frame.height - textNode.height) / 2);
      }
      parent.appendChild(frame);
      if (parentHasAutoLayout) applyAutoLayoutChildOverrides(frame, node);
    } else {
      applyTextProperties(textNode, nodeWithInherited, relX, relY, fontMap, warnings);
      parent.appendChild(textNode);
      if (parentHasAutoLayout) applyAutoLayoutChildOverrides(textNode, node);
    }
  } else {
    const frame = figma.createFrame();
    applyFrameProperties(frame, node, relX, relY, warnings);

    const applyAL = useAutoLayout && isFlexContainer(node);
    if (applyAL) applyAutoLayoutProperties(frame, node);

    for (const child of node.children) {
      await walkTree(child, frame, { x: node.rect.x, y: node.rect.y }, fontMap, warnings, counter, onProgress, iconMode, useAutoLayout, applyAL, effective, node.tag);
    }

    parent.appendChild(frame);
    if (parentHasAutoLayout) applyAutoLayoutChildOverrides(frame, node);
  }

  if (counter.n % 50 === 0) {
    onProgress(counter.n, counter.total, 'Creating nodes');
    await new Promise<void>(r => setTimeout(r, 0));
  }
}

export async function buildCapture(capture: Capture, options: BuildOptions): Promise<BuildResult> {
  figma.skipInvisibleInstanceChildren = true;

  const collapseLog: string[] = [];
  const tree = options.simplify ? collapseTree(capture.tree, collapseLog) : capture.tree;
  const nodesCollapsed = collapseLog.length;

  // Collect and load all needed fonts before touching any nodes
  options.onProgress(0, 1, 'Loading fonts');
  const fontIds = collectFontIds(tree);
  const { fontMap, missing } = await loadFonts(fontIds);

  const warnings: BuildWarning[] = missing.map(f => ({
    level: 'warning' as const,
    message: `Font "${f.family} ${f.style}" not available — substituted Inter Regular`,
  }));

  // Warn about CSS transforms in the capture
  const total = countNodes(tree);
  const counter = { n: 0, total };

  options.onProgress(0, total, 'Creating nodes');

  // Root frame represents the captured viewport
  const page = figma.currentPage;
  const rootFrame = figma.createFrame();
  rootFrame.name = capture.title || capture.url;
  rootFrame.resize(capture.viewport.actualWidth, capture.viewport.actualHeight);
  rootFrame.x = 0;
  rootFrame.y = 0;
  rootFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }];
  rootFrame.clipsContent = true;

  // The tree root is the <html> element; position it relative to the viewport (0,0)
  await walkTree(tree, rootFrame, { x: 0, y: 0 }, fontMap, warnings, counter, options.onProgress, options.iconMode, options.useAutoLayout, false);

  page.appendChild(rootFrame);
  figma.currentPage.selection = [rootFrame];
  figma.viewport.scrollAndZoomIntoView([rootFrame]);

  return {
    nodesCreated: counter.n,
    nodesCollapsed,
    warnings,
    missingFonts: missing,
  };
}
