import type { Capture, CapturedNode } from '../shared/capture-types';
import type { BuildResult, BuildWarning } from '../shared/messages';
import type { FontMap } from './fonts';
import { collapseTree, countNodes } from './collapse';
import { collectFontIds, loadFonts } from './fonts';
import { parseColor } from './colors';
import { applyFrameProperties } from './nodes/frame';
import { applyTextProperties } from './nodes/text';

const ICON_PARENT_TAGS = new Set(['a', 'span', 'button']);

/**
 * Walk a node created by createNodeFromSvg and apply `color` as stroke on leaf
 * geometry nodes only (VectorNode etc.) — container frames are left untouched.
 */
function applyIconColor(node: SceneNode, color: { r: number; g: number; b: number; a: number }): void {
  const GEOMETRY_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE', 'POLYGON', 'RECTANGLE', 'LINE']);
  if (GEOMETRY_TYPES.has(node.type)) {
    const paint: SolidPaint = { type: 'SOLID', color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
    (node as GeometryMixin).fills = [];
    (node as GeometryMixin).strokes = [paint];
  }
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      applyIconColor(child, color);
    }
  }
}

export interface BuildOptions {
  simplify: boolean;
  onProgress: (current: number, total: number, phase: string) => void;
  svgImages: Record<string, number[]>;
}

function isTextNode(node: CapturedNode): boolean {
  return node.tag === '#text' || (node.textContent !== undefined && node.children.length === 0);
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
  svgImages: Record<string, number[]>,
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
      svgFrame.name = `svg · ${node.id}`;
      svgFrame.x = Math.round(relX);
      svgFrame.y = Math.round(relY);
      const targetW = Math.max(1, node.rect.width);
      if (svgFrame.width > 0) {
        svgFrame.rescale(targetW / svgFrame.width);
      }
      // Icon SVGs: apply captured color as stroke, no fill.
      if (ICON_PARENT_TAGS.has(parentTag)) {
        const iconColor = parseColor(effective['color'] || '');
        if (iconColor && iconColor.a > 0) {
          applyIconColor(svgFrame, iconColor);
        }
      }

      // Always unwrap the FrameNode wrapper — we only want the raw vectors.
      for (const child of [...svgFrame.children]) {
        child.x += svgFrame.x;
        child.y += svgFrame.y;
        parent.appendChild(child);
      }
      svgFrame.remove();
    } catch {
      // SVG parse failed — fall back to rasterized PNG if available, else placeholder
      const imgBytes = svgImages[node.id];
      if (imgBytes && imgBytes.length > 0) {
        const image = figma.createImage(new Uint8Array(imgBytes));
        const rect = figma.createRectangle();
        rect.name = `svg · ${node.id}`;
        rect.x = Math.round(relX);
        rect.y = Math.round(relY);
        rect.resize(Math.max(1, node.rect.width), Math.max(1, node.rect.height));
        rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
        parent.appendChild(rect);
      } else {
        const frame = figma.createFrame();
        frame.name = `svg · ${node.id}`;
        frame.x = Math.round(relX);
        frame.y = Math.round(relY);
        frame.resize(Math.max(1, node.rect.width), Math.max(1, node.rect.height));
        frame.fills = [];
        parent.appendChild(frame);
      }
    }
  } else if (isTextNode(node)) {
    const textNode = figma.createText();
    // Merge node's own styles on top of inherited so text always has correct color/font.
    const nodeWithInherited: CapturedNode = { ...node, computedStyles: effective };
    applyTextProperties(textNode, nodeWithInherited, relX, relY, fontMap, warnings);
    parent.appendChild(textNode);
  } else {
    const frame = figma.createFrame();
    applyFrameProperties(frame, node, relX, relY, warnings);

    for (const child of node.children) {
      await walkTree(child, frame, { x: node.rect.x, y: node.rect.y }, fontMap, warnings, counter, onProgress, svgImages, effective, node.tag);
    }

    parent.appendChild(frame);
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
  await walkTree(tree, rootFrame, { x: 0, y: 0 }, fontMap, warnings, counter, options.onProgress, options.svgImages);

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
