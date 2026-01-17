/**
 * FERNI VISUALIZATION ICONS
 * =========================
 * Unified SVG icon system for data storytelling.
 * Each icon is crafted to match Ferni's warm, organic aesthetic.
 *
 * Philosophy:
 * - Consistent stroke weight (1.5px) for cohesion
 * - Rounded caps and joins for warmth
 * - Optimized for 24x24 default size
 * - Accessible with aria-label support
 *
 * Usage:
 *   import { createIcon, icons } from './icons.js';
 *
 *   // Create icon as DOM element (recommended - XSS safe)
 *   const el = createIcon('expand', { size: 20, color: 'currentColor' });
 *   container.appendChild(el);
 *
 *   // Or hydrate placeholders
 *   // <span data-icon="expand"></span>
 *   hydrateIcons();
 */

// ============================================
// SVG NAMESPACE
// ============================================

const SVG_NS = 'http://www.w3.org/2000/svg';

// ============================================
// ICON DEFINITIONS
// ============================================

export const icons = {
  // Navigation & UI
  expand: {
    paths: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
    label: 'Expand',
  },
  collapse: {
    paths: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
    label: 'Collapse',
  },
  close: {
    paths: ['M18 6L6 18', 'M6 6l12 12'],
    label: 'Close',
  },
  menu: {
    paths: ['M3 12h18', 'M3 6h18', 'M3 18h18'],
    label: 'Menu',
  },
  chevronRight: {
    paths: ['M9 18l6-6-6-6'],
    label: 'Next',
  },
  chevronLeft: {
    paths: ['M15 18l-6-6 6-6'],
    label: 'Previous',
  },
  chevronDown: {
    paths: ['M6 9l6 6 6-6'],
    label: 'Expand',
  },
  chevronUp: {
    paths: ['M18 15l-6-6-6 6'],
    label: 'Collapse',
  },

  // Actions
  share: {
    paths: ['M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
    label: 'Share',
  },
  download: {
    paths: ['M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
    label: 'Download',
  },
  copy: {
    paths: ['M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z'],
    rects: [{ x: 5, y: 5, width: 9, height: 9, rx: 2, fill: 'none' }],
    label: 'Copy',
  },
  link: {
    paths: ['M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71'],
    label: 'Link',
  },
  externalLink: {
    paths: ['M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6', 'M15 3h6v6', 'M10 14L21 3'],
    label: 'Open in new tab',
  },
  refresh: {
    paths: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15'],
    label: 'Refresh',
  },

  // Data & Charts
  trendUp: {
    paths: ['M23 6l-9.5 9.5-5-5L1 18'],
    polyline: [{ points: '17 6 23 6 23 12' }],
    label: 'Trending up',
  },
  trendDown: {
    paths: ['M23 18l-9.5-9.5-5 5L1 6'],
    polyline: [{ points: '17 18 23 18 23 12' }],
    label: 'Trending down',
  },
  barChart: {
    paths: ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
    label: 'Bar chart',
  },
  lineChart: {
    paths: ['M3 3v18h18'],
    polyline: [{ points: '7 14 11 10 15 14 21 8' }],
    label: 'Line chart',
  },
  pieChart: {
    paths: ['M21.21 15.89A10 10 0 118 2.83', 'M22 12A10 10 0 0012 2v10z'],
    label: 'Pie chart',
  },
  activity: {
    paths: ['M22 12h-4l-3 9L9 3l-3 9H2'],
    label: 'Activity',
  },

  // Time & Calendar
  calendar: {
    paths: ['M16 2v4', 'M8 2v4', 'M3 10h18'],
    rects: [{ x: 3, y: 4, width: 18, height: 18, rx: 2, fill: 'none' }],
    label: 'Calendar',
  },
  clock: {
    paths: ['M12 6v6l4 2'],
    circles: [{ cx: 12, cy: 12, r: 10 }],
    label: 'Time',
  },
  sun: {
    paths: ['M12 1v2', 'M12 21v2', 'M4.22 4.22l1.42 1.42', 'M18.36 18.36l1.42 1.42', 'M1 12h2', 'M21 12h2', 'M4.22 19.78l1.42-1.42', 'M18.36 5.64l1.42-1.42'],
    circles: [{ cx: 12, cy: 12, r: 5 }],
    label: 'Day',
  },
  moon: {
    paths: ['M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z'],
    label: 'Night',
  },

  // Communication
  message: {
    paths: ['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'],
    label: 'Message',
  },
  phone: {
    paths: ['M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z'],
    label: 'Call',
  },
  video: {
    paths: ['M23 7l-7 5 7 5V7z'],
    rects: [{ x: 1, y: 5, width: 15, height: 14, rx: 2, fill: 'none' }],
    label: 'Video',
  },

  // Personas
  ferni: {
    circles: [{ cx: 12, cy: 12, r: 10 }],
    paths: ['M8 14s1.5 2 4 2 4-2 4-2'],
    ellipses: [{ cx: 9, cy: 10, rx: 1.5, ry: 2, fill: 'white' }, { cx: 15, cy: 10, rx: 1.5, ry: 2, fill: 'white' }],
    label: 'Ferni',
    fill: 'var(--color-ferni, #4a6741)',
  },
  maya: {
    circles: [{ cx: 12, cy: 8, r: 5 }],
    paths: ['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2'],
    label: 'Maya',
  },
  peter: {
    paths: ['M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z', 'M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z'],
    label: 'Peter',
  },
  jordan: {
    paths: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
    label: 'Jordan',
  },
  alex: {
    paths: ['M22 11.08V12a10 10 0 11-5.93-9.14'],
    polyline: [{ points: '22 4 12 14.01 9 11.01' }],
    label: 'Alex',
  },
  nayan: {
    paths: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
    label: 'Nayan',
  },

  // Emotions & States
  heart: {
    paths: ['M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z'],
    label: 'Love',
  },
  smile: {
    paths: ['M8 14s1.5 2 4 2 4-2 4-2'],
    circles: [{ cx: 12, cy: 12, r: 10 }],
    lines: [{ x1: 9, y1: 9, x2: 9.01, y2: 9 }, { x1: 15, y1: 9, x2: 15.01, y2: 9 }],
    label: 'Happy',
  },
  star: {
    paths: ['M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'],
    label: 'Favorite',
  },
  sparkle: {
    paths: ['M12 3v18', 'M3 12h18', 'M5.64 5.64l12.73 12.73', 'M18.36 5.64L5.64 18.36'],
    label: 'Sparkle',
  },
  zap: {
    paths: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
    label: 'Energy',
  },

  // Visualization-specific
  layers: {
    paths: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
    label: 'Layers',
  },
  grid: {
    paths: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
    label: 'Grid view',
  },
  list: {
    paths: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    label: 'List view',
  },
  filter: {
    paths: ['M22 3H2l8 9.46V19l4 2v-8.54L22 3z'],
    label: 'Filter',
  },
  sliders: {
    paths: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
    label: 'Settings',
  },

  // Info & Help
  info: {
    paths: ['M12 16v-4', 'M12 8h.01'],
    circles: [{ cx: 12, cy: 12, r: 10 }],
    label: 'Info',
  },
  help: {
    paths: ['M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3', 'M12 17h.01'],
    circles: [{ cx: 12, cy: 12, r: 10 }],
    label: 'Help',
  },
  alert: {
    paths: ['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4', 'M12 17h.01'],
    label: 'Alert',
  },
  check: {
    paths: ['M20 6L9 17l-5-5'],
    label: 'Success',
  },
  x: {
    paths: ['M18 6L6 18', 'M6 6l12 12'],
    label: 'Error',
  },

  // Kintsugi-specific
  kintsugi: {
    paths: ['M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z', 'M7 12c0-1.5 1-3 2.5-3.5S12 7 12 7', 'M17 12c0 1.5-1 3-2.5 3.5S12 17 12 17'],
    label: 'Kintsugi',
    strokeColor: 'var(--kintsugi-gold, #C9A227)',
  },
  repair: {
    paths: ['M3 21c3-3 7-3 9 0s6 3 9 0', 'M3 14c3-3 7-3 9 0s6 3 9 0', 'M3 7c3-3 7-3 9 0s6 3 9 0'],
    label: 'Growth',
    strokeColor: 'var(--kintsugi-gold, #C9A227)',
  },
};

// ============================================
// ICON RENDERING (Safe DOM Methods)
// ============================================

/**
 * Create icon as DOM element (XSS safe - no innerHTML)
 * @param {string} name - Icon name
 * @param {Object} options - Rendering options
 * @returns {SVGElement} SVG element
 */
export function createIcon(name, options = {}) {
  const iconDef = icons[name];
  if (!iconDef) {
    console.warn(`Icon not found: ${name}`);
    return null;
  }

  const {
    size = 24,
    color = 'currentColor',
    strokeWidth = 1.5,
    className = '',
    ariaHidden = false,
  } = options;

  const strokeColor = iconDef.strokeColor || color;
  const fillColor = iconDef.fill || 'none';

  // Create SVG element
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', fillColor);
  svg.setAttribute('stroke', strokeColor);
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `viz-icon viz-icon-${name} ${className}`.trim());

  if (ariaHidden) {
    svg.setAttribute('aria-hidden', 'true');
  } else {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', iconDef.label);
  }

  // Render paths
  if (iconDef.paths) {
    iconDef.paths.forEach(d => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
  }

  // Render circles
  if (iconDef.circles) {
    iconDef.circles.forEach(c => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(c.cx));
      circle.setAttribute('cy', String(c.cy));
      circle.setAttribute('r', String(c.r));
      svg.appendChild(circle);
    });
  }

  // Render ellipses
  if (iconDef.ellipses) {
    iconDef.ellipses.forEach(e => {
      const ellipse = document.createElementNS(SVG_NS, 'ellipse');
      ellipse.setAttribute('cx', String(e.cx));
      ellipse.setAttribute('cy', String(e.cy));
      ellipse.setAttribute('rx', String(e.rx));
      ellipse.setAttribute('ry', String(e.ry));
      if (e.fill) {
        ellipse.setAttribute('fill', e.fill);
        ellipse.setAttribute('stroke', 'none');
      }
      svg.appendChild(ellipse);
    });
  }

  // Render rectangles
  if (iconDef.rects) {
    iconDef.rects.forEach(r => {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(r.x));
      rect.setAttribute('y', String(r.y));
      rect.setAttribute('width', String(r.width));
      rect.setAttribute('height', String(r.height));
      rect.setAttribute('rx', String(r.rx || 0));
      rect.setAttribute('fill', r.fill || 'none');
      svg.appendChild(rect);
    });
  }

  // Render polylines
  if (iconDef.polyline) {
    iconDef.polyline.forEach(p => {
      const polyline = document.createElementNS(SVG_NS, 'polyline');
      polyline.setAttribute('points', p.points);
      svg.appendChild(polyline);
    });
  }

  // Render lines
  if (iconDef.lines) {
    iconDef.lines.forEach(l => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(l.x1));
      line.setAttribute('y1', String(l.y1));
      line.setAttribute('x2', String(l.x2));
      line.setAttribute('y2', String(l.y2));
      svg.appendChild(line);
    });
  }

  return svg;
}

/**
 * Replace all icon placeholders in container
 * Usage: <span data-icon="expand"></span>
 */
export function hydrateIcons(container = document) {
  const placeholders = container.querySelectorAll('[data-icon]');

  placeholders.forEach(placeholder => {
    const name = placeholder.dataset.icon;
    const size = placeholder.dataset.iconSize || 24;
    const color = placeholder.dataset.iconColor || 'currentColor';

    const iconEl = createIcon(name, {
      size: parseInt(size, 10),
      color,
    });

    if (iconEl) {
      placeholder.replaceWith(iconEl);
    }
  });
}

// ============================================
// ICON SPRITE (Safe DOM Methods)
// ============================================

/**
 * Inject SVG sprite into document using safe DOM methods
 */
export function injectSprite() {
  // Check if already injected
  if (document.getElementById('viz-icon-sprite')) {
    return;
  }

  const container = document.createElement('div');
  container.id = 'viz-icon-sprite';
  container.style.display = 'none';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);

  Object.entries(icons).forEach(([name, def]) => {
    const symbol = document.createElementNS(SVG_NS, 'symbol');
    symbol.setAttribute('id', `icon-${name}`);
    symbol.setAttribute('viewBox', '0 0 24 24');

    if (def.paths) {
      def.paths.forEach(d => {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        symbol.appendChild(path);
      });
    }

    if (def.circles) {
      def.circles.forEach(c => {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(c.cx));
        circle.setAttribute('cy', String(c.cy));
        circle.setAttribute('r', String(c.r));
        symbol.appendChild(circle);
      });
    }

    if (def.rects) {
      def.rects.forEach(r => {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(r.x));
        rect.setAttribute('y', String(r.y));
        rect.setAttribute('width', String(r.width));
        rect.setAttribute('height', String(r.height));
        rect.setAttribute('rx', String(r.rx || 0));
        symbol.appendChild(rect);
      });
    }

    if (def.polyline) {
      def.polyline.forEach(p => {
        const polyline = document.createElementNS(SVG_NS, 'polyline');
        polyline.setAttribute('points', p.points);
        symbol.appendChild(polyline);
      });
    }

    svg.appendChild(symbol);
  });

  container.appendChild(svg);
  document.body.insertBefore(container, document.body.firstChild);
}

/**
 * Create icon using sprite reference
 * @param {string} name - Icon name
 * @param {Object} options - Options
 * @returns {SVGElement} SVG element with use reference
 */
export function useIcon(name, options = {}) {
  const { size = 24, className = '' } = options;
  const iconDef = icons[name];

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `viz-icon viz-icon-${name} ${className}`.trim());
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', iconDef?.label || name);

  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.appendChild(use);

  return svg;
}

// ============================================
// CSS FOR ICONS
// ============================================

/**
 * Inject icon CSS styles
 */
export function injectIconStyles() {
  if (document.getElementById('viz-icon-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'viz-icon-styles';
  style.textContent = `
    .viz-icon {
      display: inline-block;
      vertical-align: middle;
      flex-shrink: 0;
    }
    .viz-icon-button {
      cursor: pointer;
      transition: opacity 0.15s ease-out, transform 0.15s ease-out;
    }
    .viz-icon-button:hover {
      opacity: 0.8;
    }
    .viz-icon-button:active {
      transform: scale(0.95);
    }
  `;

  document.head.appendChild(style);
}

// ============================================
// EXPORT
// ============================================

export default {
  createIcon,
  hydrateIcons,
  injectSprite,
  useIcon,
  injectIconStyles,
  icons,
};
