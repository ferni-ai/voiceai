/**
 * Animation Constants - Auto-Generated
 * 
 * 🎬 AUTO-GENERATED FROM design-system/tokens/animation.json
 * Do not edit directly - run: npm run build:animation-constants
 * Generated: 2026-01-31T17:10:10.462Z
 * 
 * This file contains the generated constants. The main animation-constants.ts
 * imports and re-exports these along with manual additions.
 */

/**
 * Duration constants in milliseconds.
 * Auto-generated from design-system/tokens/animation.json
 */
export const DURATION_GENERATED = {
  INSTANT: 0,
  FASTEST: 50,
  FASTER: 100,
  FAST: 150,
  NORMAL: 200,
  SLOW: 300,
  SLOWER: 400,
  SLOWEST: 500,
  DELIBERATE: 700,
  DRAMATIC: 1000,
  GLACIAL: 1500,
  MEDITATIVE: 3000,
  AMBIENT: 8000,
} as const;

/**
 * Easing curves as cubic-bezier strings.
 * Auto-generated from design-system/tokens/animation.json
 */
export const EASING_GENERATED = {
  LINEAR: 'linear',
  EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
  EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
  EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
  EASE_OUT_EXPO: 'cubic-bezier(0.16, 1, 0.3, 1)',
  EASE_OUT_BACK: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  EASE_IN_OUT_QUINT: 'cubic-bezier(0.83, 0, 0.17, 1)',
  SPRING: 'cubic-bezier(0.5, 1.5, 0.5, 1)',
  SPRING_BOUNCY: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  SMOOTH: 'cubic-bezier(0.45, 0, 0.55, 1)',
  ORGANIC: 'cubic-bezier(0.4, 0.2, 0.2, 1.1)',
  ELASTIC: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
  ANTICIPATE: 'cubic-bezier(0.38, -0.4, 0.88, 0.65)',
  DECELERATE: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  GENTLE: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  PLAYFUL: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

/**
 * Stagger delays for cascading animations.
 * Auto-generated from design-system/tokens/animation.json
 */
export const STAGGER_GENERATED = {
  FAST: 50,
  NORMAL: 100,
  SLOW: 150,
  DRAMATIC: 200,
} as const;

/**
 * Persona animation profiles - timing and behavior per character.
 * Auto-generated from design-system/tokens/animation.json
 */
export const PERSONA_ANIMATION_PROFILES = {
  'ferni': {
    timingMultiplier: 1,
    bounciness: 0.7,
    easingPreference: 'playful',
    thinkingStyle: 'curious-tilt',
    celebrationIntensity: 'warm',
  },
  'peter-john': {
    timingMultiplier: 0.8,
    bounciness: 0.6,
    easingPreference: 'easeOutBack',
    thinkingStyle: 'rapid-process',
    celebrationIntensity: 'enthusiastic',
  },
  'alex-chen': {
    timingMultiplier: 1.1,
    bounciness: 0.5,
    easingPreference: 'smooth',
    thinkingStyle: 'careful-consideration',
    celebrationIntensity: 'warm',
  },
  'maya-santos': {
    timingMultiplier: 0.95,
    bounciness: 0.4,
    easingPreference: 'easeInOut',
    thinkingStyle: 'methodical',
    celebrationIntensity: 'satisfied',
  },
  'jordan-taylor': {
    timingMultiplier: 0.85,
    bounciness: 0.8,
    easingPreference: 'elastic',
    thinkingStyle: 'brainstorm-burst',
    celebrationIntensity: 'exuberant',
  },
} as const;

/**
 * Persona waveform animation profiles.
 * Auto-generated from design-system/tokens/animation.json
 */
export const PERSONA_WAVEFORM_PROFILES = {
  '_documentation': {
    energy: undefined,
    smoothing: undefined,
    speed: undefined,
  },
  'ferni': {
    energy: 0.75,
    smoothing: 0.7,
    speed: 1,
  },
  'peter-john': {
    energy: 0.9,
    smoothing: 0.55,
    speed: 1.2,
  },
  'alex-chen': {
    energy: 0.7,
    smoothing: 0.75,
    speed: 1,
  },
  'maya-santos': {
    energy: 0.65,
    smoothing: 0.8,
    speed: 0.95,
  },
  'jordan-taylor': {
    energy: 0.95,
    smoothing: 0.5,
    speed: 1.15,
  },
  'default': {
    energy: 0.75,
    smoothing: 0.7,
    speed: 1,
  },
} as const;

/**
 * Avatar squash & stretch parameters per state.
 * Auto-generated from design-system/tokens/animation.json
 */
export const AVATAR_SQUASH_STRETCH = {
  idle: {
    scaleY: 1.012,
    scaleX: 0.994,
    translateY: -1.5,
    rotate: 0.3,
  },
  connected: {
    scaleY: 1.018,
    scaleX: 0.991,
    translateY: -2,
    rotate: 0.5,
  },
  speaking: {
    scaleY: 1.025,
    scaleX: 0.988,
    translateY: -3,
    rotate: 0.8,
  },
  listening: {
    scaleY: 1.015,
    scaleX: 0.993,
    translateY: -1.8,
    rotate: -0.4,
  },
} as const;

/**
 * Golden ratio and Fibonacci timing constants.
 * Auto-generated from design-system/tokens/animation.json
 */
export const PHI = 1.618033988749895;
export const PHI_INVERSE = 0.618033988749895;

export const FIBONACCI_TIMING = {
  F8: 233,
  F9: 377,
  F10: 610,
  F11: 987,
  F12: 1597,
  F13: 2584,
} as const;

export const AVATAR_BREATH_TIMING = {
  idle: 5000,
  connected: 4500,
  speaking: 3000,
  listening: 4000,
} as const;

export const REACTION_PHASES = {
  anticipation: 80,
  action: 400,
  followThrough: 150,
} as const;

// ============================================================================
// HELPER: Get persona animation profile
// ============================================================================

export function getPersonaAnimationProfile(personaId: string) {
  return PERSONA_ANIMATION_PROFILES[personaId as keyof typeof PERSONA_ANIMATION_PROFILES]
    ?? PERSONA_ANIMATION_PROFILES['ferni'];
}

export function getWaveformProfile(personaId: string) {
  return PERSONA_WAVEFORM_PROFILES[personaId as keyof typeof PERSONA_WAVEFORM_PROFILES]
    ?? PERSONA_WAVEFORM_PROFILES['default'];
}

export function getAvatarParams(state: keyof typeof AVATAR_SQUASH_STRETCH) {
  return AVATAR_SQUASH_STRETCH[state] ?? AVATAR_SQUASH_STRETCH.idle;
}
