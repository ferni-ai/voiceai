/**
 * Adaptive SSML Tagger Module
 *
 * Wraps the existing SSML tagger with adaptive parameters based on speech context.
 * Adjusts speed, pauses, laughter, and emotion based on user and conversation state.
 *
 * Now supports persona-aware SSML via the new modular ssml/ system.
 *
 * @module adaptive-ssml
 */
export type { CognitiveSsmlOptions, PersonalityTagOptions } from './types.js';
export { tagTextWithSsmlAdaptive, tagTextWithSsmlSuperhuman, type ExtendedSpeechContext, } from './adaptation.js';
export { applyEmotionAdaptation } from './emotion-adaptation.js';
export { applySmartEmphasis, type EmphasisOptions } from './smart-emphasis.js';
export { NONVERBALS, addNonverbalSounds, hasNonverbalSounds, type NonverbalOptions, } from './nonverbal-sounds.js';
export { NONVERBAL_CONFIG, PERSONA_FINGERPRINTS, addOpeningSound, applyDynamicPauses, applyEmotionArcs, applyPersonaFingerprint, applySpeedVariation, getNonverbal, isNonverbalSupported, makeVoiceAlive, type AliveVoiceContext, type AliveVoiceResult, type NonverbalType, type PersonaFingerprint, } from './alive-voice.js';
export { LAUGH_TYPES, PERSONA_LAUGH_STYLES, addContextualLaughter, applyLaughter, decideLaughter, resetLaughterSession, type LaughterContext, type LaughterDecision, type PersonaLaughStyle, } from './contextual-laughter.js';
export { applyPersonaSpeechTraits, applyPersonaSpeechTraitsSync, clearTraitRegistry, getPersonaTraitsSync, getPersonasWithSpeechTraits, hasCustomSpeechTraits, preloadAllTraits, type PersonaSpeechTraitConfig, type SpeechTraitContext, type SpeechTraitProcessor, } from './persona-speech-traits-loader.js';
export { applyAudioSmoothing, hasAudioSmoothing, removeAudioSmoothing, type AudioSmoothingOptions, } from './audio-smoothing.js';
export { tagAdvice, tagGreeting, tagStory, tagSupportResponse, tagWrapUp, } from './specialized-taggers.js';
export { applyPhasePersonality, tagAdviceWithPersonality, tagGreetingWithPersonality, tagSupportWithPersonality, tagWrapUpWithPersonality, } from './phase-personality.js';
export { clearCognitiveSpeechState, getCognitiveSpeechStats, tagTextWithCognitiveSsml, } from './cognitive-ssml.js';
export { DEFAULT_SPEED_CONFIG, applyDynamicSpeedSsml, calculateDynamicSpeed, getSpeedControlSession, getSpeedTrend, recordSpeedDecision, resetAllSpeedControlSessions, resetSpeedControlSession, type SpeedControlConfig, type SpeedControlContext, type SpeedControlResult, } from './dynamic-speed-control.js';
export { applySuperhmanVoice, calculateProsodicMirroring, detectHeavyContentType, getActiveSuperhmanVoiceSessionCount, getAnticipatoryComfortSound, getEmotionalTransitionBridge, getLastEmotion, getMemoryInformedBaseline, getSilencePresencePhrase, getSuperhmanVoiceSession, getVulnerabilityVoiceAdjustments, resetAllSuperhmanVoiceSessions, resetSuperhmanVoiceSession, updateSuperhmanVoiceSession, type SuperhumanVoiceContext, type SuperhumanVoiceResult, } from './superhuman-voice.js';
export { addActivePresence, resetActivePresenceSession, resetAllActivePresenceSessions, type ActivePresenceContext, type ActivePresenceResult, } from './active-presence.js';
export { applyStressAdaptationSsml, calculateStressAdaptation, getActiveStressAdaptationCount, getStressAdaptationEngine, getStressAdaptationState, recordStressReading, resetStressAdaptationEngine, stressAdaptation, STRESS_ADAPTATION_CONFIG, type StressAdaptation, type StressReading, } from './stress-adaptation.js';
declare const _default: {
    tagTextWithSsmlAdaptive: typeof import("./adaptation.js").tagTextWithSsmlAdaptive;
    tagTextWithCognitiveSsml: typeof import("./cognitive-ssml.js").tagTextWithCognitiveSsml;
    tagGreeting: typeof import("./specialized-taggers.js").tagGreeting;
    tagSupportResponse: typeof import("./specialized-taggers.js").tagSupportResponse;
    tagAdvice: typeof import("./specialized-taggers.js").tagAdvice;
    tagStory: typeof import("./specialized-taggers.js").tagStory;
    tagWrapUp: typeof import("./specialized-taggers.js").tagWrapUp;
    applyPhasePersonality: typeof import("./phase-personality.js").applyPhasePersonality;
    tagGreetingWithPersonality: typeof import("./phase-personality.js").tagGreetingWithPersonality;
    tagSupportWithPersonality: typeof import("./phase-personality.js").tagSupportWithPersonality;
    tagAdviceWithPersonality: typeof import("./phase-personality.js").tagAdviceWithPersonality;
    tagWrapUpWithPersonality: typeof import("./phase-personality.js").tagWrapUpWithPersonality;
};
export default _default;
//# sourceMappingURL=index.d.ts.map