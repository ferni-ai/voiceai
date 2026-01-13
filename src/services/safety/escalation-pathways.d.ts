/**
 * Escalation Pathways
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Determines when to suggest professional help and how to frame it warmly.
 * Ferni is not a replacement for professional care - but we can be a bridge.
 *
 * Philosophy:
 * - Professional help is a sign of strength, not weakness
 * - Frame as "addition to our relationship" not "replacement"
 * - Respect user autonomy while being clear about limits
 * - Never abandon, always accompany
 *
 * @module EscalationPathways
 */
import type { CrisisSignal } from './crisis-detection.js';
export type EscalationLevel = 'none' | 'gentle_suggestion' | 'warm_recommendation' | 'urgent_referral' | 'emergency';
export type ProfessionalType = 'therapist' | 'psychiatrist' | 'counselor' | 'crisis_counselor' | 'support_group' | 'addiction_specialist' | 'domestic_violence_advocate' | 'emergency_services';
export interface EscalationDecision {
    /** The level of escalation needed */
    level: EscalationLevel;
    /** Type of professional to suggest */
    suggestedProfessional: ProfessionalType | null;
    /** Warm framing language */
    framingLanguage: string;
    /** How Ferni positions the suggestion */
    ferniStance: string;
    /** Specific next step to offer */
    nextStep: string | null;
    /** Whether to track this for follow-up */
    trackForFollowUp: boolean;
}
export interface EscalationContext {
    /** Current session's crisis signals */
    sessionSignals: CrisisSignal[];
    /** Historical crisis signals (past sessions) */
    historicalSignals?: CrisisSignal[];
    /** Whether user is already in therapy */
    isInTherapy?: boolean;
    /** Whether user has previously declined referrals */
    previouslyDeclined?: boolean;
    /** Relationship stage */
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    /** User's expressed preferences about professional help */
    userPreferences?: {
        openToTherapy?: boolean;
        hasBadExperiences?: boolean;
        financialConcerns?: boolean;
    };
}
/**
 * Determine the appropriate escalation level based on context
 */
export declare function determineEscalation(context: EscalationContext): EscalationDecision;
/**
 * Get phrases for following up on escalation suggestions
 */
export declare function getEscalationFollowUp(previousLevel: EscalationLevel, wasAccepted: boolean): string;
/**
 * Generate a warm introduction to finding a therapist
 */
export declare function getTherapyFinderIntro(): string;
/**
 * Get practical tips for finding a therapist
 */
export declare function getTherapyFinderTips(): string[];
/**
 * Build LLM context injection for escalation awareness
 */
export declare function buildEscalationContext(decision: EscalationDecision): string | null;
declare const _default: {
    determineEscalation: typeof determineEscalation;
    getEscalationFollowUp: typeof getEscalationFollowUp;
    getTherapyFinderIntro: typeof getTherapyFinderIntro;
    getTherapyFinderTips: typeof getTherapyFinderTips;
    buildEscalationContext: typeof buildEscalationContext;
};
export default _default;
//# sourceMappingURL=escalation-pathways.d.ts.map