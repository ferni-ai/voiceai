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
 * speech-humanizer.ts (orchestrates injection)
 *     ↓
 * response-processor.ts (integration point)
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { humanizeSpeech } from '../speech/humanization/index.js';
 *
 * const result = await humanizeSpeech(responseText, {
 *   personaId: 'maya-santos',
 *   emotional: { userEmotion: 'excited', agentTone: 'celebratory' },
 *   content: { isCelebration: true },
 *   turnNumber: 5,
 * });
 *
 * console.log(result.text); // Text with SSML humanization
 * console.log(result.features); // ['thinking-sounds:processing', 'speech-imperfections:celebration_overflow']
 * ```
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

// Main humanization function
export {
  humanizeSpeech,
  quickHumanize,
  quickHumanizeSync,
  getAvailableCategories,
} from './speech-humanizer.js';

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
  selectImperfection,
  selectThinkingSound,
  selectBackchannel,
  selectBreathSound,
  getInjectionConfig,
  // Sync accessors (for use after preloading)
  getSpeechProfileSync,
  areSpeechProfilesPreloaded,
  selectThinkingSoundSync,
  selectImperfectionSync,
  selectBreathSoundSync,
  // Laughter contagion
  selectLaughterResponse,
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
  HumanizedSpeechResult,
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
