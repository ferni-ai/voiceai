/**
 * Brand Colors - Single Source of Truth for Backend
 *
 * These colors match the design system tokens in design-system/tokens/colors.json
 * For frontend, use CSS variables (--color-ferni, --persona-primary, etc.)
 * For backend (emails, push notifications, API responses), use these constants.
 *
 * @see design-system/tokens/colors.json for canonical definitions
 */

// ============================================================================
// BRAND COLORS
// ============================================================================

/**
 * Primary accent color for CTAs and buttons
 */
export const BRAND_ACCENT = '#3D5A45';

/**
 * Natural Ink - Primary text color (warm dark brown)
 */
export const BRAND_TEXT_PRIMARY = '#2C2520';

/**
 * Paper Cream - Background color
 */
export const BRAND_BACKGROUND = '#FFFDFB';

// ============================================================================
// PERSONA COLORS
// ============================================================================

/**
 * Persona primary colors for server-side use (emails, notifications, API responses)
 * These should match design-system/tokens/colors.json → personas
 */
export const PERSONA_COLORS = {
  ferni: '#4a6741', // Sage green
  'maya-santos': '#a67a6a', // Warm terracotta
  'alex-chen': '#5a6b8a', // Professional blue
  'peter-john': '#3a6b73', // Research teal
  'jordan-taylor': '#c4856a', // Event coral
  'nayan-patel': '#b8956a', // Wisdom gold
} as const;

/**
 * Persona secondary colors (darker variant for gradients)
 */
export const PERSONA_SECONDARY_COLORS = {
  ferni: '#3d5a35',
  'maya-santos': '#8a635a',
  'alex-chen': '#4a5a73',
  'peter-john': '#2d5359',
  'jordan-taylor': '#a86d55',
  'nayan-patel': '#9a7a52',
} as const;

/**
 * Persona glow colors (with alpha for effects)
 */
export const PERSONA_GLOW_COLORS = {
  ferni: 'rgba(74, 103, 65, 0.5)',
  'maya-santos': 'rgba(166, 122, 106, 0.5)',
  'alex-chen': 'rgba(90, 107, 138, 0.5)',
  'peter-john': 'rgba(58, 107, 115, 0.5)',
  'jordan-taylor': 'rgba(196, 133, 106, 0.5)',
  'nayan-patel': 'rgba(184, 149, 106, 0.5)',
} as const;

export type PersonaId = keyof typeof PERSONA_COLORS;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get persona primary color with fallback to Ferni
 */
export function getPersonaColor(personaId: string): string {
  return PERSONA_COLORS[personaId as PersonaId] || PERSONA_COLORS.ferni;
}

/**
 * Get persona secondary color with fallback to Ferni
 */
export function getPersonaSecondaryColor(personaId: string): string {
  return PERSONA_SECONDARY_COLORS[personaId as PersonaId] || PERSONA_SECONDARY_COLORS.ferni;
}

/**
 * Get persona glow color with fallback to Ferni
 */
export function getPersonaGlowColor(personaId: string): string {
  return PERSONA_GLOW_COLORS[personaId as PersonaId] || PERSONA_GLOW_COLORS.ferni;
}

// ============================================================================
// STATUS COLORS
// ============================================================================

export const STATUS_COLORS = {
  success: '#4a6741', // Ferni green for positive states
  warning: '#b8956a', // Nayan gold for warnings
  error: '#c4856a', // Jordan coral for errors
  info: '#5a6b8a', // Alex blue for info
} as const;

// Default export for convenience
export default {
  BRAND_ACCENT,
  BRAND_TEXT_PRIMARY,
  BRAND_BACKGROUND,
  PERSONA_COLORS,
  PERSONA_SECONDARY_COLORS,
  PERSONA_GLOW_COLORS,
  STATUS_COLORS,
  getPersonaColor,
  getPersonaSecondaryColor,
  getPersonaGlowColor,
};
