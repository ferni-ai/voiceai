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
export type { EscalationType, TransferUrgency, TransferChannel, EscalationDecision, CrisisSignals, TransferSummary, TransferConsent, TransferRequest, TransferResult, TransferRecord, CrisisService, ProfessionalEntry, } from './types.js';
import type { CrisisSignals } from './types.js';
export { detectCrisisSignals, classifyEscalation, classifyWithContext, escalationClassifier, } from './escalation-classifier.js';
export { generateTransferSummary, generateMinimalSummary, generateTopicsOnlySummary, contextSummary, } from './context-summary.js';
export { evaluateTransferNeed, getAvailableServices, initiateWarmTransfer, generateConsentRequest, transferFlow, } from './transfer-flow.js';
import { detectCrisisSignals, classifyEscalation, classifyWithContext } from './escalation-classifier.js';
import { generateTransferSummary, generateMinimalSummary } from './context-summary.js';
import { evaluateTransferNeed, initiateWarmTransfer, generateConsentRequest, getAvailableServices } from './transfer-flow.js';
import type { EscalationType, EscalationDecision, TransferResult } from './types.js';
/**
 * Unified Human Transfer API
 *
 * Main entry point for the human transfer system.
 */
export declare const humanTransfer: {
    /**
     * Evaluate if a transfer to human professional is needed
     */
    evaluateTransferNeed: typeof evaluateTransferNeed;
    /**
     * Detect crisis signals from text
     */
    detectCrisisSignals: typeof detectCrisisSignals;
    /**
     * Classify escalation with full context
     */
    classifyEscalation: typeof classifyEscalation;
    /**
     * Classify with conversation history
     */
    classifyWithContext: typeof classifyWithContext;
    /**
     * Generate transfer summary for professional
     */
    generateSummary: typeof generateTransferSummary;
    /**
     * Generate minimal summary (privacy-focused)
     */
    generateMinimalSummary: typeof generateMinimalSummary;
    /**
     * Initiate warm transfer
     */
    initiateTransfer: typeof initiateWarmTransfer;
    /**
     * Generate consent request message
     */
    generateConsentRequest: typeof generateConsentRequest;
    /**
     * Get available services for escalation type
     */
    getAvailableServices: typeof getAvailableServices;
    /**
     * Quick check: is this a crisis?
     */
    isCrisis: (transcript: string) => boolean;
    /**
     * Quick check: is this beyond coaching scope?
     */
    needsProfessional: (transcript: string) => boolean;
    /**
     * Get crisis resources (always safe to call)
     */
    getCrisisResources: () => {
        name: string;
        contact: string;
        available: string;
        description: string;
    }[];
};
/**
 * Build context injection for LLM when transfer might be needed
 */
export declare function buildTransferAwarenessContext(decision: EscalationDecision): string | null;
/**
 * Crisis event record stored in Firestore
 */
interface CrisisEventRecord {
    userId: string;
    timestamp: string;
    escalationType: EscalationType;
    urgency: string;
    reason: string;
    transferSuccess?: boolean;
    channel?: string;
    resources?: string[];
    sessionId?: string;
}
/**
 * Log transfer event for analytics and safety audit trail
 * SAFETY-CRITICAL: This creates an audit trail for crisis escalations
 */
export declare function logTransferEvent(userId: string, decision: EscalationDecision, result: TransferResult, sessionId?: string): Promise<void>;
/**
 * Log crisis signal detection (even without transfer)
 * Used for tracking escalation patterns over time
 * Accepts CrisisSignals type returned by detectCrisisSignals()
 */
export declare function logCrisisSignal(userId: string, signals: CrisisSignals, transcript?: string, sessionId?: string): Promise<void>;
/**
 * Get user's crisis history (for cross-session awareness)
 * SAFETY-CRITICAL: Used for proactive check-ins
 */
export declare function getCrisisHistory(userId: string, limitDays?: number): Promise<CrisisEventRecord[]>;
/**
 * Check if user had recent crisis (for proactive check-in)
 * BETTER-THAN-HUMAN: Remember past crises and check in
 */
export declare function hadRecentCrisis(userId: string, withinDays?: number): Promise<{
    hasCrisis: boolean;
    lastCrisis?: CrisisEventRecord;
}>;
export default humanTransfer;
//# sourceMappingURL=index.d.ts.map