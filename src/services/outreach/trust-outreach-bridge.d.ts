/**
 * Trust Systems → Outreach Bridge
 *
 * Connects all "better than human" trust-building systems to proactive outreach.
 *
 * This is where the magic happens:
 * - "I noticed you've been avoiding talking about work..."
 * - "Hey! How did that interview go?"
 * - "That thing you were celebrating? Still riding that high?"
 * - "I know Mondays are tough for you - just checking in"
 *
 * @module services/outreach/trust-outreach-bridge
 */
export interface TrustOutreachEvaluationResult {
    /** Number of triggers created */
    triggersCreated: number;
    /** Types of triggers created */
    triggerTypes: string[];
    /** Reasons skipped */
    skipped: Array<{
        reason: string;
        type: string;
    }>;
}
export interface ConcernOutreachContext {
    userId: string;
    concernLevel: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';
    concernType: string;
    lastMessage: string;
    detectedEmotion?: string;
    voiceStrain?: number;
}
/**
 * Evaluate all trust systems for outreach opportunities
 *
 * Called after each session or periodically for all users.
 * This is the main entry point for trust-based outreach.
 */
export declare function evaluateTrustBasedOutreach(userId: string, sessionId?: string): Promise<TrustOutreachEvaluationResult>;
/**
 * Handle concern detection from conversation or voice analysis
 *
 * When we detect someone is struggling, don't wait - reach out with care.
 */
export declare function handleConcernDetection(context: ConcernOutreachContext): Promise<boolean>;
/**
 * Check if a proposed outreach topic should be avoided
 *
 * Uses boundary memory and reading-between-lines to prevent
 * outreach that would make users uncomfortable.
 */
export declare function shouldAvoidOutreachTopic(userId: string, topic: string): {
    avoid: boolean;
    reason?: string;
};
/**
 * Run trust-based outreach evaluation for a batch of users
 *
 * Called by the daily outreach job.
 */
export declare function runTrustBasedOutreachBatch(userIds: string[]): Promise<{
    processed: number;
    totalTriggers: number;
    byType: Record<string, number>;
}>;
//# sourceMappingURL=trust-outreach-bridge.d.ts.map