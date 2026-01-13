/**
 * Ferni Typography System
 *
 * "Better Than Human" typography that breathes, responds to emotion,
 * and gives each AI persona a distinct voice.
 *
 * @module typography
 */

// Breathing typography - text that subtly pulses with life
export {
  applyBreathingTypography,
  stopBreathing,
  updateBreathingMood,
  syncBreathingToUser,
  applyBreathingToAll,
  generateBreathingCSS,
  injectBreathingStyles,
  getBreathingState,
  isBreathing,
  BREATHING_CYCLES,
  MIN_CYCLE_DURATION,
} from './breathing-text.js';

export type {
  BreathingMood,
  BreathingConfig,
  BreathingSignal,
  BreathingState,
} from './breathing-text.js';

// Mood-weight mapping - typography that responds to emotion
export {
  getMoodTypography,
  applyMoodTypography,
  removeMoodTypography,
  transitionMoodTypography,
  generateMoodTypographyVars,
  generateMoodTypographyCSS,
  injectMoodTypographyStyles,
  interpolateMoodTypography,
  applyInterpolatedTypography,
  getCurrentMoodTypography,
  hasMoodTypography,
  getTrackedElements,
  MOOD_TYPOGRAPHY,
} from './mood-weight.js';

export type {
  TypographyMood,
  MoodTypography,
  MoodTransitionConfig,
  MoodTypographyElement,
} from './mood-weight.js';

// Persona typography - distinct voice for each AI persona
export {
  getPersonaTypography,
  getPersonaConfig,
  applyPersonaTypography,
  removePersonaTypography,
  transitionPersonaTypography,
  setActivePersona,
  getActivePersona,
  generatePersonaTypographyCSS,
  injectPersonaTypographyStyles,
  getElementPersona,
  hasPersonaTypography,
  getAvailablePersonas,
  getPersonaDescription,
  PERSONA_TYPOGRAPHY,
  PERSONA_CONFIGS,
} from './persona-voice-type.js';

export type {
  PersonaId,
  PersonaTypography,
  PersonaTypeConfig,
} from './persona-voice-type.js';

// ============================================================================
// CONVENIENCE INITIALIZER
// ============================================================================

/**
 * Initialize all typography systems.
 * Call this once at app startup.
 */
export function initTypographySystem(): void {
  // Inject all CSS
  const { injectMoodTypographyStyles } = require('./mood-weight.js');
  const { injectPersonaTypographyStyles } = require('./persona-voice-type.js');

  injectMoodTypographyStyles();
  injectPersonaTypographyStyles();
}
