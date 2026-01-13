/**
 * Awareness System Observability Metrics
 *
 * Tracks performance and usage of the awareness components:
 * - Momentum tracking (state transitions, velocity)
 * - Thinking time (pauses, speech rate adjustments)
 * - Tangent decisions (triggers, acceptance rate)
 * - Self-awareness (landing rate, miss detection)
 *
 * Use these metrics to:
 * - Debug conversation flow issues
 * - Tune awareness sensitivity per persona
 * - Understand what makes conversations feel natural
 *
 * @module conversation/awareness-metrics
 */
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'awareness-metrics' });
// ============================================================================
// METRICS STORAGE
// ============================================================================
const sessionMetrics = new Map();
const MAX_SESSIONS = 50;
// ============================================================================
// INITIALIZATION
// ============================================================================
function initializeMetrics(sessionId, personaId) {
    return {
        sessionId,
        personaId,
        startTime: new Date(),
        turnCount: 0,
        momentum: {
            sessionId,
            personaId,
            stateTransitions: [],
            stateDistribution: {
                building: 0,
                cruising: 0,
                peaking: 0,
                winding_down: 0,
                stalled: 0,
                intimate: 0,
            },
            peaksDetected: 0,
            stallsDetected: 0,
            avgVelocity: 0,
            maxTopicDepth: 0,
        },
        thinkingTime: {
            totalCalculations: 0,
            avgOpeningPauseMs: 0,
            avgSpeechRate: 1.0,
            thinkingSoundsUsed: {},
            midPausesInjected: 0,
            slowSpeechTriggers: 0,
        },
        tangents: {
            totalDecisions: 0,
            tangentsSuggested: 0,
            tangentsTaken: 0,
            tangentsByTheme: {},
            cooldownBlocks: 0,
            momentumBlocks: 0,
            relationshipBlocks: 0,
        },
        selfAwareness: {
            totalAssessments: 0,
            landingRate: 0,
            missCount: 0,
            maxConsecutiveMisses: 0,
            responseTypeDistribution: {},
            selfAwarePromptsGenerated: 0,
        },
    };
}
function getOrCreateMetrics(sessionId, personaId) {
    let metrics = sessionMetrics.get(sessionId);
    if (!metrics) {
        metrics = initializeMetrics(sessionId, personaId);
        sessionMetrics.set(sessionId, metrics);
        // Cleanup old sessions
        if (sessionMetrics.size > MAX_SESSIONS) {
            const oldest = Array.from(sessionMetrics.entries()).sort((a, b) => a[1].startTime.getTime() - b[1].startTime.getTime())[0];
            if (oldest) {
                sessionMetrics.delete(oldest[0]);
            }
        }
    }
    return metrics;
}
// ============================================================================
// MOMENTUM TRACKING
// ============================================================================
/**
 * Record a momentum state transition
 */
export function recordMomentumTransition(sessionId, personaId, from, to, turn) {
    const metrics = getOrCreateMetrics(sessionId, personaId);
    metrics.momentum.stateTransitions.push({
        from,
        to,
        turn,
        timestamp: new Date(),
    });
    // Update state distribution
    metrics.momentum.stateDistribution[to]++;
    // Track peaks and stalls
    if (to === 'peaking') {
        metrics.momentum.peaksDetected++;
    }
    else if (to === 'stalled') {
        metrics.momentum.stallsDetected++;
    }
    log.debug({ sessionId, from, to, turn, peaks: metrics.momentum.peaksDetected }, 'Momentum transition recorded');
}
/**
 * Record momentum velocity
 */
export function recordMomentumVelocity(sessionId, personaId, velocity, topicDepth) {
    const metrics = getOrCreateMetrics(sessionId, personaId);
    // Running average
    const count = metrics.turnCount + 1;
    metrics.momentum.avgVelocity =
        (metrics.momentum.avgVelocity * metrics.turnCount + velocity) / count;
    // Track max topic depth
    if (topicDepth > metrics.momentum.maxTopicDepth) {
        metrics.momentum.maxTopicDepth = topicDepth;
    }
    metrics.turnCount = count;
}
// ============================================================================
// THINKING TIME TRACKING
// ============================================================================
/**
 * Record thinking time calculation
 */
export function recordThinkingTime(sessionId, personaId, openingPauseMs, speechRate, thinkingSound, midPausesCount) {
    const metrics = getOrCreateMetrics(sessionId, personaId);
    const tt = metrics.thinkingTime;
    // Running averages
    const count = tt.totalCalculations + 1;
    tt.avgOpeningPauseMs = (tt.avgOpeningPauseMs * tt.totalCalculations + openingPauseMs) / count;
    tt.avgSpeechRate = (tt.avgSpeechRate * tt.totalCalculations + speechRate) / count;
    tt.totalCalculations = count;
    tt.midPausesInjected += midPausesCount;
    if (speechRate < 0.95) {
        tt.slowSpeechTriggers++;
    }
    if (thinkingSound) {
        tt.thinkingSoundsUsed[thinkingSound] = (tt.thinkingSoundsUsed[thinkingSound] || 0) + 1;
    }
    log.debug({ sessionId, openingPauseMs, speechRate, thinkingSound }, 'Thinking time recorded');
}
// ============================================================================
// TANGENT TRACKING
// ============================================================================
/**
 * Record tangent decision
 */
export function recordTangentDecision(sessionId, personaId, shouldTangent, theme, blockReason) {
    const metrics = getOrCreateMetrics(sessionId, personaId);
    const tg = metrics.tangents;
    tg.totalDecisions++;
    if (shouldTangent && theme) {
        tg.tangentsSuggested++;
        tg.tangentsByTheme[theme] = (tg.tangentsByTheme[theme] || 0) + 1;
    }
    switch (blockReason) {
        case 'cooldown':
            tg.cooldownBlocks++;
            break;
        case 'momentum':
            tg.momentumBlocks++;
            break;
        case 'relationship':
            tg.relationshipBlocks++;
            break;
    }
    log.debug({ sessionId, shouldTangent, theme, blockReason }, 'Tangent decision recorded');
}
// ============================================================================
// SELF-AWARENESS TRACKING
// ============================================================================
/**
 * Record self-awareness assessment
 */
export function recordSelfAwarenessAssessment(sessionId, personaId, result, responseType, consecutiveMisses) {
    const metrics = getOrCreateMetrics(sessionId, personaId);
    const sa = metrics.selfAwareness;
    sa.totalAssessments++;
    // Update landing rate
    const landed = result === 'landed' ? 1 : 0;
    sa.landingRate = (sa.landingRate * (sa.totalAssessments - 1) + landed) / sa.totalAssessments;
    if (result === 'missed') {
        sa.missCount++;
    }
    if (consecutiveMisses > sa.maxConsecutiveMisses) {
        sa.maxConsecutiveMisses = consecutiveMisses;
    }
    // Track response types
    sa.responseTypeDistribution[responseType] = (sa.responseTypeDistribution[responseType] || 0) + 1;
    log.debug({ sessionId, result, responseType, landingRate: sa.landingRate.toFixed(2) }, 'Self-awareness assessment recorded');
}
/**
 * Record self-aware prompt generation
 */
export function recordSelfAwarePrompt(sessionId, personaId) {
    const metrics = getOrCreateMetrics(sessionId, personaId);
    metrics.selfAwareness.selfAwarePromptsGenerated++;
}
// ============================================================================
// RETRIEVAL
// ============================================================================
/**
 * Get metrics for a session
 */
export function getAwarenessMetrics(sessionId) {
    return sessionMetrics.get(sessionId);
}
/**
 * Get summary across all sessions
 */
export function getAwarenessSummary() {
    const sessions = Array.from(sessionMetrics.values());
    if (sessions.length === 0) {
        return {
            totalSessions: 0,
            avgLandingRate: 0,
            avgPeaksPerSession: 0,
            avgStallsPerSession: 0,
            mostCommonTangentThemes: [],
            avgOpeningPauseMs: 0,
            mostUsedThinkingSounds: [],
        };
    }
    // Aggregate metrics
    const totalLanding = sessions.reduce((sum, s) => sum + s.selfAwareness.landingRate, 0);
    const totalPeaks = sessions.reduce((sum, s) => sum + s.momentum.peaksDetected, 0);
    const totalStalls = sessions.reduce((sum, s) => sum + s.momentum.stallsDetected, 0);
    const totalOpeningPause = sessions.reduce((sum, s) => sum + s.thinkingTime.avgOpeningPauseMs, 0);
    // Aggregate tangent themes
    const themeAggregation = {};
    for (const session of sessions) {
        for (const [theme, count] of Object.entries(session.tangents.tangentsByTheme)) {
            themeAggregation[theme] = (themeAggregation[theme] || 0) + count;
        }
    }
    const mostCommonTangentThemes = Object.entries(themeAggregation)
        .map(([theme, count]) => ({ theme, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    // Aggregate thinking sounds
    const soundAggregation = {};
    for (const session of sessions) {
        for (const [sound, count] of Object.entries(session.thinkingTime.thinkingSoundsUsed)) {
            soundAggregation[sound] = (soundAggregation[sound] || 0) + count;
        }
    }
    const mostUsedThinkingSounds = Object.entries(soundAggregation)
        .map(([sound, count]) => ({ sound, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    return {
        totalSessions: sessions.length,
        avgLandingRate: totalLanding / sessions.length,
        avgPeaksPerSession: totalPeaks / sessions.length,
        avgStallsPerSession: totalStalls / sessions.length,
        mostCommonTangentThemes,
        avgOpeningPauseMs: totalOpeningPause / sessions.length,
        mostUsedThinkingSounds,
    };
}
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Reset metrics for a session
 */
export function resetAwarenessMetrics(sessionId) {
    sessionMetrics.delete(sessionId);
}
/**
 * Reset all metrics
 */
export function resetAllAwarenessMetrics() {
    sessionMetrics.clear();
}
//# sourceMappingURL=awareness-metrics.js.map