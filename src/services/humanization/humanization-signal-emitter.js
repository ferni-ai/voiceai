/**
 * Humanization Signal Emitter
 *
 * Bridges the backend DeepHumanizationEngine to the frontend Ferni EQ system.
 * Sends real-time signals about conversation dynamics so the avatar can respond
 * BEFORE the words arrive - creating the "they understand me" feeling.
 *
 * This is a critical piece of making Ferni feel truly human.
 *
 * @module @ferni/humanization-signal-emitter
 */
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'HumanizationSignalEmitter' });
// ============================================================================
// STATE
// ============================================================================
let sendDataCallback = null;
let isEnabled = true;
// Throttling to prevent overwhelming the frontend
// Reduced from 2000ms to allow more responsive avatar behavior
// High-priority signals (concern, anticipation) have shorter throttle
const lastSignalTimes = new Map();
const SIGNAL_THROTTLE_MS = 1200; // Default throttle
const HIGH_PRIORITY_THROTTLE_MS = 500; // For concern/anticipation
const HIGH_PRIORITY_SIGNALS = [
    'concern_detected',
    'anticipatory_presence',
    'protective_instinct',
    'emotional_bond_deepen',
    'breakthrough',
    'vulnerability',
];
// ============================================================================
// INITIALIZATION
// ============================================================================
/**
 * Initialize the signal emitter with a callback to send data to frontend
 */
export function initHumanizationSignalEmitter(sendData) {
    sendDataCallback = sendData;
    logger.info('Humanization signal emitter initialized');
}
/**
 * Enable/disable signal emission
 */
export function setSignalEmitterEnabled(enabled) {
    isEnabled = enabled;
    logger.debug({ enabled }, 'Signal emitter enabled state changed');
}
// ============================================================================
// SIGNAL EMISSION
// ============================================================================
/**
 * Check if a signal should be throttled
 * High-priority signals get a shorter throttle window
 */
function shouldThrottle(signalType) {
    const lastTime = lastSignalTimes.get(signalType) || 0;
    const elapsed = Date.now() - lastTime;
    // Use shorter throttle for high-priority signals
    const throttleMs = HIGH_PRIORITY_SIGNALS.includes(signalType)
        ? HIGH_PRIORITY_THROTTLE_MS
        : SIGNAL_THROTTLE_MS;
    if (elapsed < throttleMs) {
        logger.debug({ signalType, elapsed, throttleMs }, 'Signal throttled');
        return true;
    }
    lastSignalTimes.set(signalType, Date.now());
    return false;
}
/**
 * Emit a humanization signal to the frontend
 */
export async function emitHumanizationSignal(payload) {
    if (!isEnabled || !sendDataCallback) {
        logger.debug({ signalType: payload.signalType }, 'Signal emission skipped (disabled or no callback)');
        return;
    }
    if (shouldThrottle(payload.signalType)) {
        return;
    }
    try {
        await sendDataCallback('humanization_signal', {
            ...payload,
            type: 'humanization_signal',
        });
        logger.debug({ signalType: payload.signalType, intensity: payload.intensity }, 'Humanization signal emitted');
    }
    catch (error) {
        logger.warn({ error, signalType: payload.signalType }, 'Failed to emit humanization signal');
    }
}
/**
 * Emit a memory callback signal with specific quoted content
 */
export async function emitMemoryCallback(payload) {
    if (!isEnabled || !sendDataCallback)
        return;
    try {
        await sendDataCallback('memory_callback', {
            ...payload,
            type: 'memory_callback',
        });
        logger.debug({ phrase: payload.quotedPhrase.slice(0, 30) }, 'Memory callback emitted');
    }
    catch (error) {
        logger.warn({ error }, 'Failed to emit memory callback');
    }
}
/**
 * Emit conversation rhythm update
 */
export async function emitConversationRhythm(payload) {
    if (!isEnabled || !sendDataCallback)
        return;
    try {
        await sendDataCallback('conversation_rhythm', {
            ...payload,
            type: 'conversation_rhythm',
        });
        logger.debug({ pacing: payload.userPacing }, 'Conversation rhythm emitted');
    }
    catch (error) {
        logger.warn({ error }, 'Failed to emit conversation rhythm');
    }
}
/**
 * Emit emotional arc update
 */
export async function emitEmotionalArc(payload) {
    if (!isEnabled || !sendDataCallback)
        return;
    try {
        await sendDataCallback('emotional_arc', {
            ...payload,
            type: 'emotional_arc',
        });
        logger.debug({ phase: payload.phase, intensity: payload.intensity }, 'Emotional arc emitted');
    }
    catch (error) {
        logger.warn({ error }, 'Failed to emit emotional arc');
    }
}
// ============================================================================
// CONVENIENCE METHODS - High-level signal emitters
// ============================================================================
/**
 * Signal that a breakthrough moment was detected
 */
export async function signalBreakthrough(intensity = 0.8) {
    await emitHumanizationSignal({
        signalType: 'breakthrough',
        intensity,
    });
}
/**
 * Signal that vulnerability was detected
 */
export async function signalVulnerability(intensity = 0.7) {
    await emitHumanizationSignal({
        signalType: 'vulnerability',
        intensity,
    });
}
/**
 * Signal that user seems disengaged
 */
export async function signalDisengagement() {
    await emitHumanizationSignal({
        signalType: 'disengagement',
        intensity: 0.6,
    });
}
/**
 * Signal high engagement
 */
export async function signalHighEngagement(intensity = 0.8) {
    await emitHumanizationSignal({
        signalType: 'high_engagement',
        intensity,
    });
}
/**
 * Signal that Ferni is changing their mind
 */
export async function signalMindChange() {
    await emitHumanizationSignal({
        signalType: 'mind_change',
        intensity: 0.7,
    });
}
/**
 * Signal a memory callback with specific content
 */
export async function signalMemoryCallback(quotedPhrase, context, whenMentioned, emotionalWeight = 'medium') {
    await emitMemoryCallback({
        quotedPhrase,
        context,
        whenMentioned,
        emotionalWeight,
    });
}
/**
 * Signal a running joke/inside reference
 */
export async function signalRunningJoke(content) {
    await emitHumanizationSignal({
        signalType: 'running_joke',
        content,
        intensity: 0.6,
    });
}
/**
 * Signal physical presence awareness
 */
export async function signalPhysicalPresence() {
    await emitHumanizationSignal({
        signalType: 'physical_presence',
        intensity: 0.5,
    });
}
/**
 * Signal spontaneous thought
 */
export async function signalSpontaneousThought() {
    await emitHumanizationSignal({
        signalType: 'spontaneous_thought',
        intensity: 0.6,
    });
}
/**
 * Signal mood drift with current mood state
 */
export async function signalMoodDrift(mood) {
    await emitHumanizationSignal({
        signalType: 'mood_drift',
        mood,
        intensity: 0.5,
    });
}
/**
 * Signal an intentional silence moment
 */
export async function signalSilenceMoment(duration, reason) {
    // Map additional reasons to the core types for frontend
    const reasonMap = {
        processing: 'processing',
        emotional: 'emotional',
        invitation: 'invitation',
        presence: 'presence',
        resonance: 'emotional', // Resonance is similar to emotional
        respect: 'emotional', // Respect is similar to emotional
    };
    await emitHumanizationSignal({
        signalType: 'silence_moment',
        silenceDuration: duration,
        silenceReason: reasonMap[reason] || 'presence',
        intensity: reason === 'emotional' || reason === 'respect' ? 0.8 : 0.5,
    });
}
/**
 * Signal anticipation of user's direction
 */
export async function signalAnticipation() {
    await emitHumanizationSignal({
        signalType: 'anticipation',
        intensity: 0.6,
    });
}
/**
 * Signal that user presented evidence
 */
export async function signalEvidencePresented() {
    await emitHumanizationSignal({
        signalType: 'evidence_presented',
        intensity: 0.7,
    });
}
/**
 * Signal topic weight shift
 */
export async function signalTopicWeightShift(weight) {
    const intensityMap = { light: 0.3, medium: 0.5, heavy: 0.8 };
    await emitHumanizationSignal({
        signalType: 'topic_weight_shift',
        intensity: intensityMap[weight],
    });
}
/**
 * Signal relationship milestone
 */
export async function signalRelationshipMilestone(stage) {
    await emitHumanizationSignal({
        signalType: 'relationship_milestone',
        relationshipStage: stage,
        intensity: 0.9,
    });
}
/**
 * Signal emotional arc peak
 */
export async function signalEmotionalArcPeak(intensity) {
    await emitHumanizationSignal({
        signalType: 'emotional_arc_peak',
        intensity,
    });
}
/**
 * Signal emotional arc release
 */
export async function signalEmotionalArcRelease() {
    await emitHumanizationSignal({
        signalType: 'emotional_arc_release',
        intensity: 0.6,
    });
}
// ============================================================================
// SUPERHUMAN CAPABILITY SIGNALS
// ============================================================================
/**
 * Signal that concern was detected (from unified concern detection)
 */
export async function signalConcernDetected(level, concernType, recommendedApproach, intensity) {
    await emitHumanizationSignal({
        signalType: 'concern_detected',
        concernLevel: level,
        concernType,
        recommendedApproach,
        intensity,
    });
}
/**
 * Signal proactive memory surfacing
 */
export async function signalProactiveMemory(memoryType, content, intensity) {
    await emitHumanizationSignal({
        signalType: 'proactive_memory',
        memoryType,
        content,
        intensity,
    });
}
/**
 * Signal voice state detection (tiredness, stress, etc.)
 */
export async function signalVoiceStateDetected(voiceState, intensity) {
    await emitHumanizationSignal({
        signalType: 'voice_state_detected',
        voiceState,
        intensity,
    });
}
/**
 * Signal predicted need (venting, advice, validation, etc.)
 */
export async function signalNeedPredicted(predictedNeed, intensity) {
    await emitHumanizationSignal({
        signalType: 'need_predicted',
        predictedNeed,
        intensity,
    });
}
/**
 * Signal emotional trajectory prediction
 */
export async function signalEmotionalTrajectory(trajectory, intensity) {
    await emitHumanizationSignal({
        signalType: 'emotional_trajectory',
        emotionalTrajectory: trajectory,
        intensity,
    });
}
// ============================================================================
// 🌟 BETTER THAN HUMAN SIGNALS
// ============================================================================
/**
 * Signal emotional bond deepening
 */
export async function signalEmotionalBondDeepen(bondType, bondLevel) {
    await emitHumanizationSignal({
        signalType: 'emotional_bond_deepen',
        bondType,
        bondLevel,
        intensity: bondLevel,
    });
}
/**
 * Signal protective instinct activation
 */
export async function signalProtectiveInstinct(trigger, intensity = 0.8) {
    await emitHumanizationSignal({
        signalType: 'protective_instinct',
        protectionTrigger: trigger,
        intensity,
    });
}
/**
 * Signal spontaneous delight emission
 */
export async function signalSpontaneousDelight(delightType, intensity = 0.7) {
    await emitHumanizationSignal({
        signalType: 'spontaneous_delight',
        delightType,
        intensity,
    });
}
/**
 * Signal inside joke callback
 */
export async function signalInsideJokeCallback(jokePhase, jokeContent) {
    await emitHumanizationSignal({
        signalType: 'inside_joke_callback',
        jokePhase,
        jokeContent,
        intensity: 0.6,
    });
}
/**
 * Signal superhuman observation surfacing
 */
export async function signalSuperhumanObservation(observationType, observationContent) {
    await emitHumanizationSignal({
        signalType: 'superhuman_observation',
        observationType,
        observationContent,
        intensity: 0.85,
    });
}
/**
 * Signal visible vulnerability expression
 */
export async function signalVisibleVulnerability(vulnerabilityType, intensity = 0.7) {
    await emitHumanizationSignal({
        signalType: 'visible_vulnerability',
        vulnerabilityType,
        intensity,
    });
}
/**
 * Signal temporal emotional insight
 */
export async function signalTemporalInsight(insight, intensity = 0.75) {
    await emitHumanizationSignal({
        signalType: 'temporal_insight',
        temporalInsight: insight,
        intensity,
    });
}
/**
 * Signal meta-relationship moment
 */
export async function signalMetaRelationshipMoment(type, intensity = 0.8) {
    await emitHumanizationSignal({
        signalType: 'meta_relationship_moment',
        metaRelationshipType: type,
        intensity,
    });
}
/**
 * Signal somatic presence cue
 */
export async function signalSomaticPresence(cue, intensity = 0.5) {
    await emitHumanizationSignal({
        signalType: 'somatic_presence',
        somaticCue: cue,
        intensity,
    });
}
/**
 * Signal anticipatory presence activation
 */
export async function signalAnticipatoryPresence(intensity = 0.7) {
    await emitHumanizationSignal({
        signalType: 'anticipatory_presence',
        intensity,
    });
}
// ============================================================================
// EXPORTS
// ============================================================================
export const humanizationSignalEmitter = {
    init: initHumanizationSignalEmitter,
    setEnabled: setSignalEmitterEnabled,
    // Raw emitters
    emit: emitHumanizationSignal,
    emitMemory: emitMemoryCallback,
    emitRhythm: emitConversationRhythm,
    emitArc: emitEmotionalArc,
    // Convenience methods
    breakthrough: signalBreakthrough,
    vulnerability: signalVulnerability,
    disengagement: signalDisengagement,
    highEngagement: signalHighEngagement,
    mindChange: signalMindChange,
    memoryCallback: signalMemoryCallback,
    runningJoke: signalRunningJoke,
    physicalPresence: signalPhysicalPresence,
    spontaneousThought: signalSpontaneousThought,
    moodDrift: signalMoodDrift,
    silenceMoment: signalSilenceMoment,
    anticipation: signalAnticipation,
    evidencePresented: signalEvidencePresented,
    topicWeightShift: signalTopicWeightShift,
    relationshipMilestone: signalRelationshipMilestone,
    emotionalArcPeak: signalEmotionalArcPeak,
    emotionalArcRelease: signalEmotionalArcRelease,
    // Superhuman capability signals
    concernDetected: signalConcernDetected,
    proactiveMemory: signalProactiveMemory,
    voiceStateDetected: signalVoiceStateDetected,
    needPredicted: signalNeedPredicted,
    emotionalTrajectory: signalEmotionalTrajectory,
    // 🌟 Better Than Human signals
    emotionalBondDeepen: signalEmotionalBondDeepen,
    protectiveInstinct: signalProtectiveInstinct,
    spontaneousDelight: signalSpontaneousDelight,
    insideJokeCallback: signalInsideJokeCallback,
    superhumanObservation: signalSuperhumanObservation,
    visibleVulnerability: signalVisibleVulnerability,
    temporalInsight: signalTemporalInsight,
    metaRelationshipMoment: signalMetaRelationshipMoment,
    somaticPresence: signalSomaticPresence,
    anticipatoryPresence: signalAnticipatoryPresence,
};
//# sourceMappingURL=humanization-signal-emitter.js.map