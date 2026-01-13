/**
 * Speech Module Types - Barrel Export
 *
 * Central export for all speech-related types.
 * Import from here for cleaner imports:
 *
 * @example
 * ```typescript
 * import type {
 *   ProsodyFeatures,
 *   VoiceEmotionResult,
 *   BackchannelContext,
 *   HumanListeningResult
 * } from '../speech/types/index.js';
 *
 * import {
 *   isProsodyFeatures,
 *   isVoiceEmotionResult
 * } from '../speech/types/index.js';
 * ```
 *
 * @module speech/types
 */
/**
 * Type guard for ProsodyFeatures
 * Validates that an object has the required prosody feature properties
 */
export function isProsodyFeatures(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.pitchMean === 'number' &&
        typeof obj.pitchVariance === 'number' &&
        typeof obj.energyMean === 'number' &&
        typeof obj.speechRate === 'number' &&
        typeof obj.pauseDuration === 'number' &&
        typeof obj.utteranceDuration === 'number' &&
        ['rising', 'falling', 'flat', 'dynamic'].includes(obj.pitchContour));
}
/**
 * Type guard for VoiceEmotionResult
 * Validates that an object is a valid voice emotion analysis result
 */
export function isVoiceEmotionResult(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.primary === 'string' &&
        typeof obj.valence === 'number' &&
        typeof obj.arousal === 'number' &&
        typeof obj.stressLevel === 'number' &&
        typeof obj.confidence === 'number' &&
        isProsodyFeatures(obj.prosody));
}
/**
 * Type guard for BackchannelContext
 * Validates that an object has required backchannel context properties
 */
export function isBackchannelContext(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.sessionId === 'string' &&
        typeof obj.personaId === 'string' &&
        typeof obj.silenceDurationMs === 'number' &&
        typeof obj.userSpeaking === 'boolean');
}
/**
 * Type guard for BackchannelResult
 * Validates that an object is a valid backchannel decision result
 */
export function isBackchannelResult(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.shouldBackchannel === 'boolean' &&
        (obj.phrase === undefined || typeof obj.phrase === 'string') &&
        (obj.reason === undefined || typeof obj.reason === 'string'));
}
/**
 * Type guard for HumanListeningResult
 * Validates that an object is a valid human listening analysis result
 */
export function isHumanListeningResult(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.audio === 'object' &&
        typeof obj.text === 'object' &&
        typeof obj.conversation === 'object' &&
        typeof obj.emotionalUndercurrent === 'object' &&
        typeof obj.shouldSlowDown === 'boolean' &&
        typeof obj.possibleDistress === 'boolean' &&
        typeof obj.confidence === 'number');
}
/**
 * Type guard for EmotionalMomentum
 * Validates emotional momentum state
 */
export function isEmotionalMomentum(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.valence === 'number' &&
        typeof obj.arousal === 'number' &&
        ['high', 'medium', 'low'].includes(obj.warmth) &&
        typeof obj.turnsAtState === 'number' &&
        ['building', 'stable', 'dissipating'].includes(obj.trend));
}
/**
 * Type guard for TurnPredictionResult
 * Validates turn prediction result
 */
export function isTurnPredictionResult(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.completionProbability === 'number' &&
        ['wait', 'take_turn', 'backchannel', 'uncertain'].includes(obj.recommendation) &&
        typeof obj.evidence === 'object' &&
        typeof obj.reason === 'string');
}
/**
 * Validate and narrow an unknown value to ProsodyFeatures or return null
 */
export function validateProsodyFeatures(value) {
    return isProsodyFeatures(value) ? value : null;
}
/**
 * Validate and narrow an unknown value to VoiceEmotionResult or return null
 */
export function validateVoiceEmotionResult(value) {
    return isVoiceEmotionResult(value) ? value : null;
}
/**
 * Validate and narrow an unknown value to BackchannelContext or return null
 */
export function validateBackchannelContext(value) {
    return isBackchannelContext(value) ? value : null;
}
/**
 * Validate and narrow an unknown value to BackchannelResult or return null
 */
export function validateBackchannelResult(value) {
    return isBackchannelResult(value) ? value : null;
}
/**
 * Validate and narrow an unknown value to HumanListeningResult or return null
 */
export function validateHumanListeningResult(value) {
    return isHumanListeningResult(value) ? value : null;
}
/**
 * Validate and narrow an unknown value to TurnPredictionResult or return null
 */
export function validateTurnPredictionResult(value) {
    return isTurnPredictionResult(value) ? value : null;
}
/**
 * Type guard for SpectralAnalysis
 * Validates that an object has the required spectral analysis properties
 */
export function isSpectralAnalysis(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (obj.magnitudes instanceof Float32Array &&
        obj.frequencies instanceof Float32Array &&
        typeof obj.dominantFrequency === 'number' &&
        typeof obj.spectralCentroid === 'number' &&
        typeof obj.spectralRolloff === 'number' &&
        typeof obj.bandEnergies === 'object');
}
/**
 * Type guard for AnticipatedResponse
 * Validates response anticipation result
 */
export function isAnticipatedResponse(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.intent === 'string' &&
        typeof obj.confidence === 'number' &&
        typeof obj.template === 'string' &&
        Array.isArray(obj.variables) &&
        typeof obj.isComplete === 'boolean' &&
        typeof obj.contextHint === 'string');
}
/**
 * Type guard for SpeechContext
 * Validates speech context
 */
export function isSpeechContext(value) {
    if (!value || typeof value !== 'object')
        return false;
    const obj = value;
    return (typeof obj.baseSpeed === 'number' &&
        typeof obj.userWPM === 'number' &&
        ['light', 'medium', 'heavy'].includes(obj.topicWeight) &&
        ['low', 'medium', 'high'].includes(obj.energyLevel));
}
//# sourceMappingURL=index.js.map