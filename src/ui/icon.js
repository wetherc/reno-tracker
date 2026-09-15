// Inline SVG icons. Each icon is one or more stroke paths on a 24 unit
// grid. The .icon class in base.css sets size, stroke, and color.

const NS = 'http://www.w3.org/2000/svg';

/** @type {Record<string, string>} */
export const ICON_PATHS = {
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5l-1.5-1.5M19 19l1.5 1.5M5 19l-1.5 1.5M19 5l1.5-1.5M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  alert: 'M12 3l10 18H2L12 3zM12 10v4M12 17v1',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8v1',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  upload: 'M12 15V4M7 9l5-5 5 5M4 20h16',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  house: 'M4 11l8-7 8 7M6 10v10h12V10',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  folder: 'M3 6h6l2 2h10v11H3z',
  link: 'M10 14a4 4 0 0 1 0-5.5l3-3a4 4 0 0 1 5.5 5.5l-1.5 1.5M14 10a4 4 0 0 1 0 5.5l-3 3a4 4 0 0 1-5.5-5.5L7 11.5',
};

/**
 * @param {string} name a key of ICON_PATHS
 * @param {{ label?: string }} [options] a label makes the icon announced
 * @returns {SVGSVGElement}
 */
export function icon(name, { label } = {}) {
  const d = ICON_PATHS[name];
  if (!d) throw new Error(`No icon named "${name}"`);
  const svg = /** @type {SVGSVGElement} */ (
    document.createElementNS(NS, 'svg')
  );
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('focusable', 'false');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}
