# Yoink

Capture any web page's DOM and import it into Figma as editable frames. Consists of two parts: a Chrome extension that captures the page, and a Figma plugin that builds the frames.

## Setup

### Chrome Extension

```bash
cd chrome
npm install
npm run build
```

Go to `chrome://extensions`, enable Developer Mode, click **Load unpacked**, and select the `chrome/dist` folder. Pin the extension for easy access.

### Figma Plugin

```bash
cd figma
npm install
npm run build
```

In Figma, go to **Plugins → Development → Import plugin from manifest** and select `figma/manifest.json`.

## Usage

1. Open the page you want to capture in Chrome.
2. Click the **Yoink** extension icon and click **Capture**.
3. Save the downloaded JSON file.
4. In Figma, run the **Yoink** plugin, drag and drop the JSON file into the plugin window.
5. Click **Create frame**.

## What gets captured

- Full DOM tree with computed styles (colors, typography, spacing, borders, shadows, backdrop blur)
- SVGs — inline with resolved colors; icon SVGs (inside `<a>`, `<span>`, `<button>`) rendered as strokes
- Mask-image icon SVGs fetched and tinted with the element's color
- `color(display-p3 ...)` and all standard CSS color formats
- Box shadows (all layers), `filter: drop-shadow()`, and `backdrop-filter: blur()`
- Font loading with Inter fallback for missing fonts

## Development

```bash
# Chrome extension — watch mode
cd chrome && npm run dev

# Figma plugin — rebuild
cd figma && npm run build
```

After changing the Figma plugin, reload it in Figma via **Plugins → Development → [plugin name] → Reload**.
After changing the Chrome extension, go to `chrome://extensions` and click the reload icon on the extension card.
