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
import { SEMANTIC_PALETTES, HOLIDAY_PALETTES } from './emotional-tokens.generated.js';

// ============================================================================
// SEMANTIC STATE COLORS
// Earthy palette alternatives to traditional red/yellow/green
// ============================================================================

export const SEMANTIC_COLORS = SEMANTIC_PALETTES;

// ============================================================================
// HOLIDAY/SEASONAL THEME COLORS
// All use the earthy palette - no neons or saturated colors
// ============================================================================

export const HOLIDAY_COLORS = HOLIDAY_PALETTES;

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

