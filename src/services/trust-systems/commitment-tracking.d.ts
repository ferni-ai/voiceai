/**
 * Commitment Tracking System
 *
 * "Better Than Human" - We remember what you said you'd do.
 *
 * Philosophy: Real accountability isn't nagging. It's:
 * - Remembering the specific thing they committed to
 * - Gently checking in at the right time
 * - Celebrating progress without judgment
 * - Understanding setbacks with empathy
 * - Adjusting expectations based on their reality
 *
 * This system tracks:
 * - Explicit commitments ("I'm going to start exercising")
 * - Implicit commitments ("I should really call my mom")
 * - Follow-up schedules (when to check in)
 * - Progress and setbacks
 * - Context for empathetic responses
 *
 * @module CommitmentTracking
 */
export type CommitmentType = 'explicit' | 'implicit' | 'goal' | 'promise' | 'habit' | 'task';
export type CommitmentStatus = 'active' | 'completed' | 'abandoned' | 'paused' | 'in_progress';
export type FollowUpType = 'check_in' | 'specific' | 'celebrate' | 'encourage' | 'remind';
export interface Commitment {
    id: string;
    userId: string;
    /** What they committed to */
    content: string;
    /** Type of commitment */
    type: CommitmentType;
    /** Current status */
    status: CommitmentStatus;
    /** When they made the commitment */
    createdAt: Date;
    /** Last time we discussed this */
    lastMentioned: Date;
    /** When to follow up */
    followUpDate: Date | null;
    /** Follow-up type */
    followUpType: FollowUpType;
    /** Original context (what they said) */
    originalQuote: string;
    /** Why this matters to them (if shared) */
    motivation?: string;
    /** Any obstacles they mentioned */
    obstacles?: string[];
    /** Progress notes */
    progressNotes: Array<{
        date: Date;
        note: string;
        sentiment: 'positive' | 'neutral' | 'setback';
    }>;
    /** Times we've followed up */
    followUpCount: number;
    /** Their response to follow-ups */
    followUpReception: 'positive' | 'neutral' | 'avoidant' | 'unknown';
    /** Related topic area */
    domain?: 'health' | 'relationships' | 'career' | 'personal_growth' | 'finance' | 'creativity' | 'other';
    /** Importance they indicated (explicit or inferred) */
    importance: 'high' | 'medium' | 'low';
    /** Should we actively follow up? */
    shouldFollowUp: boolean;
}
export interface CommitmentProfile {
    userId: string;
    commitments: Commitment[];
    /** Total commitments made */
    totalCommitments: number;
    /** Completion rate */
    completionRate: number;
    /** Patterns */
    patterns: {
        /** Domains they commit to most */
        topDomains: string[];
        /** Common obstacles */
        commonObstacles: string[];
        /** Best time for check-ins */
        bestFollowUpTiming: 'morning' | 'evening' | 'midweek' | 'weekend';
        /** How they respond to accountability */
        accountabilityStyle: 'welcome' | 'gentle' | 'minimal';
    };
}
/**
 * Detect commitments in user text
 */
export declare function detectCommitments(userText: string, _context?: {
    recentTopics?: string[];
    emotion?: string;
}): Array<{
    type: CommitmentType;
    content: string;
    quote: string;
}>;
/**
 * Detect progress on existing commitments
 */
export declare function detectProgress(userText: string, existingCommitments: Commitment[]): Array<{
    commitmentId: string;
    type: 'completed' | 'progress' | 'setback';
    context: string;
}>;
/**
 * Save a new commitment
 */
export declare function saveCommitment(commitment: Commitment): Promise<void>;
/**
 * Get user's active commitments
 */
export declare function getActiveCommitments(userId: string): Promise<Commitment[]>;
/**
 * Get commitments due for follow-up
 */
export declare function getCommitmentsDueForFollowUp(userId: string): Promise<Commitment[]>;
/**
 * Update commitment status
 */
export declare function updateCommitmentStatus(userId: string, commitmentId: string, status: CommitmentStatus, note?: string): Promise<void>;
/**
 * Record a follow-up was made
 */
export declare function recordFollowUp(userId: string, commitmentId: string, reception: 'positive' | 'neutral' | 'avoidant'): Promise<void>;
/**
 * Process user message for commitments
 * Call this from turn handler
 */
export declare function processCommitments(userId: string, userText: string, context?: {
    recentTopics?: string[];
    emotion?: string;
}): Promise<{
    newCommitments: Commitment[];
    progressUpdates: Array<{
        commitmentId: string;
        type: string;
    }>;
    followUpsDue: Commitment[];
}>;
/**
 * Generate follow-up phrase for a commitment
 */
export declare function generateFollowUpPhrase(commitment: Commitment): string;
//# sourceMappingURL=commitment-tracking.d.ts.map