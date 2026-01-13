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
export { humanizeSpeech, quickHumanize, quickHumanizeSync, getAvailableCategories, } from './speech-humanizer.js';
export { detectCallbackTriggers, selectCallback, injectCallback, type CallbackTrigger, type DetectedCallback, } from './callback-detector.js';
export { loadSpeechProfile, clearSpeechProfileCache, preloadAllSpeechProfiles, selectImperfection, selectThinkingSound, selectBackchannel, selectBreathSound, getInjectionConfig, getSpeechProfileSync, areSpeechProfilesPreloaded, selectThinkingSoundSync, selectImperfectionSync, selectBreathSoundSync, selectLaughterResponse, selectLaughterResponseSync, isLateNightHours, getLateNightPacing, getLateNightGreeting, getEnergyMatchedPacing, shouldUseCallback, detectCelebrationIntensity, selectCelebration, selectCelebrationSync, selectCatchphrase, getPowerfulQuestion, getPartnershipPhrase, CATCHPHRASE_TRIGGERS, getSessionOpeningPhrase, getTopicCallbackPhrase, getFutureLookingPhrase, getContinuityMarker, getPendingItemPhrase, type CelebrationIntensity, type AnticipationType, } from './behavior-loader.js';
export type { BehaviorSelectionContext, EmotionalSelectionContext, ContentSelectionContext, SelectedBehavior, HumanizedSpeechResult, SpeechImperfectionsSchema, ThinkingSoundsSchema, BackchannelsSchema, BreathSoundsSchema, BehaviorUsageRules, LateNightPresenceSchema, CallbacksSchema, LaughterContagionSchema, EnergyMatchingSchema, EnergyLevelConfig, CelebrationsSchema, CatchphrasesSchema, AnticipationSchema, PersonaSpeechProfile, ImperfectionCategory, CoreImperfectionCategory, ExtendedImperfectionCategory, InjectionConfig, } from './types.js';
export type { EnergyLevel } from './behavior-loader.js';
//# sourceMappingURL=index.d.ts.map