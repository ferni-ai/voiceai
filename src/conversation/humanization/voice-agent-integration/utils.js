/**
 * Voice Agent Integration - Utility Functions
 *
 * @module @ferni/humanization/voice-agent-integration/utils
 */
import { simulateBreathPattern } from '../breathing-sync.js';
import { getHumanizationOrchestrator } from '../index.js';
import { getSession } from './session-store.js';
/**
 * Create a VoiceSnapshot from prosody analysis data
 */
export function createVoiceSnapshot(prosodyData) {
    return {
        pitchMean: prosodyData.pitchHz || 150,
        pitchMin: prosodyData.pitchMin || 100,
        pitchMax: prosodyData.pitchMax || 200,
        pitchVariance: prosodyData.pitchMax && prosodyData.pitchMin
            ? (prosodyData.pitchMax - prosodyData.pitchMin) / 4
            : 25,
        speechRate: prosodyData.speechRate || 150,
        pauseRate: 8,
        avgPauseDuration: 400,
        energyMean: prosodyData.energy || 0.5,
        energyVariance: 0.15,
        breathiness: prosodyData.breathiness || 0.3,
        roughness: prosodyData.roughness || 0.2,
        strain: prosodyData.strain || 0.1,
        valence: prosodyData.valence || 0,
        arousal: prosodyData.arousal || 0.5,
        timestamp: new Date(),
    };
}
/**
 * Simulate breath pattern from emotional state
 */
export function simulateBreathFromEmotion(emotion) {
    const emotionMap = {
        calm: { isCalm: true },
        relaxed: { isCalm: true },
        peaceful: { isCalm: true },
        anxious: { isAnxious: true },
        worried: { isAnxious: true },
        stressed: { isAnxious: true },
        tired: { isTired: true },
        exhausted: { isTired: true },
        excited: { isExcited: true },
        happy: { isExcited: true },
        enthusiastic: { isExcited: true },
    };
    const hints = emotionMap[emotion.toLowerCase()] || {};
    return simulateBreathPattern(hints);
}
/**
 * Get current session state
 */
export function getSessionState(sessionId) {
    return getSession(sessionId) || null;
}
/**
 * Get all engine states for debugging
 */
export function getEngineStates(sessionId) {
    const state = getSession(sessionId);
    if (!state || !state.isActive) {
        return null;
    }
    const orchestrator = getHumanizationOrchestrator(sessionId);
    return {
        sessionState: state,
        engines: orchestrator.getEngineStates(),
    };
}
//# sourceMappingURL=utils.js.map