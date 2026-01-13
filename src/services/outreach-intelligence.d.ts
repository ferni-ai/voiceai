/**
 * Outreach Intelligence Service
 *
 * Predicts when and why agents should proactively reach out to users.
 *
 * TRIGGERS:
 * 1. Commitments - "I'll work out tomorrow" → check-in next evening
 * 2. Goals - Progress milestones, streaks at risk, celebrations
 * 3. Patterns - User hasn't engaged in X days (re-engagement)
 * 4. Life Events - Upcoming appointments, deadlines, birthdays
 * 5. Emotional - Detected stress/struggle → supportive check-in
 * 6. Follow-ups - Explicit "remind me about X" or implicit needs
 *
 * LEARNS:
 * - Best times to reach user (response patterns)
 * - Preferred contact method (SMS vs email vs call)
 * - Engagement patterns (daily, weekly, sporadic)
 * - Topics that resonate (what they respond to)
 *
 * PERSISTENCE: All outreach data persists to Firestore via the unified
 * persistence layer to survive server restarts.
 */
export type OutreachTrigger = 'commitment_check' | 'goal_milestone' | 'streak_at_risk' | 'celebration' | 'reengagement' | 'life_event' | 'emotional_support' | 'follow_up' | 'accountability' | 'insight' | 'scheduled';
export type OutreachPriority = 'low' | 'medium' | 'high' | 'urgent';
export interface OutreachOpportunity {
    id: string;
    userId: string;
    trigger: OutreachTrigger;
    priority: OutreachPriority;
    suggestedTime: Date;
    message: string;
    context: string;
    method: 'sms' | 'email' | 'call';
    agentId: string;
    expiresAt?: Date;
    metadata?: Record<string, unknown>;
}
export interface UserOutreachPreferences {
    enabled: boolean;
    preferredMethod: 'sms' | 'email' | 'call';
    preferredTimes: {
        morning: boolean;
        afternoon: boolean;
        evening: boolean;
        night: boolean;
    };
    timezone: string;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    maxPerDay: number;
    maxPerWeek: number;
    enabledTriggers: OutreachTrigger[];
}
export interface Commitment {
    id: string;
    userId: string;
    what: string;
    when: Date;
    checkInTime: Date;
    status: 'pending' | 'completed' | 'missed' | 'rescheduled';
    context?: string;
    extractedFrom?: string;
}
export interface EngagementPattern {
    userId: string;
    lastInteraction: Date;
    averageGapDays: number;
    preferredDayOfWeek: number[];
    preferredHourOfDay: number[];
    responseRateByMethod: {
        sms: number;
        email: number;
        call: number;
    };
    topicsEngaged: string[];
}
/**
 * Initialize persistence for outreach intelligence
 */
export declare function initializeOutreachPersistence(): Promise<void>;
/**
 * Shutdown outreach persistence (flush all pending data)
 */
export declare function shutdownOutreachPersistence(): Promise<void>;
/**
 * Clear all outreach data for a specific user.
 * Call this when a user session ends or user is deleted.
 */
export declare function clearUserOutreachData(userId: string): Promise<void>;
/**
 * Clear all outreach data for all users.
 * Useful for testing or system reset.
 */
export declare function clearAllOutreachData(): void;
/**
 * Prune expired/stale data to prevent memory growth.
 * Call this periodically (e.g., daily) to clean up old data.
 *
 * @param maxAgeDays - Maximum age for data to retain (default: 30 days)
 * @returns Number of items pruned
 */
export declare function pruneStaleOutreachData(maxAgeDays?: number): number;
/**
 * Get current memory usage stats for monitoring.
 */
export declare function getOutreachMemoryStats(): {
    commitments: number;
    opportunities: number;
    preferences: number;
    engagement: number;
    sentLogs: number;
    totalUsers: number;
};
/**
 * Extract commitments from conversation text
 * Uses pattern matching to find things like:
 * - "I'll do X tomorrow"
 * - "I'm going to X this week"
 * - "I promise to X"
 * - "I need to X by Friday"
 */
export declare function extractCommitments(userId: string, conversationText: string, conversationTime?: Date): Commitment[];
/**
 * Analyze user state and generate outreach opportunities
 */
export declare function detectOutreachOpportunities(userId: string, agentId?: string): Promise<OutreachOpportunity[]>;
/**
 * Detect emotional state from conversation and potentially trigger support
 */
export declare function detectEmotionalTriggers(userId: string, conversationText: string, agentId?: string): OutreachOpportunity | null;
/**
 * Get user's outreach preferences
 */
export declare function getPreferences(userId: string): UserOutreachPreferences;
/**
 * Update user's outreach preferences
 */
export declare function setPreferences(userId: string, prefs: Partial<UserOutreachPreferences>): void;
/**
 * Check if we can send another outreach to this user
 */
export declare function canSendOutreach(userId: string): boolean;
/**
 * Record user interaction to learn patterns
 */
export declare function recordInteraction(userId: string, interactionTime?: Date, respondedToOutreach?: boolean, method?: 'sms' | 'email' | 'call'): void;
/**
 * Execute an outreach opportunity
 */
export declare function executeOutreach(opportunity: OutreachOpportunity): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Analyze a conversation and schedule any appropriate outreach
 * Call this after each conversation ends
 */
export declare function analyzeConversationForOutreach(userId: string, conversationText: string, agentId?: string): Promise<{
    commitments: Commitment[];
    opportunities: OutreachOpportunity[];
    scheduled: number;
}>;
declare const _default: {
    initializeOutreachPersistence: typeof initializeOutreachPersistence;
    shutdownOutreachPersistence: typeof shutdownOutreachPersistence;
    extractCommitments: typeof extractCommitments;
    detectOutreachOpportunities: typeof detectOutreachOpportunities;
    detectEmotionalTriggers: typeof detectEmotionalTriggers;
    getPreferences: typeof getPreferences;
    setPreferences: typeof setPreferences;
    recordInteraction: typeof recordInteraction;
    canSendOutreach: typeof canSendOutreach;
    executeOutreach: typeof executeOutreach;
    analyzeConversationForOutreach: typeof analyzeConversationForOutreach;
    clearUserOutreachData: typeof clearUserOutreachData;
    clearAllOutreachData: typeof clearAllOutreachData;
    pruneStaleOutreachData: typeof pruneStaleOutreachData;
    getOutreachMemoryStats: typeof getOutreachMemoryStats;
};
export default _default;
//# sourceMappingURL=outreach-intelligence.d.ts.map