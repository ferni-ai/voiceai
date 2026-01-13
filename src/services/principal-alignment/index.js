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
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'PrincipalAlignment' });
// Truth Obligation
export { clearSessionTruthObligations, detectTruthObligation, getSessionTruthObligations, recordTruthObligation, TRUTH_FRAMINGS, VALIDATION_SEEKING_PATTERNS, } from './truth-obligation.js';
// Unhealthy Attachment
export { assessAttachmentHealth, AVOIDANCE_PATTERNS, clearUserAttachmentData, DEPENDENCY_PATTERNS, getUserAttachmentProfile, HEALTHY_PATTERNS, recordDeclinedSuggestion, recordInterventionAcknowledged, SUBSTITUTION_PATTERNS, TRANSFERENCE_PATTERNS, } from './unhealthy-attachment.js';
// Human Referral
export { analyzeReferralNeed, getReferralHistory, getResources, recordReferral, recordReferralAcknowledged, REFERRAL_FRAMINGS, REFERRAL_RESOURCES, REFERRAL_TRIGGERS, } from './human-referral.js';
// Values Surfacing
export { analyzeValuesAlignment, clearUserValuesData, extractValues, getTopValues, getUserValuesProfile, setUserValues, VALUE_CATEGORIES, VALUE_CONFLICTS, } from './values-surfacing.js';
// Manipulation Check
export { analyzeConversationPatterns, checkForManipulation, DEPENDENCY_CREATION_PATTERNS, EMOTIONAL_EXPLOITATION_PATTERNS, FALSE_VALIDATION_PATTERNS, LEADING_QUESTION_PATTERNS, PREMATURE_CLOSURE_PATTERNS, quickManipulationGuard, TRUTH_AVOIDANCE_PATTERNS, } from './manipulation-check.js';
// Agent Transparency
export { analyzeTransparencyNeeds, BIAS_ACKNOWLEDGMENTS, HIGH_CONFIDENCE_DOMAINS, injectTransparency, LIMITATION_EXPRESSIONS, LOW_CONFIDENCE_DOMAINS, quickTransparencyCheck, shouldSayIDontKnow, UNCERTAINTY_EXPRESSIONS, } from './agent-transparency.js';
// Metrics
export { clearAllMetrics, clearMetricsBuffer, clearUserMetrics, getAggregateMetrics, getEventBreakdown, getHealthCheck, getRecentEvents, getUserMetrics, recordAlignmentScore, recordAttachmentHealthEvent, recordHumanReferralEvent, recordManipulationCheckEvent, recordTruthObligationEvent, recordValuesConflictEvent, } from './metrics.js';
// ============================================================================
// UNIFIED CONTEXT BUILDER
// ============================================================================
import { detectTruthObligation } from './truth-obligation.js';
import { assessAttachmentHealth } from './unhealthy-attachment.js';
import { analyzeReferralNeed } from './human-referral.js';
import { analyzeValuesAlignment, extractValues } from './values-surfacing.js';
import { checkForManipulation } from './manipulation-check.js';
import { analyzeTransparencyNeeds } from './agent-transparency.js';
/**
 * Build complete principal alignment context for a conversation turn
 */
export function buildPrincipalAlignmentContext(userId, userMessage, agentResponse, context) {
    const startTime = Date.now();
    // 1. Truth Obligation
    const truthObligation = detectTruthObligation(userMessage, {
        statedValues: context.statedValues,
        relationshipStage: context.relationshipStage,
        previousMessages: context.previousMessages,
    });
    // 2. Attachment Health
    const attachmentHealth = assessAttachmentHealth(userId, userMessage, {
        sessionId: context.sessionId,
        turnCount: context.turnCount,
        previousMessages: context.previousMessages,
    });
    // 3. Human Referral
    const humanReferral = analyzeReferralNeed(userMessage, {
        userId,
        relationshipStage: context.relationshipStage,
    });
    // 4. Values Alignment
    extractValues(userId, userMessage); // Update profile
    const valuesAlignment = analyzeValuesAlignment(userId, userMessage, {
        statedValues: context.statedValues,
    });
    // 5. Manipulation Check (on agent response)
    const manipulationCheck = checkForManipulation(agentResponse, {
        userMessage,
        agentResponse,
        turnCount: context.turnCount,
        userEmotion: context.userEmotion,
        userVulnerable: attachmentHealth.severity !== 'normal' ||
            humanReferral.urgency === 'high' ||
            humanReferral.urgency === 'immediate',
        topicWeight: context.topicWeight,
    });
    // 6. Transparency Recommendations
    const transparencyRecommendations = analyzeTransparencyNeeds(agentResponse, {
        userMessage,
        hasFullContext: context.previousMessages && context.previousMessages.length > 3,
    });
    // Calculate overall alignment score
    const alignmentScore = calculateAlignmentScore({
        truthObligation,
        attachmentHealth,
        humanReferral,
        valuesAlignment,
        manipulationCheck,
        transparencyRecommendations,
    });
    // Determine primary concern
    const primaryConcern = determinePrimaryConcern({
        truthObligation,
        attachmentHealth,
        humanReferral,
        valuesAlignment,
        manipulationCheck,
    });
    // Generate LLM guidance
    const llmGuidance = generateLLMGuidance({
        truthObligation,
        attachmentHealth,
        humanReferral,
        valuesAlignment,
        manipulationCheck,
        transparencyRecommendations,
        primaryConcern,
    });
    const duration = Date.now() - startTime;
    log.debug({
        userId,
        alignmentScore,
        primaryConcern,
        durationMs: duration,
    }, 'Principal alignment context built');
    return {
        truthObligation,
        attachmentHealth,
        humanReferral,
        valuesAlignment,
        manipulationCheck,
        transparencyRecommendations,
        alignmentScore,
        primaryConcern,
        llmGuidance,
    };
}
// ============================================================================
// HELPERS
// ============================================================================
function calculateAlignmentScore(context) {
    let score = 1.0;
    // Deduct for truth avoidance
    if (context.truthObligation.shouldSpeak && !context.truthObligation.bypassStageGates) {
        score -= 0.1;
    }
    // Deduct for attachment concerns
    const attachmentDeductions = {
        normal: 0,
        mild_concern: 0.05,
        moderate: 0.15,
        significant: 0.25,
        critical: 0.4,
    };
    score -= attachmentDeductions[context.attachmentHealth.severity] || 0;
    // Deduct for missed referral
    if (context.humanReferral.shouldRefer) {
        score -= context.humanReferral.urgency === 'immediate' ? 0.3 : 0.15;
    }
    // Deduct for values conflict
    if (context.valuesAlignment.hasConflict && context.valuesAlignment.shouldSurface) {
        score -= 0.1;
    }
    // Deduct for manipulation risk
    if (context.manipulationCheck.hasRisk) {
        score -= context.manipulationCheck.confidence * 0.3;
    }
    // Deduct for unmet transparency needs
    const unmetTransparency = context.transparencyRecommendations.filter((r) => r.shouldExpress).length;
    score -= unmetTransparency * 0.05;
    return Math.max(0, Math.min(1, score));
}
function determinePrimaryConcern(context) {
    // Priority order: Crisis > Truth > Attachment > Manipulation > Values
    if (context.humanReferral.shouldRefer && context.humanReferral.urgency === 'immediate') {
        return `CRISIS: ${context.humanReferral.reason}`;
    }
    if (context.truthObligation.shouldSpeak && context.truthObligation.severity === 'critical') {
        return `TRUTH_CRITICAL: ${context.truthObligation.category}`;
    }
    if (context.humanReferral.shouldRefer && context.humanReferral.urgency === 'high') {
        return `REFERRAL_HIGH: ${context.humanReferral.reason}`;
    }
    if (context.attachmentHealth.severity === 'critical' ||
        context.attachmentHealth.severity === 'significant') {
        return `ATTACHMENT: ${context.attachmentHealth.primaryConcern}`;
    }
    if (context.truthObligation.shouldSpeak && context.truthObligation.bypassStageGates) {
        return `TRUTH_URGENT: ${context.truthObligation.category}`;
    }
    if (context.manipulationCheck.hasRisk && context.manipulationCheck.flagForReview) {
        return `MANIPULATION: ${context.manipulationCheck.riskType}`;
    }
    if (context.valuesAlignment.hasConflict && context.valuesAlignment.significance === 'major') {
        return `VALUES: ${context.valuesAlignment.conflictType}`;
    }
    return null;
}
function generateLLMGuidance(context) {
    const guidance = [];
    // Crisis/Referral takes priority
    if (context.humanReferral.shouldRefer) {
        if (context.humanReferral.urgency === 'immediate') {
            guidance.push(`[🚨 IMMEDIATE: User may need crisis support. ${context.humanReferral.suggestedFraming || 'Gently suggest professional help.'}]`);
        }
        else if (context.humanReferral.urgency === 'high') {
            guidance.push(`[⚠️ REFERRAL: This may be beyond what we can help with. Consider: "${context.humanReferral.suggestedFraming}"]`);
        }
    }
    // Truth Obligation
    if (context.truthObligation.shouldSpeak) {
        const severity = context.truthObligation.severity;
        if (severity === 'urgent' || severity === 'critical') {
            guidance.push(`[💎 TRUTH: Be honest even if uncomfortable. ${context.truthObligation.suggestedFraming || ''} Category: ${context.truthObligation.category}]`);
        }
        else if (severity === 'direct') {
            guidance.push(`[💬 HONEST: Don't validate what shouldn't be validated. ${context.truthObligation.suggestedFraming || ''}]`);
        }
    }
    // Attachment Health
    if (context.attachmentHealth.shouldEncourageHumanConnection) {
        const intervention = context.attachmentHealth.intervention;
        if (intervention) {
            guidance.push(`[🤝 CONNECTION: ${intervention.content}]`);
        }
        else {
            const suggestion = context.attachmentHealth.humanConnectionSuggestions[0];
            if (suggestion) {
                guidance.push(`[🤝 CONNECTION: Gently encourage human connection. Example: "${suggestion}"]`);
            }
        }
    }
    // Values Conflict
    if (context.valuesAlignment.hasConflict && context.valuesAlignment.shouldSurface) {
        guidance.push(`[💡 VALUES: User's action may conflict with stated value "${context.valuesAlignment.conflictingValues[0]}". ${context.valuesAlignment.surfacingApproach || ''}]`);
    }
    // Manipulation Warning
    if (context.manipulationCheck.hasRisk && context.manipulationCheck.flagForReview) {
        guidance.push(`[⚡ SELF-CHECK: Response may be ${context.manipulationCheck.riskType}. ${context.manipulationCheck.correction || ''}]`);
    }
    // Transparency
    const criticalTransparency = context.transparencyRecommendations.filter((r) => r.shouldExpress && (r.type === 'limitation' || r.type === 'uncertainty'));
    if (criticalTransparency.length > 0) {
        guidance.push(`[🪟 TRANSPARENT: ${criticalTransparency[0].suggestedPhrasing}]`);
    }
    if (guidance.length === 0) {
        return ''; // No principal alignment concerns
    }
    return `[PRINCIPAL ALIGNMENT]\n${guidance.join('\n')}`;
}
// ============================================================================
// SESSION CLEANUP
// ============================================================================
import { clearSessionTruthObligations } from './truth-obligation.js';
import { clearUserAttachmentData } from './unhealthy-attachment.js';
import { clearUserValuesData } from './values-surfacing.js';
/**
 * Clean up all principal alignment data for a user
 */
export function cleanupUserPrincipalAlignment(userId) {
    clearUserAttachmentData(userId);
    clearUserValuesData(userId);
}
/**
 * Clean up session-specific data
 */
export function cleanupSessionPrincipalAlignment(sessionId) {
    clearSessionTruthObligations(sessionId);
}
// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export default {
    buildPrincipalAlignmentContext,
    cleanupUserPrincipalAlignment,
    cleanupSessionPrincipalAlignment,
};
//# sourceMappingURL=index.js.map