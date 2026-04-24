# DOM Extractor — Figma Plugin

Imports a JSON capture from the companion Chrome extension and reconstructs the page as a Figma frame with absolute-positioned nodes.

## Install for development

```bash
cd figma/
npm install
npm run build       # builds UI then code sequentially → dist/
```

## Import into Figma

1. In Figma desktop, open any file
2. **Main menu → Plugins → Development → Import plugin from manifest…**
3. Select `figma/manifest.json`
4. The plugin appears under **Plugins → Development → DOM Extractor — Figma Importer**

## Development workflow

```bash
npm run dev         # initial build + both watchers (UI and code)
```

In watch mode: edit source files → Vite rebuilds automatically → in Figma press **⌘⌥P** (Mac) or re-run the plugin to pick up the new build. Figma does not hot-reload plugins; you must re-run.

**Build order matters:** `build:ui` must complete before `build:code`, because `code.js` inlines the UI HTML at build time. `npm run build` enforces this. In `dev` mode, an initial sequential build runs first so the UI HTML exists before the code watcher starts.

## Usage

1. Run the Chrome extractor on a page to get a `.json` capture file
2. In Figma, run **DOM Extractor — Figma Importer**
3. Drop the `.json` file onto the drop zone (or click to browse)
4. Review the capture summary — if **actual width ≠ target width**, resize your browser and re-capture
5. Optionally uncheck **Simplify structure** to preserve all wrapper nodes
6. Click **Create frame**
7. The plugin creates the frame, selects it, and zooms to it

## Known limitations

| Limitation | Notes |
|---|---|
| **Absolute positioning only** | All nodes are positioned with fixed x/y. No auto-layout inference in v1. |
| **No gradient support** | Gradients are flattened to a solid `#e0e0e0` placeholder. Warn surfaced in results. |
| **No image content** | `background-image`, `<img>`, and `<svg>` are replaced with a light-grey placeholder fill. |
| **First box-shadow only** | Multiple shadows: only the first is applied. |
| **Border approximation** | All four border sides use the top border's weight and color. Per-side borders shown as a warning. |
| **Font substitution** | Fonts unavailable in Figma are substituted with Inter Regular. Missing fonts listed in the results panel. |
| **No Shadow DOM** | Content inside shadow roots was not captured by the extractor. |
| **No iframe traversal** | iframe content not captured. |
| **No transforms** | CSS `transform` values other than identity matrix are skipped (warned). |
| **Text wrapping may differ** | Width is fixed from the captured rect; height auto-adjusts. Line breaks may differ from the browser due to font rendering differences. |
| **Filters and clip-path** | Not applied. |

## Required JSON schema

The plugin accepts the JSON format produced by the companion Chrome extension. See `chrome/README.md` for the full schema reference.

Minimum required fields:
```json
{
  "url": "string",
  "title": "string",
  "capturedAt": "ISO timestamp",
  "viewport": { "actualWidth": number, "actualHeight": number, "requestedWidth": number, "devicePixelRatio": number },
  "tree": { "tag": "string", "rect": {...}, "computedStyles": {...}, "children": [...] }
}
```

A test fixture at `figma/fixtures/example.json` contains a hand-crafted 15-node capture you can load without running the Chrome extension.

## Project structure

```
figma/
├── manifest.json          plugin manifest (references dist/)
├── vite.config.ts         two-mode build: ui → dist/index.html, code → dist/code.js
├── package.json
├── tsconfig.json
├── dist/                  built output — import manifest from here
│   ├── code.js            IIFE bundle (Figma sandbox context, UI HTML inlined)
│   └── index.html         self-contained Svelte UI (all assets inlined by vite-plugin-singlefile)
├── src/
│   ├── shared/
│   │   ├── capture-types.ts   mirrors extractor's CapturedNode / Capture interfaces
│   │   └── messages.ts        UI ↔ code message type union
│   ├── code/
│   │   ├── index.ts           plugin entry: figma.showUI, message dispatch
│   │   ├── build.ts           orchestration: collapse → load fonts → walk tree
│   │   ├── collapse.ts        subtree collapse (pure, no figma.*)
│   │   ├── colors.ts          parseColor utility (pure)
│   │   ├── fonts.ts           font collection + loading + resolution
│   │   └── nodes/
│   │       ├── frame.ts       applyFrameProperties (fills, radius, shadow, stroke…)
│   │       └── text.ts        applyTextProperties (font, size, line-height, color…)
│   └── ui/
│       ├── index.html         Vite HTML entry for the UI build
│       ├── main.ts            Svelte mount
│       ├── App.svelte         state machine: idle → loaded → building → done
│       ├── styles.module.css
│       └── components/
│           ├── DropZone.svelte
│           ├── CaptureSummary.svelte
│           ├── ProgressBar.svelte
│           └── WarningsList.svelte
└── fixtures/
    └── example.json       hand-crafted 15-node test capture
```
