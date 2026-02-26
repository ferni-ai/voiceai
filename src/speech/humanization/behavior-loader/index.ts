/**
 * Speech Behavior Loader
 *
 * Unified loader for persona speech behaviors from JSON files.
 * Split into focused modules:
 * - profile-loader: Cache, loading, sync accessors, shared helpers
 * - behavior-selector: All select*() functions
 * - context-matching: Injection config, late night, energy, callbacks
 * - phrases: Celebrations, catchphrases, anticipation
 *
 * @module speech/humanization/behavior-loader
 */

export {
  // Profile loading & caching
  loadSpeechProfile,
  clearSpeechProfileCache,
  preloadAllSpeechProfiles,
  getSpeechProfileSync,
  areSpeechProfilesPreloaded,
  // Shared helpers (also used by sibling modules)
  getRandomPhrase,
  hashCode,
  matchesContext,
} from './profile-loader.js';

export {
  // Imperfection selection
  selectImperfection,
  selectImperfectionSync,
  // Thinking sound selection
  selectThinkingSound,
  selectThinkingSoundSync,
  // Backchannel selection
  selectBackchannel,
  // Breath sound selection
  selectBreathSound,
  selectBreathSoundSync,
  // Laughter contagion
  selectLaughterResponse,
  selectLaughterResponseSync,
} from './behavior-selector.js';

export {
  // Injection config
  getInjectionConfig,
  // Late night pacing
  isLateNightHours,
  getLateNightPacing,
  getLateNightGreeting,
  // Energy matching
  getEnergyMatchedPacing,
  type EnergyLevel,
  // Callbacks
  shouldUseCallback,
} from './context-matching.js';

export {
  // Celebrations
  detectCelebrationIntensity,
  selectCelebration,
  selectCelebrationSync,
  type CelebrationIntensity,
  // Catchphrases
  CATCHPHRASE_TRIGGERS,
  selectCatchphrase,
  getPowerfulQuestion,
  getPartnershipPhrase,
  // Anticipation
  getSessionOpeningPhrase,
  getTopicCallbackPhrase,
  getFutureLookingPhrase,
  getContinuityMarker,
  getPendingItemPhrase,
  type AnticipationType,
} from './phrases.js';
