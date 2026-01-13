/**
 * Conversation-Aware Prosody System
 *
 * Inspired by Sesame AI's approach: "Speech generation must go beyond
 * producing high-quality audio—it must understand and adapt to context
 * in real time."
 *
 * This module tracks emotional state across the conversation and
 * recommends prosody adjustments based on conversational context,
 * not just the current message.
 *
 * @module speech/sesame-inspired/conversation-prosody
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'ConversationProsody' });
// =============================================================================
// EMOTION INTENSITY MAPPING
// =============================================================================
/**
 * Map emotions to intensity levels (0-1)
 */
const EMOTION_INTENSITY = {
    // High intensity
    excited: 0.9,
    enthusiastic: 0.85,
    elated: 0.9,
    euphoric: 0.95,
    triumphant: 0.9,
    panicked: 0.95,
    outraged: 0.9,
    // Medium-high intensity
    happy: 0.7,
    surprised: 0.75,
    amazed: 0.8,
    angry: 0.8,
    scared: 0.8,
    frustrated: 0.7,
    // Medium intensity
    curious: 0.5,
    anticipation: 0.55,
    confident: 0.6,
    proud: 0.6,
    'joking/comedic': 0.6,
    sympathetic: 0.5,
    affectionate: 0.55,
    // Low-medium intensity
    content: 0.35,
    grateful: 0.45,
    nostalgic: 0.4,
    wistful: 0.4,
    contemplative: 0.35,
    // Low intensity
    calm: 0.2,
    peaceful: 0.15,
    serene: 0.15,
    neutral: 0.1,
    tired: 0.2,
    bored: 0.15,
    // Sad spectrum (medium intensity)
    sad: 0.6,
    dejected: 0.7,
    melancholic: 0.5,
    disappointed: 0.55,
    hurt: 0.65,
    guilty: 0.6,
    rejected: 0.7,
    // Uncertain (low-medium)
    hesitant: 0.35,
    insecure: 0.4,
    confused: 0.4,
    apologetic: 0.35,
    anxious: 0.6,
    // Negative low energy
    resigned: 0.3,
    distant: 0.2,
    skeptical: 0.35,
    sarcastic: 0.45,
    ironic: 0.4,
    contempt: 0.55,
    disgusted: 0.6,
    envious: 0.5,
    // Other
    alarmed: 0.75,
    threatened: 0.7,
    mad: 0.75,
    agitated: 0.65,
    determined: 0.6,
    flirtatious: 0.5,
    mysterious: 0.35,
};
/**
 * Emotions that indicate heavy/serious topics
 */
const HEAVY_EMOTIONS = [
    'sad',
    'dejected',
    'hurt',
    'guilty',
    'rejected',
    'melancholic',
    'anxious',
    'scared',
    'panicked',
    'sympathetic',
];
// =============================================================================
// TRAJECTORY CALCULATION
// =============================================================================
/**
 * Calculate emotional trajectory from history
 */
export function calculateTrajectory(emotionHistory) {
    if (emotionHistory.length < 2) {
        return 'stable';
    }
    const intensities = emotionHistory.map((e) => EMOTION_INTENSITY[e] || 0.5);
    // Calculate trend using simple linear regression
    const n = intensities.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += intensities[i];
        sumXY += i * intensities[i];
        sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    // Calculate variance for volatility
    const mean = sumY / n;
    const variance = intensities.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    // Check for volatility (high variance)
    if (variance > 0.1) {
        return 'volatile';
    }
    // Determine trajectory from slope
    if (slope > 0.05) {
        return 'rising';
    }
    else if (slope < -0.05) {
        return 'falling';
    }
    return 'stable';
}
/**
 * Check if current emotions indicate a heavy topic
 */
export function isHeavyTopic(currentEmotion, history) {
    // Check if current emotion is heavy
    if (HEAVY_EMOTIONS.includes(currentEmotion)) {
        return true;
    }
    // Check if recent history has multiple heavy emotions
    const recentHeavy = history.slice(-3).filter((e) => HEAVY_EMOTIONS.includes(e));
    return recentHeavy.length >= 2;
}
// =============================================================================
// PROSODY RECOMMENDATIONS
// =============================================================================
/**
 * Base prosody settings for emotional states
 * Note: Not all emotions are mapped - unmapped emotions fall back to neutral
 */
const EMOTION_PROSODY = {
    // High energy positive
    excited: { baseSpeed: 1.1, baseVolume: 1.1, pauseMultiplier: 0.8 },
    enthusiastic: { baseSpeed: 1.1, baseVolume: 1.1, pauseMultiplier: 0.85 },
    happy: { baseSpeed: 1.05, baseVolume: 1.05, pauseMultiplier: 0.9 },
    // Supportive/empathetic
    sympathetic: { baseSpeed: 0.9, baseVolume: 0.9, pauseMultiplier: 1.2, softerDelivery: true },
    affectionate: { baseSpeed: 0.95, baseVolume: 0.95, pauseMultiplier: 1.1 },
    // Sad/heavy
    sad: { baseSpeed: 0.85, baseVolume: 0.85, pauseMultiplier: 1.3, softerDelivery: true },
    dejected: { baseSpeed: 0.8, baseVolume: 0.8, pauseMultiplier: 1.4, softerDelivery: true },
    // Calm/peaceful
    calm: { baseSpeed: 0.95, baseVolume: 0.95, pauseMultiplier: 1.1 },
    peaceful: { baseSpeed: 0.9, baseVolume: 0.9, pauseMultiplier: 1.2 },
    contemplative: { baseSpeed: 0.9, baseVolume: 0.9, pauseMultiplier: 1.15 },
    // Curious/engaged
    curious: { baseSpeed: 1.0, baseVolume: 1.0, pauseMultiplier: 1.0 },
    anticipation: { baseSpeed: 1.0, baseVolume: 1.0, pauseMultiplier: 0.95 },
    // Default for unspecified
    neutral: { baseSpeed: 1.0, baseVolume: 1.0, pauseMultiplier: 1.0 },
};
/**
 * Get prosody recommendation based on conversation state
 */
export function getProsodyRecommendation(state) {
    const baseProsody = EMOTION_PROSODY[state.currentEmotion] ?? EMOTION_PROSODY.neutral ?? {};
    // Start with base values
    let speed = baseProsody.baseSpeed || 1.0;
    let volume = baseProsody.baseVolume || 1.0;
    let pauseMultiplier = baseProsody.pauseMultiplier || 1.0;
    let softerDelivery = baseProsody.softerDelivery || false;
    let includeMicroReactions = true;
    // Adjust based on trajectory
    if (state.trajectory === 'falling') {
        // Conversation is getting heavier - slow down more
        speed *= 0.95;
        pauseMultiplier *= 1.1;
        softerDelivery = true;
    }
    else if (state.trajectory === 'rising') {
        // Conversation is getting more energetic
        speed *= 1.05;
        volume *= 1.05;
        pauseMultiplier *= 0.9;
    }
    else if (state.trajectory === 'volatile') {
        // Emotional conversation - be careful, use more pauses
        pauseMultiplier *= 1.2;
        includeMicroReactions = false; // Don't add reactions to volatile convos
    }
    // Adjust for heavy topics
    if (state.isHeavyTopic) {
        speed = Math.min(speed, 0.9);
        volume = Math.min(volume, 0.9);
        pauseMultiplier = Math.max(pauseMultiplier, 1.2);
        softerDelivery = true;
        includeMicroReactions = state.turnsInCurrentArc > 3; // Wait before reacting
    }
    // Adjust for intensity
    if (state.intensity > 0.7) {
        // High intensity - match energy but don't go overboard
        speed = Math.min(speed * 1.05, 1.2);
        volume = Math.min(volume * 1.05, 1.15);
    }
    else if (state.intensity < 0.3) {
        // Low intensity - keep it calm
        speed = Math.min(speed, 0.95);
        volume = Math.min(volume, 0.95);
    }
    // Adjust for arc length (fatigue in long emotional arcs)
    if (state.turnsInCurrentArc > 5) {
        // Long arc - add more breathing room
        pauseMultiplier *= 1.1;
    }
    // Clamp values
    speed = Math.max(0.7, Math.min(1.3, speed));
    volume = Math.max(0.7, Math.min(1.2, volume));
    pauseMultiplier = Math.max(0.7, Math.min(1.5, pauseMultiplier));
    const recommendation = {
        baseSpeed: speed,
        baseVolume: volume,
        emotion: state.currentEmotion,
        pauseMultiplier,
        includeMicroReactions,
        softerDelivery,
        reason: buildReasonString(state),
    };
    log.debug({
        emotion: state.currentEmotion,
        trajectory: state.trajectory,
        intensity: state.intensity.toFixed(2),
        speed: speed.toFixed(2),
        volume: volume.toFixed(2),
    }, 'Generated prosody recommendation');
    return recommendation;
}
/**
 * Build explanation string for recommendation
 */
function buildReasonString(state) {
    const reasons = [];
    reasons.push(`emotion: ${state.currentEmotion}`);
    if (state.trajectory !== 'stable') {
        reasons.push(`trajectory: ${state.trajectory}`);
    }
    if (state.isHeavyTopic) {
        reasons.push('heavy topic');
    }
    if (state.intensity > 0.7) {
        reasons.push('high intensity');
    }
    else if (state.intensity < 0.3) {
        reasons.push('low intensity');
    }
    if (state.turnsInCurrentArc > 5) {
        reasons.push(`long arc (${state.turnsInCurrentArc} turns)`);
    }
    return reasons.join(', ');
}
// =============================================================================
// SESSION STATE MANAGEMENT
// =============================================================================
const sessions = new Map();
/**
 * Get current emotional state for a session
 */
export function getConversationState(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            currentEmotion: 'neutral',
            emotionHistory: [],
            trajectory: 'stable',
            intensity: 0.5,
            isHeavyTopic: false,
            turnsInCurrentArc: 0,
        });
    }
    return sessions.get(sessionId);
}
/**
 * Update emotional state with new detected emotion
 */
export function updateConversationState(sessionId, newEmotion) {
    const state = getConversationState(sessionId);
    // Check if we're in a new emotional arc
    const wasHeavy = state.isHeavyTopic;
    const isNowHeavy = isHeavyTopic(newEmotion, state.emotionHistory);
    // Track turns in current arc
    if (newEmotion === state.currentEmotion) {
        state.turnsInCurrentArc++;
    }
    else {
        state.turnsInCurrentArc = 1;
    }
    // Update history
    state.emotionHistory.push(newEmotion);
    if (state.emotionHistory.length > 10) {
        state.emotionHistory.shift();
    }
    // Update current state
    state.currentEmotion = newEmotion;
    state.trajectory = calculateTrajectory(state.emotionHistory);
    state.intensity = EMOTION_INTENSITY[newEmotion] || 0.5;
    state.isHeavyTopic = isNowHeavy;
    // Log significant changes
    if (wasHeavy !== isNowHeavy) {
        log.info({ sessionId, wasHeavy, isNowHeavy, emotion: newEmotion }, 'Conversation weight changed');
    }
    return state;
}
/**
 * Get prosody recommendation for current session state
 */
export function getSessionProsodyRecommendation(sessionId) {
    const state = getConversationState(sessionId);
    return getProsodyRecommendation(state);
}
/**
 * Reset session state
 */
export function resetConversationState(sessionId) {
    sessions.delete(sessionId);
}
/**
 * Get active session count
 */
export function getActiveConversationStateCount() {
    return sessions.size;
}
// =============================================================================
// SSML GENERATION HELPERS
// =============================================================================
/**
 * Apply prosody recommendation to text
 */
export function applyProsodyRecommendation(text, recommendation) {
    let ssml = '';
    // Apply speed if not default
    if (recommendation.baseSpeed !== 1.0) {
        ssml += `<speed ratio="${recommendation.baseSpeed.toFixed(2)}"/>`;
    }
    // Apply volume if not default
    if (recommendation.baseVolume !== 1.0) {
        ssml += `<volume ratio="${recommendation.baseVolume.toFixed(2)}"/>`;
    }
    // Apply emotion
    ssml += `<emotion value="${recommendation.emotion}"/>`;
    return ssml + text;
}
/**
 * Add context-appropriate pause at beginning
 */
export function addContextualPause(text, recommendation) {
    // Calculate pause duration based on multiplier
    const basePauseMs = 100;
    const pauseMs = Math.round(basePauseMs * recommendation.pauseMultiplier);
    if (pauseMs > 120) {
        return `<break time="${pauseMs}ms"/>${text}`;
    }
    return text;
}
//# sourceMappingURL=conversation-prosody.js.map