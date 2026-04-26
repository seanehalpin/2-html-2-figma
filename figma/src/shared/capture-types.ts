export interface TextRun {
  text: string;
  computedStyles: Record<string, string>;
}

export interface CapturedNode {
  id: string;
  tag: string;
  role?: string;
  dataComponent?: string;
  textContent?: string;
  textRuns?: TextRun[];
  svgData?: string;
  // True when the SVG draws geometry outside its element box and the markup has been
  // re-anchored to the geometry's natural extent — see chrome/extract.ts. The build
  // step unwraps these so the geometry sits directly under the parent at rect.x/rect.y,
  // instead of being nested inside a frame/group whose origin loses meaning.
  svgGeometryOutsideBox?: boolean;
  rect: { x: number; y: number; width: number; height: number };
  computedStyles: Record<string, string>;
  originalDeclarations: { property: string; value: string; important: boolean }[];
  children: CapturedNode[];
}

export interface Viewport {
  actualWidth: number;
  actualHeight: number;
  devicePixelRatio: number;
}

export interface Capture {
  url: string;
  title: string;
  capturedAt: string;
  viewport: Viewport;
  rootFontSize: number;
  cssCustomProperties: Record<string, string>;
  fonts: { family: string; weight: number | string; style: string; status: string }[];
  screenshot?: string;
  warnings: string[];
  tree: CapturedNode;
}
