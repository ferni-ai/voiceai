/**
 * Semantic Color Tokens
 * 
 * Centralized color definitions for semantic states (error, warning, success, info)
 * and holiday/seasonal themes. All colors follow the earthy brand palette.
 * 
 * Usage:
 *   import { SEMANTIC_COLORS, HOLIDAY_COLORS } from '../config/semantic-colors.js';
 *   element.style.borderColor = SEMANTIC_COLORS.error.primary;
 */

// ============================================================================
// SEMANTIC STATE COLORS
// Earthy palette alternatives to traditional red/yellow/green
// ============================================================================

export const SEMANTIC_COLORS = {
  /** Error/destructive - Muted earthy red-brown */
  error: {
    primary: '#7a5a52',      // Dusty clay
    secondary: '#5a4038',    // Deep earth
    light: '#a67a6a',        // Terracotta light
    glow: 'rgba(122, 90, 82, 0.35)',
    text: '#ffffff',
  },
  
  /** Warning/caution - Warm amber */
  warning: {
    primary: '#a6854a',      // Warm amber
    secondary: '#8a6d3a',    // Deep amber
    light: '#c4a265',        // Golden highlight
    glow: 'rgba(166, 133, 74, 0.35)',
    text: '#ffffff',
  },
  
  /** Success/positive - Sage green (Ferni primary) */
  success: {
    primary: '#4a6741',      // Sage green
    secondary: '#3d5a35',    // Deep forest
    light: '#5a7a51',        // Light sage
    glow: 'rgba(74, 103, 65, 0.35)',
    text: '#ffffff',
  },
  
  /** Info/neutral - Slate blue-gray */
  info: {
    primary: '#5a6b8a',      // Soft indigo (Alex)
    secondary: '#4a5a73',    // Deep slate
    light: '#7a8ba0',        // Light slate
    glow: 'rgba(90, 107, 138, 0.35)',
    text: '#ffffff',
  },
  
  /** Neutral/muted - Warm gray */
  neutral: {
    primary: '#5C544A',      // Secondary text color
    secondary: '#756A5E',    // Muted
    light: '#A89D90',        // Dimmed
    glow: 'rgba(92, 84, 74, 0.25)',
    text: '#ffffff',
  },
} as const;

// ============================================================================
// HOLIDAY/SEASONAL THEME COLORS
// All use the earthy palette - no neons or saturated colors
// ============================================================================

export const HOLIDAY_COLORS = {
  /** Valentine's Day - Dusty rose/terracotta */
  valentines: {
    primary: '#a67a6a',      // Dusty terracotta (Maya)
    secondary: '#8a635a',    // Deep rose
    accent: '#c4856a',       // Warm sunset (Jordan)
    ambient: 'rgba(166, 122, 106, 0.04)',
  },
  
  /** Spring - Fresh sage greens */
  spring: {
    primary: '#4a6741',      // Sage green (Ferni)
    secondary: '#5a7a51',    // Light sage
    accent: '#b8956a',       // Golden highlight
    ambient: 'rgba(74, 103, 65, 0.03)',
  },
  
  /** Summer - Warm golden tones */
  summer: {
    primary: '#c4a265',      // Golden amber
    secondary: '#9a7b5a',    // Warm cedar (Jack)
    accent: '#c4856a',       // Sunset
    ambient: 'rgba(196, 162, 101, 0.04)',
  },
  
  /** Fall/Autumn - Rich earth tones */
  fall: {
    primary: '#a86d55',      // Deep terracotta
    secondary: '#9a7b5a',    // Cedar
    accent: '#7a5a52',       // Clay
    ambient: 'rgba(168, 109, 85, 0.04)',
  },
  
  /** Halloween - Muted orange and deep brown */
  halloween: {
    primary: '#c4856a',      // Warm sunset (not neon orange)
    secondary: '#5a4038',    // Deep earth
    accent: '#a86d55',       // Terracotta
    ambient: 'rgba(196, 133, 106, 0.05)',
  },
  
  /** Winter - Cool slate and warm accents */
  winter: {
    primary: '#5a6b8a',      // Soft indigo (Alex)
    secondary: '#4a5a73',    // Deep slate
    accent: '#b8956a',       // Golden warmth
    ambient: 'rgba(90, 107, 138, 0.03)',
  },
  
  /** Christmas - Forest green and warm gold */
  christmas: {
    primary: '#3d5a35',      // Deep forest
    secondary: '#7a5a52',    // Warm clay (not red)
    accent: '#c4a265',       // Gold
    ambient: 'rgba(61, 90, 53, 0.04)',
  },
  
  /** New Year - Elegant gold and slate */
  newYear: {
    primary: '#b8956a',      // Golden
    secondary: '#5a6b8a',    // Slate
    accent: '#c4a265',       // Bright gold
    ambient: 'rgba(184, 149, 106, 0.04)',
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get semantic color by state name
 */
export function getSemanticColor(state: keyof typeof SEMANTIC_COLORS): typeof SEMANTIC_COLORS[keyof typeof SEMANTIC_COLORS] {
  return SEMANTIC_COLORS[state];
}

/**
 * Get holiday theme colors by name
 */
export function getHolidayColors(holiday: keyof typeof HOLIDAY_COLORS): typeof HOLIDAY_COLORS[keyof typeof HOLIDAY_COLORS] {
  return HOLIDAY_COLORS[holiday];
}

/**
 * Apply semantic color CSS variables to an element
 */
export function applySemanticColors(element: HTMLElement, state: keyof typeof SEMANTIC_COLORS): void {
  const colors = SEMANTIC_COLORS[state];
  element.style.setProperty('--semantic-primary', colors.primary);
  element.style.setProperty('--semantic-secondary', colors.secondary);
  element.style.setProperty('--semantic-light', colors.light);
  element.style.setProperty('--semantic-glow', colors.glow);
}

/**
 * Apply holiday theme CSS variables to document root
 */
export function applyHolidayTheme(holiday: keyof typeof HOLIDAY_COLORS): void {
  const colors = HOLIDAY_COLORS[holiday];
  const root = document.documentElement;
  root.style.setProperty('--holiday-primary', colors.primary);
  root.style.setProperty('--holiday-secondary', colors.secondary);
  root.style.setProperty('--holiday-accent', colors.accent);
  root.style.setProperty('--holiday-ambient', colors.ambient);
}

/**
 * Clear holiday theme variables
 */
export function clearHolidayTheme(): void {
  const root = document.documentElement;
  root.style.removeProperty('--holiday-primary');
  root.style.removeProperty('--holiday-secondary');
  root.style.removeProperty('--holiday-accent');
  root.style.removeProperty('--holiday-ambient');
}

// Type exports
export type SemanticState = keyof typeof SEMANTIC_COLORS;
export type HolidayTheme = keyof typeof HOLIDAY_COLORS;

