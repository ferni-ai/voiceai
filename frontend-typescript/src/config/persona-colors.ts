/**
 * Persona Colors - Centralized Color System
 * 
 * 🎨 SINGLE SOURCE OF TRUTH: design-system/tokens/colors.json
 * 
 * This file imports generated colors from the design system and provides:
 * - ID alias mapping (peter-john ↔ peter-lynch)
 * - Runtime color registration for dynamic agents
 * - Fallback color generation for unknown agents
 * 
 * To add a new persona's colors:
 * 1. Add to design-system/tokens/colors.json under "personas"
 * 2. Run: npm run build:persona-colors
 * 3. Colors automatically flow to CSS variables and TypeScript
 */

import { generateColorForAgent, getOrGenerateColor } from './color-generator.ts';
import type { PersonaColorConfig, ApiColorData, PersonalityForColors } from '../types/colors.ts';
import { GENERATED_PERSONA_COLORS } from './persona-colors.generated.ts';

// Re-export types for backwards compatibility
export type { PersonaColorConfig, ApiColorData, PersonalityForColors };

// ============================================================================
// ID ALIASES - Map between different naming conventions
// ============================================================================

/**
 * Maps alternative persona IDs to canonical IDs.
 * Both directions work: peter-john → peter-lynch AND peter-lynch → peter-john
 */
const ID_ALIASES: Record<string, string> = {
  // Frontend uses peter-john, design tokens use peter-lynch
  'peter-john': 'peter-lynch',
  'peter-lynch': 'peter-john',
};

/**
 * Normalize persona ID to find colors.
 * Tries the ID directly first, then checks aliases.
 */
function normalizePersonaId(personaId: string): string {
  const lower = personaId.toLowerCase();
  // If we have generated colors for this ID, use it
  if (GENERATED_PERSONA_COLORS[lower]) return lower;
  // Check if there's an alias
  const alias = ID_ALIASES[lower];
  if (alias && GENERATED_PERSONA_COLORS[alias]) return alias;
  // Return original for fallback handling
  return lower;
}

// ============================================================================
// PERSONA COLORS - Combined from generated + runtime
// ============================================================================

/**
 * 🌿 EARTHY COLOR PALETTE
 * Colors are imported from generated file (design-system/tokens/colors.json)
 * with additional runtime colors for dynamic agents.
 * 
 * Add additional hardcoded colors here that aren't in design tokens:
 */
const ADDITIONAL_COLORS: Record<string, PersonaColorConfig> = {
  // Nayan isn't in design tokens yet - add him here
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

/**
 * Combined persona colors: generated + additional + aliases
 */
// Build PERSONA_COLORS with proper type safety
const _baseColors: Record<string, PersonaColorConfig> = {
  ...GENERATED_PERSONA_COLORS,
  ...ADDITIONAL_COLORS,
};

// Add peter-john alias only if peter-lynch exists
const peterColors = GENERATED_PERSONA_COLORS['peter-lynch'] ?? ADDITIONAL_COLORS['peter-john'];
if (peterColors) {
  _baseColors['peter-john'] = peterColors;
}

export const PERSONA_COLORS: Record<string, PersonaColorConfig> = _baseColors;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get color config for a persona.
 * Checks: 1) PERSONA_COLORS, 2) aliases, 3) generates for unknown
 */
export function getPersonaColors(personaId: string): PersonaColorConfig {
  const normalized = normalizePersonaId(personaId);
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
