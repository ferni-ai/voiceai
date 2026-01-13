/**
 * Gentle Challenges System
 *
 * > "I love you, and I think you're selling yourself short."
 *
 * Knows when to gently push back, challenge assumptions, or encourage
 * the user to grow - without being preachy or invalidating.
 *
 * Key principles:
 * - Only challenge from a place of earned trust
 * - Lead with love, then push
 * - Know when to back off
 * - Challenge patterns, not feelings
 * - Make it about their own stated values
 *
 * @module @ferni/superhuman/gentle-challenges
 */
export type ChallengeType = 'self_limiting' | 'pattern_repeat' | 'values_mismatch' | 'catastrophizing' | 'deflection' | 'self_blame' | 'playing_small';
export interface Challenge {
    /** Type of challenge */
    type: ChallengeType;
    /** Confidence this is appropriate (0-1) */
    confidence: number;
    /** Evidence for this challenge */
    evidence: string;
    /** The gentle challenge phrasing */
    challenge: string;
    /** Lead-in that comes first */
    leadIn: string;
    /** Backup if they push back */
    softLanding: string;
}
export interface ChallengeContext {
    /** User's message */
    message: string;
    /** Topics discussed */
    topics: string[];
    /** User's emotion */
    emotion: string;
    /** Relationship stage */
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';
    /** Known user values (from past conversations) */
    userValues?: string[];
    /** Recent patterns (from past sessions) */
    recentPatterns?: string[];
    /** Turn count */
    turnCount: number;
}
/**
 * Detect if a gentle challenge might be appropriate
 */
export declare function detectChallengeOpportunity(context: ChallengeContext): Challenge | null;
/**
 * Format challenge guidance for LLM prompt
 */
export declare function formatChallengeGuidance(context: ChallengeContext): string | null;
/**
 * Check if now is a good time to challenge
 */
export declare function isGoodTimeToChallenge(context: ChallengeContext): boolean;
/**
 * Get a soft challenge for a specific type
 */
export declare function getSoftChallenge(type: ChallengeType): string;
//# sourceMappingURL=gentle-challenges.d.ts.map