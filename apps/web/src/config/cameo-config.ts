/**
 * Cameo Configuration - Frontend
 *
 * Timing and animation constants for the Team Cameo visual experience.
 * These values are synchronized with the backend cameo system.
 *
 * DESIGN PHILOSOPHY:
 * Cameos should feel like a friend briefly chiming in on speakerphone -
 * natural, warm, not jarring. The visual transition should be smooth
 * enough to feel magical but quick enough to not break conversation flow.
 */

import { DURATION, EASING } from './animation-constants.js';

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/**
 * Timing constants for cameo transitions (synchronized with backend)
 */
export const CAMEO_TIMING = {
  // ========================================
  // Sound & Arrival
  // ========================================

  /** How long to wait for arrival sound before visual starts (ms) */
  ARRIVAL_SOUND_WAIT: 150,

  /** Duration of the arrival visual transition (ms) */
  ARRIVAL_VISUAL_DURATION: 350,

  /** Pause after arrival before persona speaks (ms) */
  POST_ARRIVAL_PAUSE: 100,

  // ========================================
  // Return to Host
  // ========================================

  /** How long to wait for return sound (ms) */
  RETURN_SOUND_WAIT: 100,

  /** Duration of the return visual transition (ms) */
  RETURN_VISUAL_DURATION: 300,

  /** Total cameo arrival transition time */
  get TOTAL_ARRIVAL_TIME() {
    return this.ARRIVAL_SOUND_WAIT + this.ARRIVAL_VISUAL_DURATION + this.POST_ARRIVAL_PAUSE;
  },

  /** Total return transition time */
  get TOTAL_RETURN_TIME() {
    return this.RETURN_SOUND_WAIT + this.RETURN_VISUAL_DURATION;
  },
} as const;

// ============================================================================
// ANIMATION CONSTANTS
// ============================================================================

/**
 * Animation settings for cameo visual transitions
 */
export const CAMEO_ANIMATION = {
  // ========================================
  // Text Morph (Avatar text change)
  // ========================================

  /** Duration for text fade out */
  TEXT_FADE_OUT: DURATION.FAST, // 100ms

  /** Duration for text blur effect */
  TEXT_BLUR_DURATION: 80,

  /** Duration for text fade in */
  TEXT_FADE_IN: DURATION.NORMAL, // 200ms

  /** Easing for text transitions */
  TEXT_EASING: EASING.SPRING_GENTLE,

  // ========================================
  // Color Transition (Persona colors)
  // ========================================

  /** Duration for color transitions */
  COLOR_DURATION: DURATION.SLOW, // 300ms

  /** Easing for color transitions */
  COLOR_EASING: EASING.GENTLE,

  // ========================================
  // Glow Effects
  // ========================================

  /** Duration for glow pulse on arrival */
  GLOW_PULSE_DURATION: 400,

  /** Scale of glow pulse */
  GLOW_PULSE_SCALE: 1.15,

  /** Duration for glow color transition */
  GLOW_COLOR_DURATION: DURATION.SLOW,

  // ========================================
  // Avatar Scale (Squash & Stretch)
  // ========================================

  /** Anticipation squash before morph */
  ANTICIPATION_SCALE: 0.96,

  /** Overshoot scale on arrival */
  OVERSHOOT_SCALE: 1.04,

  /** Duration for scale animations */
  SCALE_DURATION: DURATION.FAST,

  // ========================================
  // Warmth Bloom
  // ========================================

  /** Duration for warmth bloom effect */
  WARMTH_BLOOM_DURATION: 500,

  /** Intensity of warmth bloom (0-1.5) */
  WARMTH_BLOOM_INTENSITY: 0.8,
} as const;

// ============================================================================
// PERSONA COLORS
// ============================================================================

/**
 * Persona color configuration for cameo transitions
 *
 * IMPORTANT: These values are used to set CSS variables dynamically.
 * The values MUST match the design system tokens in design-system/tokens/colors.json
 *
 * Pattern: Uses CSS variable references where possible for consistency.
 * For dynamic color setting (like setCSSVariable), we need the raw values.
 *
 * CSS Variables available from design system:
 * - var(--persona-ferni-primary)
 * - var(--persona-ferni-glow)
 * - var(--persona-peter-primary)
 * - etc.
 */
export const CAMEO_PERSONA_COLORS: Record<
  string,
  {
    /** CSS variable name for the primary color */
    primaryVar: string;
    /** Fallback primary color (matches design token) */
    primary: string;
    /** Fallback glow color (matches design token with higher opacity for cameo) */
    glow: string;
    /** Display name for the persona */
    text: string;
  }
> = {
  ferni: {
    primaryVar: 'var(--persona-ferni-primary)',
    primary: '#4a6741', // matches design-system/tokens/colors.json personas.ferni.primary
    glow: 'rgba(74, 103, 65, 0.5)', // design token glow with higher opacity for cameo effect
    text: 'Ferni',
  },
  'peter-john': {
    primaryVar: 'var(--persona-peter-primary)',
    primary: '#3a6b73', // matches personas.peter.primary
    glow: 'rgba(58, 107, 115, 0.5)',
    text: 'Peter',
  },
  peter: {
    // Alias for peter-john
    primaryVar: 'var(--persona-peter-primary)',
    primary: '#3a6b73',
    glow: 'rgba(58, 107, 115, 0.5)',
    text: 'Peter',
  },
  'alex-chen': {
    primaryVar: 'var(--persona-alex-primary)',
    primary: '#5a6b8a', // matches personas.alex.primary
    glow: 'rgba(90, 107, 138, 0.5)',
    text: 'Alex',
  },
  alex: {
    // Alias for alex-chen
    primaryVar: 'var(--persona-alex-primary)',
    primary: '#5a6b8a',
    glow: 'rgba(90, 107, 138, 0.5)',
    text: 'Alex',
  },
  'maya-santos': {
    primaryVar: 'var(--persona-maya-primary)',
    primary: '#a67a6a', // matches personas.maya.primary
    glow: 'rgba(166, 122, 106, 0.5)',
    text: 'Maya',
  },
  maya: {
    // Alias for maya-santos
    primaryVar: 'var(--persona-maya-primary)',
    primary: '#a67a6a',
    glow: 'rgba(166, 122, 106, 0.5)',
    text: 'Maya',
  },
  'jordan-taylor': {
    primaryVar: 'var(--persona-jordan-primary)',
    primary: '#c4856a', // matches personas.jordan.primary
    glow: 'rgba(196, 133, 106, 0.5)',
    text: 'Jordan',
  },
  jordan: {
    // Alias for jordan-taylor
    primaryVar: 'var(--persona-jordan-primary)',
    primary: '#c4856a',
    glow: 'rgba(196, 133, 106, 0.5)',
    text: 'Jordan',
  },
  'nayan-patel': {
    primaryVar: 'var(--persona-nayan-primary)',
    primary: '#b8956a', // matches personas.nayan.primary
    glow: 'rgba(184, 149, 106, 0.5)',
    text: 'Nayan',
  },
  nayan: {
    // Alias for nayan-patel
    primaryVar: 'var(--persona-nayan-primary)',
    primary: '#b8956a',
    glow: 'rgba(184, 149, 106, 0.5)',
    text: 'Nayan',
  },
};

// ============================================================================
// SOUND EFFECTS
// ============================================================================

/**
 * Sound effect identifiers for cameos
 *
 * SOUND DESIGN NOTES:
 * - ARRIVAL: Should be a friendly "pop" or "bubble burst" sound
 *   - ~200-300ms duration
 *   - Rising pitch, bubbly quality
 *   - Think: notification + magic sparkle
 *   - Could use existing 'connect' as base, pitch-shifted up
 *
 * - RETURN: Should be a gentle "whoosh" or "settle" sound
 *   - ~150-250ms duration
 *   - Descending pitch, settling quality
 *   - Think: soft close + exhale
 *   - Could use 'disconnect' pitched down slightly
 *
 * Until we have custom sounds, we use the handoff sounds as fallbacks
 * which work well enough for the "someone arriving" feeling.
 */
export const CAMEO_SOUNDS = {
  /** Sound when persona pops in - friendly bubble pop */
  ARRIVAL: 'cameo-arrive',

  /** Sound when returning to host - gentle settle */
  RETURN: 'cameo-return',

  /** Fallback for arrival - use dramatic entrance for more impact */
  ARRIVAL_FALLBACK: 'dramatic-entrance',

  /** Fallback for return - use connect for familiarity */
  RETURN_FALLBACK: 'connect',

  /** Generic fallback */
  FALLBACK: 'connect',
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get persona colors for a cameo transition
 *
 * Returns both the CSS variable reference (for static CSS) and
 * the fallback value (for dynamic style.setProperty calls).
 *
 * @param personaId - The persona ID (supports both full IDs and short aliases)
 * @returns Color config with primaryVar, primary fallback, glow, and text
 */
export function getCameoPersonaColors(personaId: string): {
  primaryVar: string;
  primary: string;
  glow: string;
  text: string;
} {
  const config = CAMEO_PERSONA_COLORS[personaId];
  if (config) {
    return config;
  }

  // Default to Ferni's colors if persona not found
  return {
    primaryVar: 'var(--persona-ferni-primary)',
    primary: '#4a6741', // matches design-system/tokens/colors.json
    glow: 'rgba(74, 103, 65, 0.5)',
    text: personaId,
  };
}

/**
 * Check if a persona can do cameos (not the host)
 */
export function canCameo(personaId: string): boolean {
  // Ferni is the host, doesn't do cameos
  // Jack Bogle and generic-advisor are marketplace agents, not core team
  const nonCameoPersonas = ['ferni', 'jack-b', 'generic-advisor'];
  return !nonCameoPersonas.includes(personaId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  TIMING: CAMEO_TIMING,
  ANIMATION: CAMEO_ANIMATION,
  COLORS: CAMEO_PERSONA_COLORS,
  SOUNDS: CAMEO_SOUNDS,
  getCameoPersonaColors,
  canCameo,
};
