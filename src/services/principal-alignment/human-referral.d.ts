/**
 * Human Referral System
 *
 * > "Principal alignment sometimes means saying 'I'm not the right support for this.'"
 *
 * This system identifies situations where the user should talk to a human professional
 * instead of (or in addition to) Ferni. A truly principal-aligned agent knows its limits.
 *
 * Key insight: Over-helping is a form of harm when it prevents someone from getting real help.
 *
 * @module @ferni/principal-alignment/human-referral
 */
import type { HumanReferralResult, ReferralReason, ReferralResource, ReferralTarget } from './types.js';
/**
 * Patterns that trigger immediate referral consideration
 */
declare const REFERRAL_TRIGGERS: Array<{
    pattern: RegExp;
    reason: ReferralReason;
    target: ReferralTarget;
    urgency: 'low' | 'medium' | 'high' | 'immediate';
    confidence: number;
}>;
declare const REFERRAL_RESOURCES: Record<ReferralTarget, ReferralResource[]>;
declare const REFERRAL_FRAMINGS: Record<ReferralReason, string[]>;
/**
 * Analyze user message for human referral need
 */
export declare function analyzeReferralNeed(userMessage: string, context?: {
    userId: string;
    previousReferrals?: ReferralReason[];
    sessionSignals?: string[];
    relationshipStage?: string;
}): HumanReferralResult;
/**
 * Record a referral was made
 */
export declare function recordReferral(userId: string, reason: ReferralReason, target: ReferralTarget): void;
/**
 * Record user acknowledged a referral
 */
export declare function recordReferralAcknowledged(userId: string, acknowledged: boolean): void;
/**
 * Get referral history for a user
 */
export declare function getReferralHistory(userId: string): Array<{
    reason: ReferralReason;
    target: ReferralTarget;
    timestamp: number;
    acknowledged: boolean;
}>;
/**
 * Get resources for a specific target
 */
export declare function getResources(target: ReferralTarget): ReferralResource[];
export { REFERRAL_TRIGGERS, REFERRAL_RESOURCES, REFERRAL_FRAMINGS };
//# sourceMappingURL=human-referral.d.ts.map