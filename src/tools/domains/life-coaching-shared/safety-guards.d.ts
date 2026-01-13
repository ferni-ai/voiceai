/**
 * Safety Guards for Life Coaching
 *
 * Detects crisis situations and ensures appropriate referral.
 * This is CRITICAL - we support, not replace professional help.
 */
import type { SafetyAssessment, CrisisResource, EmotionalState } from './types.js';
export declare const CRISIS_RESOURCES: Record<string, CrisisResource>;
/**
 * Assess safety level of user's message
 */
export declare function assessSafety(text: string): SafetyAssessment;
/**
 * Get crisis response message
 */
export declare function getCrisisResponse(assessment: SafetyAssessment): string;
/**
 * Check if topic requires professional referral
 */
export declare function needsProfessionalReferral(topic: string): {
    needs: boolean;
    reason?: string;
    resource?: CrisisResource;
};
/**
 * Check if emotional state warrants concern
 */
export declare function isEmotionalStateConcerning(state: EmotionalState): boolean;
/**
 * Get grounding suggestion for distressed state
 */
export declare function getGroundingSuggestion(): string;
/**
 * Topics we redirect to professionals
 */
export declare const PROFESSIONAL_REFERRAL_TOPICS: string[];
/**
 * Get appropriate disclaimer for sensitive topics
 */
export declare function getTopicDisclaimer(topic: string): string | null;
/**
 * Some domains need stricter safety checks than others.
 * HIGH = trauma, grief, chronic conditions (always check carefully)
 * MEDIUM = boundaries, anger, body image (check with context)
 * STANDARD = procrastination, digital wellness, dating (standard checks)
 */
export type DomainSensitivity = 'high' | 'medium' | 'standard';
/**
 * Check safety with domain context
 * High-sensitivity domains have stricter thresholds
 */
export declare function checkSafetyForDomain(query: string, domain: string): {
    isSafe: boolean;
    warning?: string;
    intervention?: string;
};
/**
 * Get domain sensitivity level
 */
export declare function getDomainSensitivity(domain: string): DomainSensitivity;
/**
 * Check if user input contains concerning content (domain-agnostic)
 * Returns an object with safety status and optional intervention
 *
 * This is the primary function used by life coaching domain tools.
 */
export declare function checkSafety(query: string): {
    isSafe: boolean;
    warning?: string;
    intervention?: string;
};
/**
 * Simple safety guard object for domain tools (legacy interface)
 * @deprecated Use checkSafety() or checkSafetyForDomain() function directly instead
 */
export declare const safetyGuard: {
    checkSafety: typeof checkSafety;
    checkSafetyForDomain: typeof checkSafetyForDomain;
};
//# sourceMappingURL=safety-guards.d.ts.map