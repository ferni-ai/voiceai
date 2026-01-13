/**
 * Speech Session Debug Utility
 *
 * Provides debugging and monitoring capabilities for speech sessions.
 * Use this for:
 * - Inspecting active session state
 * - Diagnosing issues in production
 * - Performance monitoring
 * - Memory leak detection
 *
 * @module session-debug
 */
import { getLogger } from '../utils/safe-logger.js';
import { getActiveSpeechSessionCount, getActiveSpeechSessions } from './session-cleanup.js';
// Service imports for inspection
import { getSessionAudioProsodyAnalyzer } from './audio-prosody.js';
import { getActiveBackchannelSessionCount } from './backchanneling/index.js';
import { getActiveFFTAnalyzerCount } from './fft-analyzer.js';
import { getSpeechMetricsSnapshot } from './metrics/index.js';
import { getActiveResponseAnticipationCount } from './response-anticipation.js';
import { getSessionVoiceManagerCount } from './voice-manager.js';
const log = getLogger().child({ module: 'SessionDebug' });
// ============================================================================
// MODULE STATE
// ============================================================================
const moduleStartTime = Date.now();
const sessionMetrics = new Map();
// ============================================================================
// SESSION TRACKING
// ============================================================================
/**
 * Register metrics tracking for a new session
 */
export function trackSessionStart(sessionId) {
    sessionMetrics.set(sessionId, {
        startTime: new Date(),
        backchannelCount: 0,
        turnPredictions: 0,
        emotionsDetected: new Set(),
        prosodyAnalyses: 0,
    });
    log.debug({ sessionId }, 'Session tracking started');
}
/**
 * Increment backchannel count for a session
 */
export function trackBackchannel(sessionId) {
    const metrics = sessionMetrics.get(sessionId);
    if (metrics) {
        metrics.backchannelCount++;
    }
}
/**
 * Increment turn prediction count for a session
 */
export function trackTurnPrediction(sessionId) {
    const metrics = sessionMetrics.get(sessionId);
    if (metrics) {
        metrics.turnPredictions++;
    }
}
/**
 * Track detected emotion for a session
 */
export function trackEmotionDetected(sessionId, emotion) {
    const metrics = sessionMetrics.get(sessionId);
    if (metrics) {
        metrics.emotionsDetected.add(emotion);
    }
}
/**
 * Increment prosody analysis count for a session
 */
export function trackProsodyAnalysis(sessionId) {
    const metrics = sessionMetrics.get(sessionId);
    if (metrics) {
        metrics.prosodyAnalyses++;
    }
}
/**
 * Clean up tracking for a session
 */
export function cleanupSessionTracking(sessionId) {
    sessionMetrics.delete(sessionId);
}
// ============================================================================
// DEBUG INFO RETRIEVAL
// ============================================================================
/**
 * Get debug information for a specific session
 */
export function getSessionDebugInfo(sessionId) {
    const metrics = sessionMetrics.get(sessionId);
    if (!metrics) {
        return null;
    }
    // Check which services are active for this session
    const activeServices = [];
    try {
        getSessionAudioProsodyAnalyzer(sessionId);
        activeServices.push('audioProsody');
    }
    catch {
        // Service not active
    }
    // Estimate memory (rough approximation)
    const estimatedMemoryKB = activeServices.length * 50 + // Base per service
        metrics.emotionsDetected.size * 0.1 + // Emotions
        metrics.prosodyAnalyses * 0.5; // Analysis history
    return {
        sessionId,
        startTime: metrics.startTime,
        activeServices,
        metrics: {
            backchannelCount: metrics.backchannelCount,
            turnPredictions: metrics.turnPredictions,
            emotionsDetected: [...metrics.emotionsDetected],
            prosodyAnalyses: metrics.prosodyAnalyses,
            anticipationHitRate: -1, // -1 indicates not yet tracked (future feature)
        },
        estimatedMemoryKB,
    };
}
/**
 * Get debug information for all sessions
 */
export function getAllSessionsDebugInfo() {
    const sessions = getActiveSpeechSessions();
    return sessions
        .map((sessionId) => getSessionDebugInfo(sessionId))
        .filter((info) => info !== null);
}
/**
 * Get aggregate debug information for the entire speech module
 */
export function getSpeechModuleDebugInfo() {
    const uptimeSeconds = (Date.now() - moduleStartTime) / 1000;
    const sessionIds = getActiveSpeechSessions();
    const sessionInfos = getAllSessionsDebugInfo();
    const estimatedTotalMemoryKB = sessionInfos.reduce((sum, info) => sum + info.estimatedMemoryKB, 0);
    return {
        totalSessions: getActiveSpeechSessionCount(),
        serviceCounts: {
            audioProsody: sessionMetrics.size, // Approximate
            backchanneling: getActiveBackchannelSessionCount(),
            fftAnalyzer: getActiveFFTAnalyzerCount(),
            responseAnticipation: getActiveResponseAnticipationCount(),
            voiceManager: getSessionVoiceManagerCount(),
        },
        metrics: getSpeechMetricsSnapshot(),
        sessionIds,
        uptimeSeconds,
        estimatedTotalMemoryKB,
    };
}
// ============================================================================
// DIAGNOSTIC FUNCTIONS
// ============================================================================
/**
 * Check for potential memory leaks
 *
 * Returns issues if service counts don't match session counts
 */
export function checkForLeaks() {
    const issues = [];
    const sessionCount = getActiveSpeechSessionCount();
    const serviceCounts = {
        backchanneling: getActiveBackchannelSessionCount(),
        fftAnalyzer: getActiveFFTAnalyzerCount(),
        responseAnticipation: getActiveResponseAnticipationCount(),
        voiceManager: getSessionVoiceManagerCount(),
    };
    // Check for orphaned services (more services than sessions)
    for (const [service, count] of Object.entries(serviceCounts)) {
        if (count > sessionCount + 1) {
            // +1 for tolerance
            issues.push(`${service} has ${count} instances but only ${sessionCount} sessions - possible leak`);
        }
    }
    // Check for very high session count
    if (sessionCount > 100) {
        issues.push(`High session count (${sessionCount}) - check session cleanup`);
    }
    return {
        hasIssues: issues.length > 0,
        issues,
    };
}
/**
 * Log current module state (for debugging)
 */
export function logModuleState() {
    const info = getSpeechModuleDebugInfo();
    const leakCheck = checkForLeaks();
    log.info({
        totalSessions: info.totalSessions,
        serviceCounts: info.serviceCounts,
        uptimeSeconds: Math.round(info.uptimeSeconds),
        estimatedMemoryKB: Math.round(info.estimatedTotalMemoryKB),
        hasLeakIssues: leakCheck.hasIssues,
        leakIssues: leakCheck.issues,
    }, '📊 Speech module state');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    // Session tracking
    trackSessionStart,
    trackBackchannel,
    trackTurnPrediction,
    trackEmotionDetected,
    trackProsodyAnalysis,
    cleanupSessionTracking,
    // Debug info
    getSessionDebugInfo,
    getAllSessionsDebugInfo,
    getSpeechModuleDebugInfo,
    // Diagnostics
    checkForLeaks,
    logModuleState,
};
//# sourceMappingURL=session-debug.js.map