/**
 * Naturalness Debug Module
 *
 * Tools for debugging and monitoring how natural our responses are.
 * Use this to identify issues in the intelligence pipeline.
 *
 * @module intelligence/unified/naturalness-debug
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'NaturalnessDebug' });
// ============================================================================
// DEBUG FUNCTIONS
// ============================================================================
/**
 * Generate a naturalness report for a conversation turn
 */
export function generateNaturalnessReport(analysis, humanization) {
    const issues = [];
    const suggestions = [];
    // Check for issues
    // Issue 1: Mismatch detected but not surfaced
    if (analysis.mismatch.detected && !analysis.mismatch.shouldSurface) {
        issues.push({
            type: 'quality',
            description: 'Voice-text mismatch detected but below surfacing threshold',
            severity: 'low',
        });
        suggestions.push('Consider lowering mismatch surfacing threshold for better detection');
    }
    // Issue 2: High emotion but no focused support
    if (analysis.emotion.distressLevel > 0.5 && !humanization.focusedSupportMode) {
        issues.push({
            type: 'conflict',
            description: 'User distress detected but not in focused support mode',
            severity: 'medium',
        });
        suggestions.push('Review focused support mode triggers');
    }
    // Issue 3: Low emotion confidence
    if (analysis.emotion.confidence < 0.5) {
        issues.push({
            type: 'quality',
            description: `Low emotion confidence (${analysis.emotion.confidence.toFixed(2)})`,
            severity: 'low',
        });
        suggestions.push('Consider enabling LLM-enhanced emotion detection');
    }
    // Issue 4: Slow processing
    if (analysis.processingTimeMs > 200) {
        issues.push({
            type: 'performance',
            description: `Slow analysis (${analysis.processingTimeMs}ms)`,
            severity: analysis.processingTimeMs > 500 ? 'high' : 'medium',
        });
        suggestions.push('Review analysis pipeline for bottlenecks');
    }
    // Calculate naturalness score
    let score = 1.0;
    // Deduct for issues
    for (const issue of issues) {
        if (issue.severity === 'high')
            score -= 0.2;
        else if (issue.severity === 'medium')
            score -= 0.1;
        else
            score -= 0.05;
    }
    // Bonus for good signals
    if (analysis.mismatch.detected && analysis.mismatch.shouldSurface)
        score += 0.1;
    if (analysis.emotion.source === 'combined')
        score += 0.1;
    if (humanization.activeListening.length > 0)
        score += 0.05;
    score = Math.max(0, Math.min(1, score));
    const report = {
        score,
        signals: {
            voiceTextMismatch: analysis.mismatch.detected,
            highEmotion: analysis.emotion.distressLevel > 0.5 || analysis.emotion.intensity > 0.7,
            focusedSupportMode: humanization.focusedSupportMode,
            activeListeningTriggered: humanization.activeListening.length > 0,
        },
        pipeline: {
            analysisTimeMs: analysis.processingTimeMs,
            emotionSource: analysis.emotion.source,
            emotionConfidence: analysis.emotion.confidence,
        },
        issues,
        suggestions,
    };
    log.debug({
        score: report.score.toFixed(2),
        issueCount: issues.length,
        mismatchDetected: report.signals.voiceTextMismatch,
    }, '📊 Naturalness report generated');
    return report;
}
/**
 * Log a summary of the analysis for debugging
 */
export function logAnalysisSummary(analysis) {
    log.info({
        emotion: analysis.emotion.primary,
        emotionConfidence: analysis.emotion.confidence.toFixed(2),
        emotionSource: analysis.emotion.source,
        distress: analysis.emotion.distressLevel.toFixed(2),
        intent: analysis.intent.primary,
        phase: analysis.context.phase,
        topic: analysis.context.currentTopic,
        mismatch: analysis.mismatch.detected
            ? `${analysis.mismatch.type} (${analysis.mismatch.confidence.toFixed(2)})`
            : 'none',
        signals: analysis.signals.markers.join(', ') || 'none',
        useHighEmotionMode: analysis.guidance.useHighEmotionMode,
        processingMs: analysis.processingTimeMs,
    }, '🔍 Analysis Summary');
}
/**
 * Check for potential naturalness issues in real-time
 */
export function checkNaturalnessIssues(analysis) {
    const warnings = [];
    // Critical: Mismatch detected
    if (analysis.mismatch.detected && analysis.mismatch.type === 'masking_negative') {
        warnings.push(`⚠️ MISMATCH: User may be hiding distress. Voice says ${analysis.mismatch.voiceEmotion}.`);
    }
    // Warning: High distress
    if (analysis.emotion.distressLevel > 0.7) {
        warnings.push(`⚠️ HIGH DISTRESS: User needs focused support.`);
    }
    // Warning: Conflicting signals
    if (analysis.signals.seekingAdvice && analysis.signals.isVenting) {
        warnings.push(`⚠️ MIXED SIGNALS: User is both venting and seeking advice. Validate first.`);
    }
    // Info: Topic shift
    if (analysis.context.isTopicShift) {
        warnings.push(`📌 Topic shift detected. Follow the user.`);
    }
    return warnings;
}
export default {
    generateNaturalnessReport,
    logAnalysisSummary,
    checkNaturalnessIssues,
};
//# sourceMappingURL=naturalness-debug.js.map