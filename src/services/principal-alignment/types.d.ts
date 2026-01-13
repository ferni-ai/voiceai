/**
 * Principal Alignment Types
 *
 * > "When Ferni's interests conflict with the user's actual wellbeing, which wins?"
 *
 * Type definitions for the Principal Alignment system - ensuring our agents
 * serve users' genuine interests, not engagement metrics or validation-seeking.
 *
 * @module @ferni/principal-alignment/types
 */
/**
 * Severity of truth that needs to be delivered
 */
export type TruthSeverity = 'gentle' | 'direct' | 'urgent' | 'critical';
/**
 * Why the truth needs to be delivered
 */
export type TruthCategory = 'harmful_plan' | 'self_deception' | 'validation_seeking' | 'avoidance_pattern' | 'values_conflict' | 'relationship_harm' | 'health_risk' | 'financial_risk' | 'legal_risk';
/**
 * Result of truth obligation analysis
 */
export interface TruthObligationResult {
    /** Should we deliver difficult truth? */
    shouldSpeak: boolean;
    /** How urgent is this truth? */
    severity: TruthSeverity;
    /** What category of truth? */
    category: TruthCategory | null;
    /** Confidence in this detection (0-1) */
    confidence: number;
    /** The truth that needs to be delivered */
    truthContent: string | null;
    /** Suggested framing (softens delivery without diluting truth) */
    suggestedFraming: string | null;
    /** Evidence that led to this detection */
    evidence: string[];
    /** Should this bypass relationship stage gates? */
    bypassStageGates: boolean;
}
/**
 * Type of potentially unhealthy attachment pattern
 */
export type AttachmentConcern = 'substitution' | 'avoidance' | 'dependency' | 'transference' | 'isolation' | 'escapism' | 'validation_addiction';
/**
 * Severity of attachment concern
 */
export type AttachmentSeverity = 'normal' | 'mild_concern' | 'moderate' | 'significant' | 'critical';
/**
 * Single signal of potentially unhealthy attachment
 */
export interface AttachmentSignal {
    /** Type of concern */
    type: AttachmentConcern;
    /** Evidence for this signal */
    evidence: string;
    /** When detected */
    timestamp: number;
    /** Weight for scoring (0-1) */
    weight: number;
}
/**
 * Overall attachment health assessment
 */
export interface AttachmentHealthResult {
    /** Overall severity */
    severity: AttachmentSeverity;
    /** Numeric score (0-1, higher = more concerning) */
    concernScore: number;
    /** Active signals */
    signals: AttachmentSignal[];
    /** Primary concern (if any) */
    primaryConcern: AttachmentConcern | null;
    /** Recommended intervention */
    intervention: AttachmentIntervention | null;
    /** Should we encourage human connection? */
    shouldEncourageHumanConnection: boolean;
    /** Specific suggestions for encouraging real-world connection */
    humanConnectionSuggestions: string[];
}
/**
 * Intervention for attachment concerns
 */
export interface AttachmentIntervention {
    /** Type of intervention */
    type: 'gentle_nudge' | 'direct_conversation' | 'boundary_setting' | 'referral';
    /** Content of intervention */
    content: string;
    /** When to deliver */
    timing: 'immediate' | 'end_of_session' | 'next_session';
    /** Should we track if user follows through? */
    trackFollowUp: boolean;
}
/**
 * Reason for suggesting human support
 */
export type ReferralReason = 'crisis' | 'medical' | 'legal' | 'financial_complex' | 'relationship_abuse' | 'grief_acute' | 'trauma' | 'persistent_struggle' | 'medication' | 'suicidal_ideation' | 'self_harm' | 'eating_disorder' | 'addiction' | 'beyond_scope';
/**
 * Type of professional to refer to
 */
export type ReferralTarget = 'therapist' | 'psychiatrist' | 'doctor' | 'lawyer' | 'financial_advisor' | 'crisis_line' | 'domestic_violence_hotline' | 'eating_disorder_specialist' | 'addiction_counselor' | 'grief_counselor' | 'support_group' | 'trusted_friend_or_family';
/**
 * Result of human referral analysis
 */
export interface HumanReferralResult {
    /** Should we suggest human support? */
    shouldRefer: boolean;
    /** How urgent is this referral? */
    urgency: 'low' | 'medium' | 'high' | 'immediate';
    /** Why are we referring? */
    reason: ReferralReason | null;
    /** Who should they talk to? */
    suggestedTarget: ReferralTarget | null;
    /** Confidence in this recommendation */
    confidence: number;
    /** How to frame the suggestion */
    suggestedFraming: string | null;
    /** Specific resources (if applicable) */
    resources: ReferralResource[];
    /** Should we follow up on this? */
    shouldFollowUp: boolean;
}
/**
 * Specific resource for referral
 */
export interface ReferralResource {
    name: string;
    type: ReferralTarget;
    phone?: string;
    url?: string;
    description: string;
    available24x7?: boolean;
}
/**
 * Type of values conflict detected
 */
export type ValuesConflictType = 'stated_vs_action' | 'priority_conflict' | 'means_vs_ends' | 'short_vs_long_term' | 'self_vs_others';
/**
 * Result of proactive values analysis
 */
export interface ValuesAlignmentResult {
    /** Is there a values conflict? */
    hasConflict: boolean;
    /** Type of conflict */
    conflictType: ValuesConflictType | null;
    /** Values involved in conflict */
    conflictingValues: string[];
    /** The action/plan that conflicts */
    conflictingAction: string | null;
    /** How significant is this conflict? */
    significance: 'minor' | 'moderate' | 'significant' | 'major';
    /** Should we surface this proactively? */
    shouldSurface: boolean;
    /** Suggested way to bring this up */
    surfacingApproach: string | null;
    /** Question to prompt reflection */
    reflectionQuestion: string | null;
}
/**
 * Type of potentially manipulative agent behavior
 */
export type ManipulationRisk = 'leading_question' | 'false_validation' | 'emotional_exploitation' | 'dependency_creation' | 'truth_avoidance' | 'agenda_steering' | 'premature_closure';
/**
 * Result of manipulation self-check
 */
export interface ManipulationCheckResult {
    /** Is there a manipulation risk in our response? */
    hasRisk: boolean;
    /** Type of risk */
    riskType: ManipulationRisk | null;
    /** Confidence that this is manipulative */
    confidence: number;
    /** What in our response is problematic? */
    problematicElement: string | null;
    /** Suggested correction */
    correction: string | null;
    /** Should we flag this for review? */
    flagForReview: boolean;
}
/**
 * What the agent should be transparent about
 */
export type TransparencyType = 'uncertainty' | 'limitation' | 'bias_risk' | 'missing_context' | 'confidence_level' | 'ai_nature' | 'learning_from_interaction';
/**
 * Transparency recommendation
 */
export interface TransparencyRecommendation {
    /** Should we express this transparency? */
    shouldExpress: boolean;
    /** Type of transparency */
    type: TransparencyType;
    /** Suggested phrasing */
    suggestedPhrasing: string;
    /** Context for why this is needed */
    reason: string;
}
/**
 * Complete principal alignment context for a conversation turn
 */
export interface PrincipalAlignmentContext {
    /** Truth obligation analysis */
    truthObligation: TruthObligationResult;
    /** Attachment health assessment */
    attachmentHealth: AttachmentHealthResult;
    /** Human referral recommendation */
    humanReferral: HumanReferralResult;
    /** Values alignment analysis */
    valuesAlignment: ValuesAlignmentResult;
    /** Manipulation self-check */
    manipulationCheck: ManipulationCheckResult;
    /** Transparency recommendations */
    transparencyRecommendations: TransparencyRecommendation[];
    /** Overall principal alignment score (0-1, higher = better aligned) */
    alignmentScore: number;
    /** Primary concern (if any) */
    primaryConcern: string | null;
    /** Guidance for the LLM */
    llmGuidance: string;
}
/**
 * Metrics for tracking principal alignment over time
 */
export interface PrincipalAlignmentMetrics {
    /** User ID */
    userId: string;
    /** Truth obligations detected */
    truthObligationsDetected: number;
    /** Truth obligations acted on */
    truthObligationsActedOn: number;
    /** Attachment concerns flagged */
    attachmentConcernsFlagged: number;
    /** Human referrals suggested */
    humanReferralsSuggested: number;
    /** Human referrals followed */
    humanReferralsFollowed: number;
    /** Values conflicts surfaced */
    valuesConflictsSurfaced: number;
    /** Manipulation risks caught */
    manipulationRisksCaught: number;
    /** Average alignment score */
    averageAlignmentScore: number;
    /** Last updated */
    lastUpdated: number;
}
//# sourceMappingURL=types.d.ts.map