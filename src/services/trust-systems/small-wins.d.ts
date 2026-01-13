/**
 * Small Wins Celebrator
 *
 * Noticing effort, not just outcomes - celebrating the small
 * courage moments that often go unacknowledged.
 *
 * Philosophy: Big wins get celebrated by everyone. But the small
 * acts of courage - sending that email, making that call, showing
 * up when you didn't want to - those need a witness too.
 *
 * This system tracks:
 * - Things they said they'd do (and did)
 * - Small acts of courage mentioned
 * - Progress on difficult things
 * - Following through on intentions
 * - Effort regardless of outcome
 *
 * @module SmallWins
 */
export interface SmallWin {
    id: string;
    /** What type of win this is */
    type: 'followed_through' | 'courage_moment' | 'self_care' | 'boundary_held' | 'hard_conversation' | 'showed_up' | 'tried_new_thing' | 'asked_for_help' | 'let_it_go' | 'effort_made';
    /** Description of the win */
    description: string;
    /** What made this hard for them specifically */
    whatMadeItHard?: string;
    /** When this happened */
    timestamp: Date;
    /** Whether we've celebrated this */
    celebrated: boolean;
    /** How they responded to celebration */
    celebrationResponse?: 'appreciated' | 'dismissed' | 'emotional';
}
export interface PendingIntention {
    id: string;
    /** What they said they'd do */
    intention: string;
    /** When they stated this intention */
    statedAt: Date;
    /** When they said they'd do it by */
    targetTime?: Date;
    /** Keywords to detect completion */
    completionKeywords: string[];
    /** Status of this intention */
    status: 'pending' | 'completed' | 'abandoned' | 'struggled';
    /** If completed, the win that was created */
    linkedWinId?: string;
}
export interface SmallWinsProfile {
    userId: string;
    /** All recorded small wins */
    wins: SmallWin[];
    /** Stated intentions we're watching for */
    pendingIntentions: PendingIntention[];
    /** Things we know are hard for them */
    knownDifficulties: string[];
    /** Celebration style preferences */
    celebrationPreference: 'enthusiastic' | 'understated' | 'reflective';
}
export interface CelebrationOpportunity {
    win: SmallWin;
    celebration: string;
    ssml: string;
    intensity: 'big' | 'medium' | 'small';
}
/**
 * Analyze a message for small wins
 */
export declare function detectSmallWin(userId: string, userMessage: string, context?: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
}): SmallWin | null;
/**
 * Detect and store stated intentions
 */
export declare function detectIntention(userId: string, userMessage: string): PendingIntention | null;
/**
 * Generate a celebration for an uncelebrated win
 */
export declare function generateCelebration(userId: string, win?: SmallWin): CelebrationOpportunity | null;
/**
 * Record celebration response
 */
export declare function recordCelebrationResponse(userId: string, winId: string, response: 'appreciated' | 'dismissed' | 'emotional'): void;
/**
 * Get pending intentions for a user
 */
export declare function getPendingIntentions(userId: string): PendingIntention[];
/**
 * Get overdue intentions that need follow-up
 * Returns intentions where target time has passed or it's been a while since stated
 */
export declare function getOverdueIntentions(userId: string, options?: {
    maxDaysOld?: number;
    includeNoTarget?: boolean;
}): PendingIntention[];
/**
 * Generate a follow-up question for an intention
 * These are warm, non-judgmental check-ins
 */
export declare function generateIntentionFollowUp(intention: PendingIntention): {
    question: string;
    ssml: string;
    tone: 'curious' | 'supportive' | 'celebratory';
};
/**
 * Check if we should follow up on intentions at session start
 * Returns the highest priority intention to follow up on
 */
export declare function getIntentionToFollowUp(userId: string): {
    intention: PendingIntention;
    followUp: ReturnType<typeof generateIntentionFollowUp>;
} | null;
/**
 * Mark an intention as abandoned (user decided not to do it)
 */
export declare function markIntentionAbandoned(userId: string, intentionId: string): void;
/**
 * Mark an intention as struggled (they tried but it didn't work out)
 * This is still worth celebrating the effort
 */
export declare function markIntentionStruggled(userId: string, intentionId: string): SmallWin | null;
/**
 * Get uncelebrated wins
 */
export declare function getUncelebratedWins(userId: string): SmallWin[];
/**
 * Record a known difficulty for this user
 */
export declare function recordKnownDifficulty(userId: string, difficulty: string): void;
/**
 * Export profile for persistence
 */
export declare function exportSmallWinsProfile(userId: string): SmallWinsProfile | null;
/**
 * Import profile from persistence
 */
export declare function importSmallWinsProfile(profile: SmallWinsProfile): void;
declare const _default: {
    detectSmallWin: typeof detectSmallWin;
    detectIntention: typeof detectIntention;
    generateCelebration: typeof generateCelebration;
    generateIntentionFollowUp: typeof generateIntentionFollowUp;
    getIntentionToFollowUp: typeof getIntentionToFollowUp;
    getOverdueIntentions: typeof getOverdueIntentions;
    getPendingIntentions: typeof getPendingIntentions;
    getUncelebratedWins: typeof getUncelebratedWins;
    markIntentionAbandoned: typeof markIntentionAbandoned;
    markIntentionStruggled: typeof markIntentionStruggled;
    recordCelebrationResponse: typeof recordCelebrationResponse;
    recordKnownDifficulty: typeof recordKnownDifficulty;
    exportSmallWinsProfile: typeof exportSmallWinsProfile;
    importSmallWinsProfile: typeof importSmallWinsProfile;
};
export default _default;
//# sourceMappingURL=small-wins.d.ts.map