/**
 * Session Management for Audio Prosody
 *
 * Manages session-scoped analyzers and metrics tracking.
 */
import { createLogger } from '../../utils/safe-logger.js';
import { AudioProsodyAnalyzer } from './analyzer.js';
const log = createLogger({ module: 'AudioProsodySession' });
// ============================================================================
// SESSION-SCOPED ANALYZERS
// ============================================================================
const sessionAnalyzers = new Map();
/**
 * Get or create a prosody analyzer for a specific session
 */
export function getSessionAudioProsodyAnalyzer(sessionId) {
    let analyzer = sessionAnalyzers.get(sessionId);
    if (!analyzer) {
        analyzer = new AudioProsodyAnalyzer(sessionId);
        sessionAnalyzers.set(sessionId, analyzer);
    }
    return analyzer;
}
/**
 * Reset and remove a session's prosody analyzer (on session end)
 */
export function resetSessionAudioProsodyAnalyzer(sessionId) {
    const analyzer = sessionAnalyzers.get(sessionId);
    if (analyzer) {
        analyzer.reset();
        sessionAnalyzers.delete(sessionId);
    }
    // Also clear metrics for this session
    sessionMetrics.delete(sessionId);
}
// ============================================================================
// PROSODY METRICS TRACKING
// ============================================================================
/**
 * Session-scoped metrics storage
 */
const sessionMetrics = new Map();
/**
 * Get metrics for a specific session's prosody analysis
 */
export function getProsodyMetrics(sessionId) {
    const metrics = sessionMetrics.get(sessionId);
    if (!metrics || metrics.totalAnalyses === 0) {
        return {
            totalAnalyses: 0,
            successfulDetections: 0,
            detectionRate: 0,
            averageConfidence: 0,
            dominantEmotion: null,
        };
    }
    // Find dominant emotion
    let dominantEmotion = null;
    let maxCount = 0;
    metrics.emotionCounts.forEach((count, emotion) => {
        if (count > maxCount) {
            maxCount = count;
            dominantEmotion = emotion;
        }
    });
    return {
        totalAnalyses: metrics.totalAnalyses,
        successfulDetections: metrics.successfulDetections,
        detectionRate: metrics.successfulDetections / metrics.totalAnalyses,
        averageConfidence: metrics.successfulDetections > 0 ? metrics.confidenceSum / metrics.successfulDetections : 0,
        dominantEmotion,
    };
}
/**
 * Internal function to record prosody analysis
 */
export function recordProsodyAnalysisInternal(sessionId, result) {
    let metrics = sessionMetrics.get(sessionId);
    if (!metrics) {
        metrics = {
            totalAnalyses: 0,
            successfulDetections: 0,
            confidenceSum: 0,
            emotionCounts: new Map(),
        };
        sessionMetrics.set(sessionId, metrics);
    }
    metrics.totalAnalyses++;
    if (result && result.confidence > 0.3) {
        metrics.successfulDetections++;
        metrics.confidenceSum += result.confidence;
        const count = metrics.emotionCounts.get(result.primary) || 0;
        metrics.emotionCounts.set(result.primary, count + 1);
    }
}
/**
 * Record a prosody analysis result for metrics (public API)
 */
export function recordProsodyAnalysis(sessionId, result) {
    recordProsodyAnalysisInternal(sessionId, result);
}
/**
 * Clear metrics for a specific session
 */
export function clearProsodyMetrics(sessionId) {
    sessionMetrics.delete(sessionId);
}
//# sourceMappingURL=session-management.js.map