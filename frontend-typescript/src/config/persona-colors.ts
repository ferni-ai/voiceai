/**
 * Persona Colors - Centralized Color System
 * 
 * 🎨 SINGLE SOURCE OF TRUTH for all persona colors.
 * 
 * Colors can come from:
 * 1. Bundle manifests (via API) - preferred for dynamic agents
 * 2. This hardcoded registry - fallback for known agents
 * 3. Auto-generated from agent ID - fallback for unknown agents
 * 
 * To add a new agent:
 * 1. Add colors to the bundle's persona.manifest.json under "marketplace.colors"
 * 2. OR add the persona ID to this registry below (for hardcoded colors)
 * 3. Colors will automatically flow to:
 *    - CSS variables ([data-persona="..."])
 *    - TypeScript PersonaConfig
 *    - Team roster UI
 *    - Avatar gradients
 *    - Selection rings & buttons
 * 
 * The earthy color palette is designed to feel:
 * - Warm and approachable
 * - Natural and organic
 * - Professional yet friendly
 * - Accessible (WCAG AA compliant)
 */

import { generateColorForAgent, getOrGenerateColor } from './color-generator.js';
import type { PersonaColorConfig, ApiColorData, PersonalityForColors } from '../types/colors.js';

// Re-export types for backwards compatibility
export type { PersonaColorConfig, ApiColorData, PersonalityForColors };

// ============================================================================
// PERSONA COLOR DEFINITIONS
// Synchronized with design-system/tokens/colors.json
// ============================================================================

/**
 * 🌿 EARTHY COLOR PALETTE
 * Each persona has a distinctive natural color that reflects their personality.
 */
export const PERSONA_COLORS: Record<string, PersonaColorConfig> = {
  // ========== COACH ==========
  'ferni': {
    primary: '#4a6741',
    secondary: '#3d5a35',
    text: '#ffffff',
    glow: 'rgba(74, 103, 65, 0.28)',
    tint: 'rgba(74, 103, 65, 0.06)',
    gradient: 'linear-gradient(135deg, #3d5a35 0%, #4a6741 100%)',
    description: 'Forest Sage - grounding, wise, natural leader',
  },

  // ========== TEAM MEMBERS ==========
  'peter-john': {
    primary: '#3a6b73',
    secondary: '#2d5359',
    text: '#ffffff',
    glow: 'rgba(58, 107, 115, 0.32)',
    tint: 'rgba(58, 107, 115, 0.06)',
    gradient: 'linear-gradient(135deg, #2d5359 0%, #3a6b73 100%)',
    description: 'Deep Teal - curiosity, research, discovery',
  },

  'alex-chen': {
    primary: '#5a6b8a',
    secondary: '#4a5a73',
    text: '#ffffff',
    glow: 'rgba(90, 107, 138, 0.32)',
    tint: 'rgba(90, 107, 138, 0.06)',
    gradient: 'linear-gradient(135deg, #4a5a73 0%, #5a6b8a 100%)',
    description: 'Slate Blue - clarity, flow, communication',
  },

  'maya-santos': {
    primary: '#a67a6a',
    secondary: '#8a635a',
    text: '#ffffff',
    glow: 'rgba(166, 122, 106, 0.32)',
    tint: 'rgba(166, 122, 106, 0.06)',
    gradient: 'linear-gradient(135deg, #8a635a 0%, #a67a6a 100%)',
    description: 'Dusty Terracotta - nurturing, warmth, habits',
  },

  'jordan-taylor': {
    primary: '#c4856a',
    secondary: '#a86d55',
    text: '#ffffff',
    glow: 'rgba(196, 133, 106, 0.32)',
    tint: 'rgba(196, 133, 106, 0.06)',
    gradient: 'linear-gradient(135deg, #a86d55 0%, #c4856a 100%)',
    description: 'Warm Coral - celebration, joy, events',
  },

  'nayan-patel': {
    primary: '#b8956a',
    secondary: '#9a7a52',
    text: '#ffffff',
    glow: 'rgba(184, 149, 106, 0.35)',
    tint: 'rgba(184, 149, 106, 0.06)',
    gradient: 'linear-gradient(135deg, #9a7a52 0%, #b8956a 100%)',
    description: 'Golden Amber - wisdom, warmth, guidance',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get color config for a persona.
 * Falls back to Ferni's colors if persona not found.
 */
export function getPersonaColors(personaId: string): PersonaColorConfig {
  const normalized = personaId.toLowerCase();
  const colors = PERSONA_COLORS[normalized];
  if (colors) return colors;
  
  // Generate colors for unknown personas instead of falling back to Ferni
  return generateColorForAgent(personaId);
}

/**
 * Get color config for a persona (alias for compatibility).
 * Returns only the fields needed by PersonaConfig.colors
 */
export function getPersonaColorConfig(personaId: string): {
  primary: string;
  secondary: string;
  glow: string;
  gradient: string;
} {
  const colors = getPersonaColors(personaId);
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    glow: colors.glow,
    gradient: colors.gradient,
  };
}

/**
 * Check if a persona has defined colors.
 */
export function hasPersonaColors(personaId: string): boolean {
  return personaId.toLowerCase() in PERSONA_COLORS;
}

/**
 * Get all persona IDs with defined colors.
 */
export function getColoredPersonaIds(): string[] {
  return Object.keys(PERSONA_COLORS);
}

/**
 * Get colors from API data or generate/fallback.
 * Use this when you have API agent data available.
 */
export function getColorsFromApiOrGenerate(
  personaId: string,
  apiColors?: ApiColorData | null,
  personality?: PersonalityForColors
): PersonaColorConfig {
  // First try API colors
  if (apiColors?.primary) {
    return getOrGenerateColor(personaId, apiColors, personality);
  }
  
  // Then try hardcoded colors
  const hardcoded = PERSONA_COLORS[personaId.toLowerCase()];
  if (hardcoded) {
    return hardcoded;
  }
  
  // Finally generate from ID
  return generateColorForAgent(personaId, personality);
}

/** Runtime color cache for dynamic agents */
const dynamicColorCache = new Map<string, PersonaColorConfig>();

/**
 * Register colors for a dynamic agent (from API).
 * Call this when loading agents from the API.
 */
export function registerDynamicColors(
  personaId: string,
  colors: PersonaColorConfig
): void {
  dynamicColorCache.set(personaId.toLowerCase(), colors);
}

/**
 * Clear all dynamic colors (call on cache invalidation).
 */
export function clearDynamicColors(): void {
  dynamicColorCache.clear();
}

/**
 * Get persona colors with dynamic color support.
 * Checks dynamic cache first, then hardcoded, then generates.
 */
export function getPersonaColorsWithDynamic(personaId: string): PersonaColorConfig {
  const normalized = personaId.toLowerCase();
  
  // Check dynamic cache first
  const dynamic = dynamicColorCache.get(normalized);
  if (dynamic) return dynamic;
  
  // Fall back to standard lookup
  return getPersonaColors(personaId);
}

/**
 * Convert persona colors to CSS custom properties object.
 * Useful for applying inline styles.
 */
export function getPersonaColorVars(personaId: string): Record<string, string> {
  const colors = getPersonaColors(personaId);
  return {
    '--persona-primary': colors.primary,
    '--persona-secondary': colors.secondary,
    '--persona-text': colors.text,
    '--persona-glow': colors.glow,
    '--persona-tint': colors.tint,
  };
}

/**
 * Generate CSS for a button gradient using persona colors.
 */
export function getPersonaButtonGradient(personaId: string, angle: number = 145): string {
  const colors = getPersonaColors(personaId);
  const lighterPrimary = lightenColor(colors.primary, 0.1);
  return `linear-gradient(${angle}deg, ${colors.secondary} 0%, ${colors.primary} 50%, ${lighterPrimary} 100%)`;
}

/**
 * Lighten a hex color by a percentage.
 */
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * percent));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// ============================================================================
// ADDING A NEW PERSONA
// ============================================================================

/**
 * 📝 HOW TO ADD A NEW PERSONA'S COLORS:
 * 
 * 1. Choose colors that fit the earthy palette:
 *    - Consider what emotion/personality the color conveys
 *    - Use HSL to pick colors with similar saturation (30-45%)
 *    - Keep lightness in 35-55% range for accessibility
 * 
 * 2. Add to PERSONA_COLORS above:
 *    'new-persona-id': {
 *      primary: '#XXXXXX',      // Main color (button bg, avatar)
 *      secondary: '#XXXXXX',    // Darker shade for gradients
 *      text: '#ffffff',         // Usually white for contrast
 *      glow: 'rgba(X,X,X,0.32)',// Soft glow effect
 *      tint: 'rgba(X,X,X,0.06)',// Subtle bg tint
 *      gradient: 'linear-gradient(135deg, secondary 0%, primary 100%)',
 *      description: 'Short personality description',
 *    },
 * 
 * 3. Also add to design-system/tokens/colors.json personas section
 * 
 * 4. Run `npm run build:tokens` to regenerate CSS
 * 
 * 5. Add the persona to personas.ts config (name, subtitle, etc.)
 * 
 * Color Palette Guidelines:
 * - Greens: Wisdom, growth, nature
 * - Browns: Warmth, trust, stability
 * - Teals: Depth, calm, exploration
 * - Blues: Communication, clarity, focus
 * - Corals: Joy, energy, creativity
 * - Ambers: Light, guidance, positivity
 */
