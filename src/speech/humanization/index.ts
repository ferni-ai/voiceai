/**
 * Speech Humanization Module
 *
 * "Better Than Human" speech humanization system.
 * Injects persona-specific human speech patterns into agent responses.
 *
 * ## Architecture
 *
 * ```
 * JSON Behavior Files (content source)
 *     ↓
 * behavior-loader.ts (loads & caches)
 *     ↓
 * speech-humanizer.ts (quickHumanizeSync)
 *     ↓
 * adaptive-ssml persona speech traits (alive-voice, greeting tagger)
 * ```
 *
 * quickHumanizeSync only acts once profiles are cached, and nothing on the live
 * path loads them today (preloadAllSpeechProfiles has no caller), so the
 * greeting passes through unchanged.
 *
 * ## JSON File Structure
 *
 * Each persona can have these behavior files:
 * - `speech-imperfections.json` - Self-corrections, trailing off, filler sounds
 * - `thinking-sounds.json` - Processing sounds, hmms, ahs
 * - `backchannels.json` - Short acknowledgments, mm-hmm
 * - `breath-sounds.json` - Sighs, contemplative breaths
 *
 * @module speech/humanization
 */

// Sync humanization (preloaded profiles)
export { quickHumanizeSync } from './speech-humanizer.js';

// Callback detection
export {
  detectCallbackTriggers,
  selectCallback,
  injectCallback,
  type CallbackTrigger,
  type DetectedCallback,
} from './callback-detector.js';

// Behavior loading (async)
export {
  loadSpeechProfile,
  clearSpeechProfileCache,
  preloadAllSpeechProfiles,
  getInjectionConfig,
  // Sync accessors (for use after preloading)
  getSpeechProfileSync,
  areSpeechProfilesPreloaded,
  selectThinkingSoundSync,
  selectImperfectionSync,
  selectBreathSoundSync,
  // Laughter contagion
  selectLaughterResponseSync,
  // Late night pacing
  isLateNightHours,
  getLateNightPacing,
  getLateNightGreeting,
  // Energy matching
  getEnergyMatchedPacing,
  // Callbacks
  shouldUseCallback,
  // Celebrations
  detectCelebrationIntensity,
  selectCelebration,
  selectCelebrationSync,
  // Catchphrases
  selectCatchphrase,
  getPowerfulQuestion,
  getPartnershipPhrase,
  CATCHPHRASE_TRIGGERS,
  // Anticipation
  getSessionOpeningPhrase,
  getTopicCallbackPhrase,
  getFutureLookingPhrase,
  getContinuityMarker,
  getPendingItemPhrase,
  type CelebrationIntensity,
  type AnticipationType,
} from './behavior-loader.js';

// Types
export type {
  // Selection context
  BehaviorSelectionContext,
  EmotionalSelectionContext,
  ContentSelectionContext,
  // Results
  SelectedBehavior,
  // Behavior schemas
  SpeechImperfectionsSchema,
  ThinkingSoundsSchema,
  BackchannelsSchema,
  BreathSoundsSchema,
  BehaviorUsageRules,
  // New behavior schemas
  LateNightPresenceSchema,
  CallbacksSchema,
  LaughterContagionSchema,
  EnergyMatchingSchema,
  EnergyLevelConfig,
  CelebrationsSchema,
  CatchphrasesSchema,
  AnticipationSchema,
  // Profile
  PersonaSpeechProfile,
  // Categories
  ImperfectionCategory,
  CoreImperfectionCategory,
  ExtendedImperfectionCategory,
  // Config
  InjectionConfig,
} from './types.js';

// Re-export EnergyLevel type
export type { EnergyLevel } from './behavior-loader.js';
