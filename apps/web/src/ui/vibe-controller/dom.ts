/**
 * Vibe Controller - safe DOM helpers and icons
 */

// ============================================================================
// SAFE DOM HELPERS
// ============================================================================

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') {
        el.className = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}

export function createSvgIcon(pathD: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const paths = pathD.split('|');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  return svg;
}

export const ICONS = {
  close: 'M18 6L6 18M6 6l12 12',
  music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  sun: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42|M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  thermometer: 'M14 4V10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z|M12 14v-4',
  play: 'M5 3l14 9-14 9V3z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  skipForward: 'M5 4l10 8-10 8V4zM19 5v14',
  volume: 'M11 5L6 9H2v6h4l5 4V5z|M19.07 4.93a10 10 0 0 1 0 14.14|M15.54 8.46a5 5 0 0 1 0 7.07',
  check: 'M20 6L9 17l-5-5',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  plug: 'M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-6 6v0a6 6 0 0 1-6-6V8Z',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10',
  wifi: 'M5 12.55a11 11 0 0 1 14.08 0|M1.42 9a16 16 0 0 1 21.16 0|M8.53 16.11a6 6 0 0 1 6.95 0|M12 20h.01',
  hue: 'M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z|M9 17v4|M15 17v4',
  ecobee: 'M14 4V10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z',
};
