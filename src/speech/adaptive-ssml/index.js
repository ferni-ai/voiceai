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
// ============================================================================
// CORE ADAPTATION
// ============================================================================
export { tagTextWithSsmlAdaptive, tagTextWithSsmlSuperhuman, } from './adaptation.js';
// ============================================================================
// EMOTION ADAPTATION
// ============================================================================
export { applyEmotionAdaptation } from './emotion-adaptation.js';
// ============================================================================
// SMART EMPHASIS
// ============================================================================
export { applySmartEmphasis } from './smart-emphasis.js';
// ============================================================================
// NONVERBAL SOUNDS
// ============================================================================
export { NONVERBALS, addNonverbalSounds, hasNonverbalSounds, } from './nonverbal-sounds.js';
// ============================================================================
// ALIVE VOICE - Makes Agents Come Alive
// ============================================================================
export { NONVERBAL_CONFIG, PERSONA_FINGERPRINTS, addOpeningSound, applyDynamicPauses, applyEmotionArcs, applyPersonaFingerprint, applySpeedVariation, getNonverbal, isNonverbalSupported, makeVoiceAlive, } from './alive-voice.js';
// ============================================================================
// CONTEXTUAL LAUGHTER - Smart Laugh Timing
// ============================================================================
export { LAUGH_TYPES, PERSONA_LAUGH_STYLES, addContextualLaughter, applyLaughter, decideLaughter, resetLaughterSession, } from './contextual-laughter.js';
// ============================================================================
// PERSONA SPEECH TRAITS - Detailed Persona-Specific Patterns
// ============================================================================
export { applyPersonaSpeechTraits, applyPersonaSpeechTraitsSync, clearTraitRegistry, getPersonaTraitsSync, getPersonasWithSpeechTraits, hasCustomSpeechTraits, preloadAllTraits, } from './persona-speech-traits-loader.js';
// ============================================================================
// AUDIO SMOOTHING
// ============================================================================
export { applyAudioSmoothing, hasAudioSmoothing, removeAudioSmoothing, } from './audio-smoothing.js';
// ============================================================================
// SPECIALIZED TAGGERS
// ============================================================================
export { tagAdvice, tagGreeting, tagStory, tagSupportResponse, tagWrapUp, } from './specialized-taggers.js';
// ============================================================================
// PHASE-SPECIFIC PERSONALITY
// ============================================================================
export { applyPhasePersonality, tagAdviceWithPersonality, tagGreetingWithPersonality, tagSupportWithPersonality, tagWrapUpWithPersonality, } from './phase-personality.js';
// ============================================================================
// COGNITIVE-AWARE SSML
// ============================================================================
export { clearCognitiveSpeechState, getCognitiveSpeechStats, tagTextWithCognitiveSsml, } from './cognitive-ssml.js';
// ============================================================================
// DYNAMIC SPEED CONTROL
// ============================================================================
export { DEFAULT_SPEED_CONFIG, applyDynamicSpeedSsml, calculateDynamicSpeed, getSpeedControlSession, getSpeedTrend, recordSpeedDecision, resetAllSpeedControlSessions, resetSpeedControlSession, } from './dynamic-speed-control.js';
// ============================================================================
// SUPERHUMAN VOICE - "Better Than Human" Enhancements
// ============================================================================
export { applySuperhmanVoice, calculateProsodicMirroring, detectHeavyContentType, getActiveSuperhmanVoiceSessionCount, getAnticipatoryComfortSound, getEmotionalTransitionBridge, getLastEmotion, getMemoryInformedBaseline, getSilencePresencePhrase, getSuperhmanVoiceSession, getVulnerabilityVoiceAdjustments, resetAllSuperhmanVoiceSessions, resetSuperhmanVoiceSession, updateSuperhmanVoiceSession, } from './superhuman-voice.js';
// ============================================================================
// ACTIVE PRESENCE - Quality Over Quantity Presence
// ============================================================================
export { addActivePresence, resetActivePresenceSession, resetAllActivePresenceSessions, } from './active-presence.js';
// ============================================================================
// STRESS AUTO-ADAPTATION - Gradual Stress-Based Voice Modulation
// ============================================================================
export { applyStressAdaptationSsml, calculateStressAdaptation, getActiveStressAdaptationCount, getStressAdaptationEngine, getStressAdaptationState, recordStressReading, resetStressAdaptationEngine, stressAdaptation, STRESS_ADAPTATION_CONFIG, } from './stress-adaptation.js';
// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export default {
    tagTextWithSsmlAdaptive: (await import('./adaptation.js')).tagTextWithSsmlAdaptive,
    tagTextWithCognitiveSsml: (await import('./cognitive-ssml.js')).tagTextWithCognitiveSsml,
    tagGreeting: (await import('./specialized-taggers.js')).tagGreeting,
    tagSupportResponse: (await import('./specialized-taggers.js')).tagSupportResponse,
    tagAdvice: (await import('./specialized-taggers.js')).tagAdvice,
    tagStory: (await import('./specialized-taggers.js')).tagStory,
    tagWrapUp: (await import('./specialized-taggers.js')).tagWrapUp,
    applyPhasePersonality: (await import('./phase-personality.js')).applyPhasePersonality,
    tagGreetingWithPersonality: (await import('./phase-personality.js')).tagGreetingWithPersonality,
    tagSupportWithPersonality: (await import('./phase-personality.js')).tagSupportWithPersonality,
    tagAdviceWithPersonality: (await import('./phase-personality.js')).tagAdviceWithPersonality,
    tagWrapUpWithPersonality: (await import('./phase-personality.js')).tagWrapUpWithPersonality,
};
//# sourceMappingURL=index.js.map