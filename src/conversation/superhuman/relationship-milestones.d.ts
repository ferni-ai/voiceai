/**
 * Relationship Milestones System
 *
 * "It's been 3 months since we started talking..." - Celebrating the journey.
 *
 * Tracks meaningful milestones in the user's relationship with Ferni,
 * creating moments of reflection and celebration.
 *
 * @module conversation/superhuman/relationship-milestones
 */
export interface RelationshipMilestone {
    type: MilestoneType;
    value: number;
    label: string;
    celebration: string;
    reflection?: string;
}
export type MilestoneType = 'first_conversation' | 'conversation_count' | 'days_together' | 'weeks_together' | 'months_together' | 'hours_talked' | 'topics_explored' | 'goals_achieved' | 'breakthroughs' | 'laughs_shared';
export interface UserRelationshipStats {
    userId: string;
    firstConversation: Date;
    conversationCount: number;
    totalMinutesTalked: number;
    topicsDiscussed: string[];
    goalsAchieved: number;
    breakthroughs: number;
    laughMoments: number;
    lastMilestoneChecked?: Date;
    milestonesAcknowledged: string[];
}
/**
 * Get or create user stats
 */
export declare function getStats(userId: string): UserRelationshipStats;
/**
 * Record a conversation
 */
export declare function recordConversation(userId: string, durationMinutes: number, topics?: string[]): void;
/**
 * Record a goal achievement
 */
export declare function recordGoalAchieved(userId: string): void;
/**
 * Record a breakthrough moment
 */
export declare function recordBreakthrough(userId: string): void;
/**
 * Record a laugh moment
 */
export declare function recordLaugh(userId: string): void;
/**
 * Check for any new milestones
 */
export declare function checkMilestones(userId: string): RelationshipMilestone[];
/**
 * Mark a milestone as acknowledged
 */
export declare function acknowledgeMilestone(userId: string, type: MilestoneType, value: number): void;
/**
 * Format milestone for prompt
 */
export declare function formatMilestoneForPrompt(milestone: RelationshipMilestone): string;
declare const _default: {
    getStats: typeof getStats;
    recordConversation: typeof recordConversation;
    recordGoalAchieved: typeof recordGoalAchieved;
    recordBreakthrough: typeof recordBreakthrough;
    recordLaugh: typeof recordLaugh;
    checkMilestones: typeof checkMilestones;
    acknowledgeMilestone: typeof acknowledgeMilestone;
    formatMilestoneForPrompt: typeof formatMilestoneForPrompt;
};
export default _default;
//# sourceMappingURL=relationship-milestones.d.ts.map