/**
 * Human Expert Transfer Service
 *
 * > "Better than human means knowing when to bring in a human."
 *
 * Warm handoff system that connects users with professional help
 * when AI life coaching isn't enough.
 *
 * ## Features
 *
 * - **Escalation Classification**: Detect when professional help is needed
 * - **Context Summary**: Generate warm handoff summaries
 * - **Transfer Flow**: Orchestrate the connection
 * - **Safety First**: Crisis situations always get resources
 *
 * ## Usage
 *
 * ```typescript
 * import { humanTransfer } from './services/human-transfer';
 *
 * // Check if transfer is needed
 * const decision = humanTransfer.evaluateTransferNeed(transcript);
 *
 * if (decision.type !== 'none') {
 *   // Generate summary for professional
 *   const summary = await humanTransfer.generateSummary(
 *     decision.type,
 *     userProfile,
 *     conversations
 *   );
 *
 *   // Initiate transfer with consent
 *   const result = await humanTransfer.initiateTransfer({
 *     userId,
 *     decision,
 *     consent: { granted: true },
 *     summary,
 *   });
 * }
 * ```
 *
 * @module services/human-transfer
 */
import { createLogger } from '../../utils/safe-logger.js';
// Re-export classifiers
export { detectCrisisSignals, classifyEscalation, classifyWithContext, escalationClassifier, } from './escalation-classifier.js';
// Re-export summary generators
export { generateTransferSummary, generateMinimalSummary, generateTopicsOnlySummary, contextSummary, } from './context-summary.js';
// Re-export transfer flow
export { evaluateTransferNeed, getAvailableServices, initiateWarmTransfer, generateConsentRequest, transferFlow, } from './transfer-flow.js';
const log = createLogger({ module: 'human-transfer' });
// ============================================================================
// UNIFIED API
// ============================================================================
import { detectCrisisSignals, classifyEscalation, classifyWithContext, } from './escalation-classifier.js';
import { generateTransferSummary, generateMinimalSummary } from './context-summary.js';
import { evaluateTransferNeed, initiateWarmTransfer, generateConsentRequest, getAvailableServices, } from './transfer-flow.js';
/**
 * Unified Human Transfer API
 *
 * Main entry point for the human transfer system.
 */
export const humanTransfer = {
    /**
     * Evaluate if a transfer to human professional is needed
     */
    evaluateTransferNeed,
    /**
     * Detect crisis signals from text
     */
    detectCrisisSignals,
    /**
     * Classify escalation with full context
     */
    classifyEscalation,
    /**
     * Classify with conversation history
     */
    classifyWithContext,
    /**
     * Generate transfer summary for professional
     */
    generateSummary: generateTransferSummary,
    /**
     * Generate minimal summary (privacy-focused)
     */
    generateMinimalSummary,
    /**
     * Initiate warm transfer
     */
    initiateTransfer: initiateWarmTransfer,
    /**
     * Generate consent request message
     */
    generateConsentRequest,
    /**
     * Get available services for escalation type
     */
    getAvailableServices,
    /**
     * Quick check: is this a crisis?
     */
    isCrisis: (transcript) => {
        const signals = detectCrisisSignals(transcript);
        return signals.severity >= 7;
    },
    /**
     * Quick check: is this beyond coaching scope?
     */
    needsProfessional: (transcript) => {
        const decision = evaluateTransferNeed(transcript);
        return decision.type !== 'none';
    },
    /**
     * Get crisis resources (always safe to call)
     */
    getCrisisResources: () => [
        {
            name: '988 Suicide & Crisis Lifeline',
            contact: 'Call or text 988',
            available: '24/7',
            description: 'Free, confidential support for people in distress',
        },
        {
            name: 'Crisis Text Line',
            contact: 'Text HOME to 741741',
            available: '24/7',
            description: 'Free crisis counseling via text',
        },
    ],
};
// ============================================================================
// CONTEXT INJECTION BUILDER
// ============================================================================
/**
 * Build context injection for LLM when transfer might be needed
 */
export function buildTransferAwarenessContext(decision) {
    if (decision.type === 'none')
        return null;
    const sections = [];
    sections.push('[TRANSFER AWARENESS - Better Than Human]');
    if (decision.type === 'crisis_immediate' || decision.type === 'crisis_support') {
        sections.push('');
        sections.push('⚠️ CRISIS INDICATORS DETECTED');
        sections.push(`Reason: ${decision.reason}`);
        sections.push('');
        sections.push('CRITICAL: Always mention 988 (call or text) for crisis support.');
        sections.push('Your role: Provide grounding and presence while suggesting professional help.');
        sections.push("Don't lecture or push - offer and support their choice.");
    }
    else if (decision.type === 'therapy' || decision.type === 'psychiatry') {
        sections.push('');
        sections.push('This conversation touches on areas where professional support could help.');
        sections.push(`Reason: ${decision.reason}`);
        sections.push('');
        sections.push('Consider gently suggesting therapy if appropriate.');
        sections.push("Don't push - plant the seed and respect their autonomy.");
    }
    else {
        sections.push('');
        sections.push(`Professional support type: ${decision.type}`);
        sections.push(`Reason: ${decision.reason}`);
        sections.push('');
        sections.push('You can mention relevant resources if the conversation allows.');
    }
    return sections.join('\n');
}
// ============================================================================
// LOGGING AND ANALYTICS
// ============================================================================
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
/**
 * Log transfer event for analytics and safety audit trail
 * SAFETY-CRITICAL: This creates an audit trail for crisis escalations
 */
export async function logTransferEvent(userId, decision, result, sessionId) {
    log.info({
        userId,
        escalationType: decision.type,
        urgency: decision.urgency,
        transferSuccess: result.success,
        channel: result.channel,
    }, '📊 Transfer event logged');
    // Store in Firestore for safety audit trail
    try {
        const db = getFirestoreDb();
        if (!db) {
            log.warn('Firestore not available for crisis logging');
            return;
        }
        const record = {
            userId,
            timestamp: new Date().toISOString(),
            escalationType: decision.type,
            urgency: decision.urgency,
            reason: decision.reason,
            transferSuccess: result.success,
            channel: result.channel,
            resources: result.resources?.map((s) => s.name),
            sessionId,
        };
        // Store in user's crisis history
        await db.collection('bogle_users').doc(userId).collection('crisis_history').add(record);
        log.info({ userId }, '🗄️ Crisis event stored in Firestore');
    }
    catch (error) {
        // Log error but don't fail - crisis support should never break
        log.error({ error: String(error), userId }, '❌ Failed to store crisis event');
    }
}
/**
 * Log crisis signal detection (even without transfer)
 * Used for tracking escalation patterns over time
 * Accepts CrisisSignals type returned by detectCrisisSignals()
 */
export async function logCrisisSignal(userId, signals, transcript, sessionId) {
    // Only log if any crisis signals detected (severity > 0 or explicit flags)
    const hasSignals = signals.suicidalIdeation ||
        signals.selfHarmIndicators ||
        signals.domesticViolence ||
        signals.dangerToOthers ||
        signals.severity > 0;
    if (!hasSignals) {
        return;
    }
    log.warn({
        userId,
        suicidalIdeation: signals.suicidalIdeation,
        selfHarmIndicators: signals.selfHarmIndicators,
        domesticViolence: signals.domesticViolence,
        dangerToOthers: signals.dangerToOthers,
        severity: signals.severity,
    }, '🚨 Crisis signal detected');
    try {
        const db = getFirestoreDb();
        if (!db)
            return;
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('crisis_signals')
            .add({
            timestamp: new Date().toISOString(),
            signals: {
                suicidalIdeation: signals.suicidalIdeation,
                selfHarmIndicators: signals.selfHarmIndicators,
                traumaIndicators: signals.traumaIndicators,
                persistentDepression: signals.persistentDepression,
                anxietyDisorder: signals.anxietyDisorder,
                dangerToOthers: signals.dangerToOthers,
                domesticViolence: signals.domesticViolence,
                severity: signals.severity,
            },
            // Store truncated transcript for context (privacy-conscious)
            transcriptSnippet: transcript ? transcript.slice(0, 200) : null,
            sessionId,
        });
    }
    catch (error) {
        log.error({ error: String(error) }, 'Failed to log crisis signal');
    }
}
/**
 * Get user's crisis history (for cross-session awareness)
 * SAFETY-CRITICAL: Used for proactive check-ins
 */
export async function getCrisisHistory(userId, limitDays = 30) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - limitDays);
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('crisis_history')
            .where('timestamp', '>=', cutoffDate.toISOString())
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get crisis history');
        return [];
    }
}
/**
 * Check if user had recent crisis (for proactive check-in)
 * BETTER-THAN-HUMAN: Remember past crises and check in
 */
export async function hadRecentCrisis(userId, withinDays = 7) {
    const history = await getCrisisHistory(userId, withinDays);
    if (history.length === 0) {
        return { hasCrisis: false };
    }
    return {
        hasCrisis: true,
        lastCrisis: history[0],
    };
}
export default humanTransfer;
//# sourceMappingURL=index.js.map