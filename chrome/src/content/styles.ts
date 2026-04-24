// Extend this list to capture additional computed properties.
export const COMPUTED_STYLE_PROPERTIES: readonly string[] = [
  // Box model
  'display', 'position', 'top', 'right', 'bottom', 'left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'box-sizing', 'overflow-x', 'overflow-y', 'z-index',

  // Flex/grid
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
  'gap', 'row-gap', 'column-gap',
  'flex-grow', 'flex-shrink', 'flex-basis', 'align-self',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',

  // Typography
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'text-transform', 'white-space', 'color',

  // Visual
  'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat',
  'opacity', 'mix-blend-mode', 'visibility',
  'mask-image', '-webkit-mask-image', 'mask-size', 'mask-repeat', 'mask-position',

  // Borders
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-right-radius', 'border-bottom-left-radius',

  // Effects
  'box-shadow', 'filter', 'backdrop-filter', '-webkit-backdrop-filter', 'transform', 'transform-origin',
] as const;
