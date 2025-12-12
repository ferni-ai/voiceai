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
 * Colors for each persona (for cameo transitions)
 * These should match the design system persona colors
 */
export const CAMEO_PERSONA_COLORS: Record<
  string,
  {
    primary: string;
    glow: string;
    text: string;
  }
> = {
  ferni: {
    primary: '#4a6741',
    glow: 'rgba(74, 103, 65, 0.5)',
    text: 'Ferni',
  },
  'peter-john': {
    primary: '#3a6b73',
    glow: 'rgba(58, 107, 115, 0.5)',
    text: 'Peter',
  },
  'alex-chen': {
    primary: '#5a6b8a',
    glow: 'rgba(90, 107, 138, 0.5)',
    text: 'Alex',
  },
  'maya-santos': {
    primary: '#a67a6a',
    glow: 'rgba(166, 122, 106, 0.5)',
    text: 'Maya',
  },
  'jordan-taylor': {
    primary: '#c4856a',
    glow: 'rgba(196, 133, 106, 0.5)',
    text: 'Jordan',
  },
  'nayan-patel': {
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
 */
export function getCameoPersonaColors(personaId: string): {
  primary: string;
  glow: string;
  text: string;
} {
  return (
    CAMEO_PERSONA_COLORS[personaId] || {
      primary: '#4a6741', // Default to Ferni's colors
      glow: 'rgba(74, 103, 65, 0.5)',
      text: personaId,
    }
  );
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
