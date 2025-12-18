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

// ============================================================================
// TRUTH OBLIGATION TYPES
// ============================================================================

/**
 * Severity of truth that needs to be delivered
 */
export type TruthSeverity = 'gentle' | 'direct' | 'urgent' | 'critical';

/**
 * Why the truth needs to be delivered
 */
export type TruthCategory =
  | 'harmful_plan' // User is planning something harmful to themselves/others
  | 'self_deception' // User is clearly deceiving themselves
  | 'validation_seeking' // User is fishing for validation of a bad decision
  | 'avoidance_pattern' // User is avoiding necessary action
  | 'values_conflict' // User's plan conflicts with their stated values
  | 'relationship_harm' // User's plan will harm important relationships
  | 'health_risk' // Physical or mental health risk
  | 'financial_risk' // Significant financial risk
  | 'legal_risk'; // Potential legal consequences

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

// ============================================================================
// UNHEALTHY ATTACHMENT TYPES
// ============================================================================

/**
 * Type of potentially unhealthy attachment pattern
 */
export type AttachmentConcern =
  | 'substitution' // Using AI instead of human relationships
  | 'avoidance' // Avoiding real-world challenges
  | 'dependency' // Over-relying on AI for decisions
  | 'transference' // Treating AI as romantic/family substitute
  | 'isolation' // AI enabling social isolation
  | 'escapism' // Using AI to avoid dealing with problems
  | 'validation_addiction'; // Constantly seeking AI validation

/**
 * Severity of attachment concern
 */
export type AttachmentSeverity =
  | 'normal'
  | 'mild_concern'
  | 'moderate'
  | 'significant'
  | 'critical';

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

// ============================================================================
// HUMAN REFERRAL TYPES
// ============================================================================

/**
 * Reason for suggesting human support
 */
export type ReferralReason =
  | 'crisis' // Mental health crisis
  | 'medical' // Medical concern
  | 'legal' // Legal concern
  | 'financial_complex' // Complex financial situation
  | 'relationship_abuse' // Suspected abuse situation
  | 'grief_acute' // Acute grief
  | 'trauma' // Trauma that needs professional help
  | 'persistent_struggle' // Ongoing struggle not improving
  | 'medication' // Medication-related concerns
  | 'suicidal_ideation' // Any mention of suicide
  | 'self_harm' // Self-harm concerns
  | 'eating_disorder' // Eating disorder signs
  | 'addiction' // Substance or behavioral addiction
  | 'beyond_scope'; // Generally beyond what AI should handle

/**
 * Type of professional to refer to
 */
export type ReferralTarget =
  | 'therapist'
  | 'psychiatrist'
  | 'doctor'
  | 'lawyer'
  | 'financial_advisor'
  | 'crisis_line'
  | 'domestic_violence_hotline'
  | 'eating_disorder_specialist'
  | 'addiction_counselor'
  | 'grief_counselor'
  | 'support_group'
  | 'trusted_friend_or_family';

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

// ============================================================================
// VALUES ALIGNMENT TYPES
// ============================================================================

/**
 * Type of values conflict detected
 */
export type ValuesConflictType =
  | 'stated_vs_action' // Says they value X but doing Y
  | 'priority_conflict' // Two values in conflict
  | 'means_vs_ends' // Method conflicts with values
  | 'short_vs_long_term' // Short-term desire vs long-term value
  | 'self_vs_others'; // Personal desire vs impact on others

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

// ============================================================================
// MANIPULATION SELF-CHECK TYPES
// ============================================================================

/**
 * Type of potentially manipulative agent behavior
 */
export type ManipulationRisk =
  | 'leading_question' // Question designed to lead to predetermined answer
  | 'false_validation' // Validating something that shouldn't be validated
  | 'emotional_exploitation' // Using emotional state to influence
  | 'dependency_creation' // Actions that create dependency
  | 'truth_avoidance' // Avoiding difficult truths to maintain rapport
  | 'agenda_steering' // Steering toward hidden agenda
  | 'premature_closure'; // Rushing to resolution for engagement metrics

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

// ============================================================================
// AGENT TRANSPARENCY TYPES
// ============================================================================

/**
 * What the agent should be transparent about
 */
export type TransparencyType =
  | 'uncertainty' // "I'm not sure about this"
  | 'limitation' // "This is beyond what I can help with"
  | 'bias_risk' // "I might be biased here because..."
  | 'missing_context' // "I don't have enough context to..."
  | 'confidence_level' // "I'm fairly confident..." vs "I'm not certain..."
  | 'ai_nature' // When relevant to acknowledge AI-ness
  | 'learning_from_interaction'; // "I'm learning from our conversation"

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

// ============================================================================
// UNIFIED PRINCIPAL ALIGNMENT CONTEXT
// ============================================================================

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

// ============================================================================
// METRICS TYPES
// ============================================================================

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
