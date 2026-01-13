/**
 * Principal Alignment Module
 *
 * > "When Ferni's interests conflict with the user's actual wellbeing, which wins?"
 *
 * This module ensures our agents serve users' genuine interests, not engagement
 * metrics, validation-seeking, or sycophancy disguised as rapport-building.
 *
 * Core Systems:
 * 1. **Truth Obligation** - When we MUST deliver difficult truths
 * 2. **Unhealthy Attachment** - Detecting dependency and substitution patterns
 * 3. **Human Referral** - When to recommend professional/human support
 * 4. **Values Surfacing** - Proactively surfacing values conflicts
 * 5. **Manipulation Check** - Self-auditing our own responses
 * 6. **Agent Transparency** - Being honest about our limitations
 *
 * @module @ferni/principal-alignment
 */
import type { PrincipalAlignmentContext } from './types.js';
export type * from './types.js';
export { clearSessionTruthObligations, detectTruthObligation, getSessionTruthObligations, recordTruthObligation, TRUTH_FRAMINGS, VALIDATION_SEEKING_PATTERNS, } from './truth-obligation.js';
export { assessAttachmentHealth, AVOIDANCE_PATTERNS, clearUserAttachmentData, DEPENDENCY_PATTERNS, getUserAttachmentProfile, HEALTHY_PATTERNS, recordDeclinedSuggestion, recordInterventionAcknowledged, SUBSTITUTION_PATTERNS, TRANSFERENCE_PATTERNS, } from './unhealthy-attachment.js';
export { analyzeReferralNeed, getReferralHistory, getResources, recordReferral, recordReferralAcknowledged, REFERRAL_FRAMINGS, REFERRAL_RESOURCES, REFERRAL_TRIGGERS, } from './human-referral.js';
export { analyzeValuesAlignment, clearUserValuesData, extractValues, getTopValues, getUserValuesProfile, setUserValues, VALUE_CATEGORIES, VALUE_CONFLICTS, } from './values-surfacing.js';
export { analyzeConversationPatterns, checkForManipulation, DEPENDENCY_CREATION_PATTERNS, EMOTIONAL_EXPLOITATION_PATTERNS, FALSE_VALIDATION_PATTERNS, LEADING_QUESTION_PATTERNS, PREMATURE_CLOSURE_PATTERNS, quickManipulationGuard, TRUTH_AVOIDANCE_PATTERNS, } from './manipulation-check.js';
export { analyzeTransparencyNeeds, BIAS_ACKNOWLEDGMENTS, HIGH_CONFIDENCE_DOMAINS, injectTransparency, LIMITATION_EXPRESSIONS, LOW_CONFIDENCE_DOMAINS, quickTransparencyCheck, shouldSayIDontKnow, UNCERTAINTY_EXPRESSIONS, } from './agent-transparency.js';
export { clearAllMetrics, clearMetricsBuffer, clearUserMetrics, getAggregateMetrics, getEventBreakdown, getHealthCheck, getRecentEvents, getUserMetrics, recordAlignmentScore, recordAttachmentHealthEvent, recordHumanReferralEvent, recordManipulationCheckEvent, recordTruthObligationEvent, recordValuesConflictEvent, type MetricsEntry, } from './metrics.js';
/**
 * Build complete principal alignment context for a conversation turn
 */
export declare function buildPrincipalAlignmentContext(userId: string, userMessage: string, agentResponse: string, context: {
    sessionId: string;
    turnCount: number;
    statedValues?: string[];
    relationshipStage?: string;
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
    previousMessages?: string[];
}): PrincipalAlignmentContext;
/**
 * Clean up all principal alignment data for a user
 */
export declare function cleanupUserPrincipalAlignment(userId: string): void;
/**
 * Clean up session-specific data
 */
export declare function cleanupSessionPrincipalAlignment(sessionId: string): void;
declare const _default: {
    buildPrincipalAlignmentContext: typeof buildPrincipalAlignmentContext;
    cleanupUserPrincipalAlignment: typeof cleanupUserPrincipalAlignment;
    cleanupSessionPrincipalAlignment: typeof cleanupSessionPrincipalAlignment;
};
export default _default;
//# sourceMappingURL=index.d.ts.map