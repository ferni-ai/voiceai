/**
 * Color Generator
 *
 * Generates consistent colors for agents that don't have colors defined.
 * Uses a hash-based algorithm to derive colors from agent IDs.
 *
 * This ensures new agents get pleasant, unique colors automatically.
 */

import type { PersonaColorConfig, ApiColorData, PersonalityForColors } from '../types/colors.js';

// Re-export types for consumers
export type { PersonaColorConfig, ApiColorData, PersonalityForColors };

// ============================================================================
// COLOR PALETTES
// ============================================================================

/**
 * Pre-defined color palettes for different agent personalities
 */
const COLOR_PALETTES = {
  // Warm palettes (for high-warmth personalities)
  warm: [
    { h: 25, s: 45, l: 45 },   // Warm brown
    { h: 35, s: 50, l: 50 },   // Golden
    { h: 15, s: 55, l: 45 },   // Terracotta
    { h: 5, s: 45, l: 50 },    // Soft red
    { h: 45, s: 40, l: 45 },   // Amber
  ],

  // Cool palettes (for high-directness personalities)
  cool: [
    { h: 200, s: 35, l: 40 },  // Steel blue
    { h: 220, s: 40, l: 45 },  // Slate
    { h: 180, s: 30, l: 40 },  // Teal
    { h: 260, s: 30, l: 45 },  // Muted purple
    { h: 170, s: 35, l: 40 },  // Sea green
  ],

  // Earthy palettes (for sage/mentor types)
  earthy: [
    { h: 30, s: 30, l: 40 },   // Brown
    { h: 85, s: 25, l: 38 },   // Olive
    { h: 50, s: 35, l: 42 },   // Tan
    { h: 20, s: 40, l: 35 },   // Rust
    { h: 60, s: 30, l: 40 },   // Moss
  ],

  // Vibrant palettes (for high-energy personalities)
  vibrant: [
    { h: 150, s: 50, l: 45 },  // Green
    { h: 340, s: 55, l: 50 },  // Pink
    { h: 270, s: 45, l: 50 },  // Purple
    { h: 190, s: 60, l: 45 },  // Cyan
    { h: 30, s: 65, l: 50 },   // Orange
  ],
};

// ============================================================================
// HASH FUNCTION
// ============================================================================

/**
 * Simple hash function for strings
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// COLOR CONVERSION
// ============================================================================

/**
 * Convert HSL to hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Darken a color (reduce lightness)
 */
function darken(h: number, s: number, l: number, amount: number = 10): string {
  return hslToHex(h, s, Math.max(0, l - amount));
}

/**
 * Lighten a color (increase lightness)
 * Exported for potential future use in dynamic theming
 */
export function lighten(h: number, s: number, l: number, amount: number = 10): string {
  return hslToHex(h, s, Math.min(100, l + amount));
}

// ============================================================================
// COLOR GENERATION
// ============================================================================

/**
 * Select a color palette based on agent personality
 */
function selectPalette(personality?: {
  warmth?: number;
  energy?: number;
  directness?: number;
}): { h: number; s: number; l: number }[] {
  if (!personality) {
    // Default to earthy palette
    return COLOR_PALETTES.earthy;
  }

  const { warmth = 0.5, energy = 0.5, directness = 0.5 } = personality;

  // High energy -> vibrant
  if (energy > 0.7) {
    return COLOR_PALETTES.vibrant;
  }

  // High directness + low warmth -> cool
  if (directness > 0.7 && warmth < 0.5) {
    return COLOR_PALETTES.cool;
  }

  // High warmth -> warm
  if (warmth > 0.7) {
    return COLOR_PALETTES.warm;
  }

  // Default to earthy
  return COLOR_PALETTES.earthy;
}

/**
 * Generate a consistent color config for an agent ID
 */
export function generateColorForAgent(
  agentId: string,
  personality?: {
    warmth?: number;
    energy?: number;
    directness?: number;
  }
): PersonaColorConfig {
  const hash = hashString(agentId);
  const palette = selectPalette(personality);

  // Select base color from palette using hash
  const paletteIndex = hash % palette.length;
  const baseColor = palette[paletteIndex] || { h: 120, s: 35, l: 40 }; // Fallback to earthy green

  // Add some variation based on hash
  const hueOffset = (hash % 30) - 15; // -15 to +15
  const h = ((baseColor.h || 120) + hueOffset + 360) % 360;
  const s = baseColor.s || 35;
  const l = baseColor.l || 40;

  const primary = hslToHex(h, s, l);
  const secondary = darken(h, s, l, 12);
  const glow = `rgba(${parseInt(primary.slice(1, 3), 16)}, ${parseInt(primary.slice(3, 5), 16)}, ${parseInt(primary.slice(5, 7), 16)}, 0.3)`;
  const tint = `rgba(${parseInt(primary.slice(1, 3), 16)}, ${parseInt(primary.slice(3, 5), 16)}, ${parseInt(primary.slice(5, 7), 16)}, 0.08)`;
  const gradient = `linear-gradient(135deg, ${secondary} 0%, ${primary} 100%)`;

  return {
    primary,
    secondary,
    text: '#ffffff',
    glow,
    tint,
    gradient,
    description: `Auto-generated for ${agentId}`,
  };
}

/**
 * Get color config for an agent, using API data if available
 * or generating from ID if not.
 */
export function getOrGenerateColor(
  agentId: string,
  apiColors?: ApiColorData | null,
  personality?: PersonalityForColors
): PersonaColorConfig {
  // Use API colors if available
  if (apiColors?.primary) {
    return {
      primary: apiColors.primary,
      secondary: apiColors.secondary || apiColors.primary,
      text: '#ffffff',
      glow: apiColors.glow || `rgba(128, 128, 128, 0.3)`,
      tint: `rgba(128, 128, 128, 0.08)`,
      gradient: apiColors.gradient || `linear-gradient(135deg, ${apiColors.secondary || apiColors.primary}, ${apiColors.primary})`,
      description: `From API for ${agentId}`,
    };
  }

  // Generate from agent ID
  return generateColorForAgent(agentId, personality);
}

// ============================================================================
// EXPORTS
// ============================================================================

export { COLOR_PALETTES };

