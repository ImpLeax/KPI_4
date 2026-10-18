// Inline SVG line icons (Lucide geometry, 24x24 grid, round caps). Built with DOM APIs.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Each icon is a list of [tagName, attributes]. */
const ICONS = {
  leaf: [
    [
      'path',
      { d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z' },
    ],
    ['path', { d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' }],
  ],
  recycle: [
    ['path', { d: 'M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5' }],
    ['path', { d: 'M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12' }],
    ['path', { d: 'm14 16-3 3 3 3' }],
    ['path', { d: 'M8.293 13.596 7.196 9.5 3.1 10.598' }],
    [
      'path',
      {
        d: 'm9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843',
      },
    ],
    ['path', { d: 'm13.378 9.633 4.096 1.098 1.097-4.096' }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 6v6l4 2' }],
  ],
  search: [
    ['circle', { cx: 11, cy: 11, r: 8 }],
    ['path', { d: 'm21 21-4.3-4.3' }],
  ],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  x: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  trash: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ['path', { d: 'M10 11v6' }],
    ['path', { d: 'M14 11v6' }],
  ],
  pencil: [
    [
      'path',
      {
        d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      },
    ],
    ['path', { d: 'm15 5 4 4' }],
  ],
  arrowUp: [
    ['path', { d: 'm5 12 7-7 7 7' }],
    ['path', { d: 'M12 19V5' }],
  ],
  arrowDown: [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'm19 12-7 7-7-7' }],
  ],
  arrowLeft: [
    ['path', { d: 'm12 19-7-7 7-7' }],
    ['path', { d: 'M19 12H5' }],
  ],
  hammer: [
    ['path', { d: 'm15 12-8.373 8.373a1 1 0 1 1-3-3L12 9' }],
    ['path', { d: 'm18 15 4-4' }],
    [
      'path',
      {
        d: 'm21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5',
      },
    ],
  ],
  package: [
    [
      'path',
      {
        d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
      },
    ],
    ['path', { d: 'M12 22V12' }],
    ['path', { d: 'm3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }],
  ],
  heart: [
    [
      'path',
      {
        d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
      },
    ],
  ],
  home: [
    ['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
    [
      'path',
      {
        d: 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      },
    ],
  ],
  listOrdered: [
    ['path', { d: 'M10 12h11' }],
    ['path', { d: 'M10 18h11' }],
    ['path', { d: 'M10 6h11' }],
    ['path', { d: 'M4 10h2' }],
    ['path', { d: 'M4 6h1v4' }],
    ['path', { d: 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1' }],
  ],
  upload: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['path', { d: 'm17 8-5-5-5 5' }],
    ['path', { d: 'M12 3v12' }],
  ],
  alert: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 8v4' }],
    ['path', { d: 'M12 16h.01' }],
  ],
  filter: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M7 12h10' }],
    ['path', { d: 'M10 18h4' }],
  ],
  chevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
  tag: [
    [
      'path',
      {
        d: 'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
      },
    ],
    ['circle', { cx: 7.5, cy: 7.5, r: 0.5, fill: 'currentColor' }],
  ],
  rotate: [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
  ],
  sprout: [
    ['path', { d: 'M7 20h10' }],
    ['path', { d: 'M10 20c5.5-2.5.8-6.4 3-10' }],
    [
      'path',
      {
        d: 'M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z',
      },
    ],
    [
      'path',
      { d: 'M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z' },
    ],
  ],
};

/**
 * @param {keyof typeof ICONS} name
 * @param {{class?: string, strokeWidth?: number}} [options]
 * @returns {SVGSVGElement}
 */
export function icon(name, options = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(options.strokeWidth ?? 1.75));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', options.class ?? 'size-5');
  for (const [tag, attrs] of ICONS[name] ?? []) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, String(value));
    svg.append(child);
  }
  return svg;
}

/** Replace `<span data-icon="name" data-icon-class="...">` placeholders in static markup. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((placeholder) => {
    const svg = icon(placeholder.dataset.icon, {
      class: placeholder.dataset.iconClass || 'size-5',
    });
    placeholder.replaceWith(svg);
  });
}
