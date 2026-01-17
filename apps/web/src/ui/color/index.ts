/**
 * Ferni Color Intelligence System
 *
 * "Better Than Human" color system that responds to emotion, fades with time,
 * and creates harmonious transitions between personas.
 *
 * Based on the work of:
 * - Josef Albers (Interaction of Color - simultaneous contrast)
 * - James Gurney (Color and Light - atmospheric perspective)
 * - Color psychology research for emotional palette mapping
 *
 * @module color
 */

// ============================================================================
// MOOD PALETTE - Emotional Color Intelligence
// ============================================================================

export {
  // Types
  type MoodState,
  type MoodColorAdjustment,
  type PersonaPalette,
  type MoodPalette,
  type HSLColor as MoodHSLColor,

  // Constants
  MOOD_ADJUSTMENTS,
  PERSONA_BASE_PALETTES,

  // Core functions
  getMoodPalette,
  getPersonaMoodPalette,
  adjustColorForMood,
  interpolatePalettes,

  // Utilities
  hexToHSL as moodHexToHSL,
  hslToHex as moodHslToHex,
  hslToCSS,
  getContrastRatio,
  isPaletteAccessible,

  // CSS and application
  applyMoodPaletteToRoot,
  generateMoodPaletteCSS,
  generateAllMoodPalettesCSS,
} from './mood-palette.js';

// ============================================================================
// TIME FADING - Gurney Atmospheric Perspective
// ============================================================================

export {
  // Types
  type TimePeriod,
  type FadingParameters,
  type TimeFadingConfig,
  type TimeFadingResult,

  // Constants
  TIME_FADING_PARAMS,

  // Core functions
  getTimePeriod,
  getTimeDescription,
  calculateTimeFading,

  // Element operations
  applyTimeFading,
  animateTimeFading,

  // CSS generation
  generateTimeFadingCSS,
  injectTimeFadingStyles,

  // Utilities
  interpolateFadingParams,
  getTimePeriodOrder,
  isOlderPeriod,

  // Batch operations
  applyTimeFadingToAll,

  // Device adaptation
  getDeviceAdaptiveIntensity,
} from './time-fading.js';

// ============================================================================
// PERSONA HARMONY - Albers Color Transitions
// ============================================================================

export {
  // Types
  type PersonaId,
  type HSLColor,
  type TransitionStep,
  type PersonaTransition,
  type TransitionConfig,
  type ContrastEffect,

  // Constants
  PERSONA_COLORS,
  PERSONA_HSL,

  // Core functions
  getPersonaTransition,
  getPersonasBySimilarity,
  calculateSimultaneousContrast,

  // Element operations
  applyPersonaTransition,

  // CSS generation
  generatePersonaTransitionCSS,
  injectPersonaHarmonyStyles,

  // Analysis functions
  analyzePersonaHarmony,
  generateHarmonyMatrix,
  getMostHarmoniousPairs,
  getMostContrastingPairs,
} from './persona-harmony.js';

// ============================================================================
// CONVENIENCE INITIALIZER
// ============================================================================

/**
 * Initialize all color intelligence systems.
 * Call this once at app startup.
 *
 * @param persona - Active persona for brand-aligned colors
 */
export function initColorSystem(persona?: string): void {
  // Import dynamically to avoid circular dependencies
  const { applyMoodPaletteToRoot } = require('./mood-palette.js');
  const { injectTimeFadingStyles } = require('./time-fading.js');
  const { injectPersonaHarmonyStyles } = require('./persona-harmony.js');

  // Apply mood palette to root
  applyMoodPaletteToRoot(persona || 'ferni', 'calm');

  // Inject time fading and persona harmony CSS
  injectTimeFadingStyles(undefined, persona);
  injectPersonaHarmonyStyles();
}

// ============================================================================
// UNIFIED COLOR API
// ============================================================================

/**
 * Get a complete color context for the current state.
 * Combines mood, time, and persona for a unified color decision.
 */
export interface ColorContext {
  /** Current mood state */
  mood?: import('./mood-palette.js').MoodState;
  /** Active persona */
  persona?: import('./persona-harmony.js').PersonaId;
  /** Timestamp for time-fading */
  timestamp?: Date | number | string;
  /** Intensity multiplier (0-1) */
  intensity?: number;
}

/**
 * Get unified color recommendation based on full context.
 */
export function getContextualColor(
  baseColor: string,
  context: ColorContext
): {
  color: string;
  cssVariables: Record<string, string>;
  description: string;
} {
  const { mood, persona, timestamp, intensity = 1 } = context;

  let currentColor = baseColor;
  const cssVars: Record<string, string> = {};
  const descriptions: string[] = [];

  // Apply mood adjustment
  if (mood) {
    const { adjustColorForMood } = require('./mood-palette.js');
    currentColor = adjustColorForMood(currentColor, mood, intensity);
    cssVars['--mood'] = mood;
    descriptions.push(`mood-adjusted (${mood})`);
  }

  // Apply time fading
  if (timestamp) {
    const { calculateTimeFading } = require('./time-fading.js');
    const fadeResult = calculateTimeFading({
      date: timestamp,
      baseColor: currentColor,
      persona: persona || 'default',
      intensity,
    });
    currentColor = fadeResult.color;
    Object.assign(cssVars, fadeResult.cssVariables);
    descriptions.push(`time-faded (${fadeResult.period})`);
  }

  // Add persona context
  if (persona) {
    cssVars['--persona'] = persona;
    descriptions.push(`persona: ${persona}`);
  }

  cssVars['--contextual-color'] = currentColor;

  return {
    color: currentColor,
    cssVariables: cssVars,
    description: descriptions.length > 0 ? descriptions.join(', ') : 'base color',
  };
}
