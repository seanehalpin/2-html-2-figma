# DOM Extractor — Chrome Extension

Captures DOM structure, computed styles, original CSS declarations, and a viewport screenshot from any page. Outputs a single JSON file for consumption by the companion Figma plugin.

## Install for development

```bash
cd chrome/
npm install
npm run build       # one-shot build → dist/
npm run dev         # watch mode — rebuilds on every save
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `chrome/dist/` folder
4. The **DOM Extractor** icon appears in your toolbar

After any source change, `npm run dev` rebuilds automatically. In Chrome, click the **refresh icon** on the extension card (or press the refresh button in the extension popup toolbar) to pick up changes.

## Usage

1. Navigate to any page and let it fully load
2. If you need a specific viewport width, **resize your browser window first** (see Known Limitations)
3. Click the DOM Extractor toolbar icon
4. Set the **Target viewport width** field to your intended design width (default 1440)
5. Click **Capture page**
6. After capture: **Download JSON** saves a file, **Copy to clipboard** puts it on the clipboard

The popup shows node count, payload size, and a warning if your browser's actual width differs from the requested width.

## JSON schema reference

### Top-level `Capture` object

| Field | Type | Description |
|---|---|---|
| `url` | `string` | Full URL of the captured page |
| `title` | `string` | `document.title` at capture time |
| `capturedAt` | `string` | ISO 8601 timestamp |
| `viewport.requestedWidth` | `number` | Width you entered in the popup |
| `viewport.actualWidth` | `number` | `window.innerWidth` at capture time |
| `viewport.actualHeight` | `number` | `window.innerHeight` at capture time |
| `viewport.devicePixelRatio` | `number` | `window.devicePixelRatio` |
| `rootFontSize` | `number` | `font-size` of `<html>` in px (useful for rem conversion) |
| `cssCustomProperties` | `Record<string, string>` | All `--*` properties found on `:root` / `html`, resolved values |
| `fonts` | `FontEntry[]` | Loaded font faces from `document.fonts` |
| `screenshot` | `string` | Base64 PNG data URL of the visible viewport area |
| `warnings` | `string[]` | Non-fatal issues (e.g. skipped cross-origin stylesheets) |
| `tree` | `CapturedNode` | Root of the captured DOM tree |

### `CapturedNode`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Stable ID assigned during walk (`n-0`, `n-1`, …) |
| `tag` | `string` | Lowercase tag name, or `#text` for inline text runs |
| `role` | `string?` | Explicit `role` attribute or inferred implicit ARIA role |
| `dataComponent` | `string?` | Value of `data-component` attribute if present |
| `textContent` | `string?` | Combined text for leaf nodes; set on `#text` entries |
| `rect.x/y/width/height` | `number` | `getBoundingClientRect()` values, rounded to 2 decimal places. For `#text` nodes, derived from a `Range` around the text run. |
| `computedStyles` | `Record<string, string>` | Filtered computed style properties (see list below) |
| `originalDeclarations` | `Declaration[]` | Raw CSS property/value pairs from matched rules, preserving `var()` references |
| `children` | `CapturedNode[]` | Child nodes |

### `originalDeclarations` entry

```ts
{ property: string; value: string; important: boolean }
```

Values are the **raw declared values** (e.g. `var(--color-brand)`), not computed values. Useful for recovering design token references that computed styles have resolved away.

**Cascade approximation:** declarations are collected by matching `element.matches(rule.selectorText)` and applying a last-rule-wins order. Full specificity weighting (a,b,c) is not implemented. Inline styles always win.

### Captured `computedStyles` properties

Box model · Flex/grid · Typography · Visual · Borders · Effects — see `src/content/styles.ts` for the full list. Add properties there to extend what is captured.

### Skipped elements

Elements are excluded from the tree if any of the following apply:
- Tag is `script`, `style`, `meta`, `link`, `noscript`, or `head`
- `display: none`
- `visibility: hidden`
- Bounding rect is 0×0

## Known limitations

| Limitation | Notes |
|---|---|
| **No viewport emulation** | The extension captures at your browser's current window size. Resize the window manually before capturing if you need a specific width. The `requestedWidth` vs `actualWidth` mismatch is surfaced in the popup and recorded in the JSON. |
| **Visible area screenshot only** | `chrome.tabs.captureVisibleTab` captures only the visible viewport, not the full scrollable page. Full-page capture (scrolling composite) is a future improvement. |
| **No Shadow DOM traversal** | Content inside shadow roots is not captured. TODO. |
| **No iframe traversal** | Cross-origin iframes are inaccessible; same-origin iframes are not traversed either. TODO. |
| **No pseudo-elements** | `::before`, `::after`, etc. are not captured. TODO. |
| **Cross-origin stylesheets skipped** | Stylesheets from a different origin throw on `.cssRules` access. They are skipped and a warning is added to `capture.warnings`. |
| **No font file extraction** | `fonts[]` records metadata only; font binary data is not included. |
| **Background images left as URLs** | `background-image` values are captured as computed CSS strings (e.g. `url("https://…")`), not as embedded data. |
| **Approximate cascade** | `originalDeclarations` uses last-rule-wins order without specificity weighting. Results may differ from the actual computed value on properties where specificity matters. |
| **Restricted pages** | The extension cannot run on `chrome://` pages, the Chrome Web Store, or other privileged URLs. |

## Project structure

```
chrome/
├── manifest.json              source manifest (crxjs rewrites paths at build time)
├── vite.config.ts
├── package.json
├── tsconfig.json
├── src/
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── App.svelte         Svelte 5 runes — popup UI
│   │   └── styles.module.css
│   ├── content/
│   │   ├── index.ts           message listener (chrome API boundary)
│   │   ├── extract.ts         pure extraction logic — no chrome.* calls
│   │   ├── styles.ts          computed-styles allow-list constant
│   │   └── types.ts           shared TypeScript interfaces
│   └── background/
│       └── index.ts           service worker — screenshot + message relay
├── dist/                      build output — load this folder in Chrome
└── examples/
    └── example-com.json       representative capture of example.com
```
