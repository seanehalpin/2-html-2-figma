export interface CapturedNode {
  id: string;
  tag: string;
  role?: string;
  dataComponent?: string;
  textContent?: string;
  svgData?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computedStyles: Record<string, string>;
  originalDeclarations: {
    property: string;
    value: string;
    important: boolean;
  }[];
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
  fonts: {
    family: string;
    weight: number | string;
    style: string;
    status: string;
  }[];
  screenshot: string;
  warnings: string[];
  tree: CapturedNode;
}

// Content script returns this; background adds `screenshot` before forwarding to popup.
export type CapturePayload = Omit<Capture, 'screenshot'>;

export type Message =
  | { type: 'capture-request' }
  | { type: 'capture-response'; payload: Capture }
  | { type: 'capture-error'; error: string };
