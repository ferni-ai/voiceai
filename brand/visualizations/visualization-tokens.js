/**
 * Visualization Tokens Utility
 *
 * Single source of truth for colors in JavaScript visualizations.
 * Reads design tokens from CSS custom properties (master-tokens.css).
 *
 * Usage:
 *   import { COLORS, rgba, gradient } from './visualization-tokens.js';
 *
 *   element.style.background = COLORS.ferni;
 *   element.style.background = rgba(COLORS.ferni, 0.2);
 *   path.setAttribute('stroke', COLORS.accent);
 *
 * @version 1.0.0
 * @see ../master-tokens.css
 */

// Get computed styles from document root
const getTokenValue = (varName) => {
  if (typeof document === 'undefined') return '';
  const styles = getComputedStyle(document.documentElement);
  return styles.getPropertyValue(varName).trim();
};

// Lazy-load tokens on first access (allows DOM to be ready)
let _tokens = null;

const loadTokens = () => {
  if (_tokens) return _tokens;

  _tokens = {
    // === Background Colors ===
    bgPrimary: getTokenValue('--color-bg-primary') || '#FAF8F5',
    bgSecondary: getTokenValue('--color-bg-secondary') || '#F5F2ED',
    bgTertiary: getTokenValue('--color-bg-tertiary') || '#EFEBE4',
    bgElevated: getTokenValue('--color-bg-elevated') || '#FFFFFF',
    bgSunken: getTokenValue('--color-bg-sunken') || '#F0EDE6',

    // === Text Colors ===
    textPrimary: getTokenValue('--color-text-primary') || '#1D1B18',
    textSecondary: getTokenValue('--color-text-secondary') || '#4A4641',
    textTertiary: getTokenValue('--color-text-tertiary') || '#6B665F',
    textMuted: getTokenValue('--color-text-muted') || '#8A847C',
    textDisabled: getTokenValue('--color-text-disabled') || '#B5AFA6',
    textInverse: getTokenValue('--color-text-inverse') || '#FFFFFF',

    // === Brand Colors ===
    warmWhite: getTokenValue('--color-warm-white') || '#FAF8F5',
    naturalInk: getTokenValue('--color-natural-ink') || '#2C2520',
    naturalInkDark: getTokenValue('--color-natural-ink-dark') || '#1a1512',

    // === Accent (CTA) ===
    accent: getTokenValue('--color-accent') || '#3D5A45',
    accentHover: getTokenValue('--color-accent-hover') || '#4A6B52',
    accentPressed: getTokenValue('--color-accent-pressed') || '#2F4636',

    // === Persona: Ferni (Green - Coordinator) ===
    ferni: getTokenValue('--color-ferni') || '#4A6741',
    ferniLight: getTokenValue('--color-ferni-light') || '#5A7751',
    ferniDark: getTokenValue('--color-ferni-dark') || '#3D5A35',

    // === Persona: Maya (Terracotta - Coach) ===
    maya: getTokenValue('--color-maya') || '#A67A6A',
    mayaLight: getTokenValue('--color-maya-light') || '#B88A7A',
    mayaDark: getTokenValue('--color-maya-dark') || '#8B6558',

    // === Persona: Peter (Teal - Researcher) ===
    peter: getTokenValue('--color-peter') || '#3A6B73',
    peterLight: getTokenValue('--color-peter-light') || '#4A7B83',
    peterDark: getTokenValue('--color-peter-dark') || '#2D5A61',

    // === Persona: Jordan (Coral - Planner) ===
    jordan: getTokenValue('--color-jordan') || '#C4856A',
    jordanLight: getTokenValue('--color-jordan-light') || '#D4957A',
    jordanDark: getTokenValue('--color-jordan-dark') || '#A87058',

    // === Persona: Alex (Blue - Communicator) ===
    alex: getTokenValue('--color-alex') || '#5A6B8A',
    alexLight: getTokenValue('--color-alex-light') || '#6A7B9A',
    alexDark: getTokenValue('--color-alex-dark') || '#4A5B7A',

    // === Persona: Nayan (Gold - Wisdom) ===
    nayan: getTokenValue('--color-nayan') || '#B8956A',
    nayanLight: getTokenValue('--color-nayan-light') || '#C8A57A',
    nayanDark: getTokenValue('--color-nayan-dark') || '#9A7B55',

    // === Semantic: Status ===
    success: getTokenValue('--color-success') || '#3D7A52',
    successBright: getTokenValue('--color-success-bright') || '#10B981',
    error: getTokenValue('--color-error') || '#B5453A',
    errorBright: getTokenValue('--color-error-bright') || '#E74C3C',
    warning: getTokenValue('--color-warning') || '#A67C35',
    warningBright: getTokenValue('--color-warning-bright') || '#F5A623',

    // === Emotion Mood Colors (for visualizations) ===
    moodCalm: getTokenValue('--color-ferni') || '#4A6741',
    moodAnxious: getTokenValue('--color-error-bright') || '#E74C3C',
    moodJoyful: getTokenValue('--color-warning-bright') || '#F5A623',
    moodTired: getTokenValue('--color-text-muted') || '#9a8f85',
    moodFocused: getTokenValue('--color-peter') || '#3A6B73',
  };

  return _tokens;
};

// Export COLORS as a proxy that lazy-loads tokens
export const COLORS = new Proxy({}, {
  get(_target, prop) {
    const tokens = loadTokens();
    return tokens[prop];
  }
});

/**
 * Convert hex color to rgba
 * @param {string} hex - Hex color (#RRGGBB or #RGB)
 * @param {number} alpha - Alpha value (0-1)
 * @returns {string} rgba() string
 */
export function rgba(hex, alpha = 1) {
  // Handle CSS var() - return as-is with opacity
  if (hex.startsWith('var(')) {
    return hex; // Can't convert var() to rgba
  }

  // Remove # if present
  hex = hex.replace('#', '');

  // Expand 3-digit hex
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Create a linear gradient string
 * @param {string} direction - CSS gradient direction (e.g., '135deg', 'to right')
 * @param {Array} stops - Array of [color, position] tuples
 * @returns {string} CSS linear-gradient() string
 */
export function gradient(direction, ...stops) {
  const stopStrings = stops.map(([color, position]) =>
    position !== undefined ? `${color} ${position}` : color
  );
  return `linear-gradient(${direction}, ${stopStrings.join(', ')})`;
}

/**
 * Get persona color by name
 * @param {string} persona - Persona name (ferni, maya, peter, jordan, alex, nayan)
 * @param {string} variant - Variant (default, light, dark)
 * @returns {string} Hex color
 */
export function getPersonaColor(persona, variant = 'default') {
  const tokens = loadTokens();
  const key = variant === 'default'
    ? persona.toLowerCase()
    : `${persona.toLowerCase()}${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
  return tokens[key] || tokens.ferni;
}

/**
 * Mood color map for emotion visualizations
 * @returns {Object} Map of mood names to colors
 */
export function getMoodColors() {
  const tokens = loadTokens();
  return {
    calm: tokens.moodCalm,
    anxious: tokens.moodAnxious,
    joyful: tokens.moodJoyful,
    tired: tokens.moodTired,
    focused: tokens.moodFocused,
  };
}

/**
 * CSS variable reference string (for inline styles that support var())
 * @param {string} tokenName - Token name without -- prefix
 * @returns {string} CSS var() reference
 */
export function cssVar(tokenName) {
  return `var(--color-${tokenName})`;
}

/**
 * Apply design-system colors to SVG elements
 * @param {SVGElement} svg - SVG element or container
 * @param {Object} colorMap - Map of selectors to color tokens
 */
export function applySvgColors(svg, colorMap) {
  const tokens = loadTokens();

  Object.entries(colorMap).forEach(([selector, tokenKey]) => {
    const elements = svg.querySelectorAll(selector);
    const color = tokens[tokenKey] || tokenKey; // Allow raw colors as fallback

    elements.forEach(el => {
      if (el.hasAttribute('fill') && el.getAttribute('fill') !== 'none') {
        el.setAttribute('fill', color);
      }
      if (el.hasAttribute('stroke') && el.getAttribute('stroke') !== 'none') {
        el.setAttribute('stroke', color);
      }
    });
  });
}
