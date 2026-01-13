/**
 * Relationship Milestone Tracker - Better Than Human Service
 *
 * What no human friend can do: Never forget how far you've come together.
 *
 * Tracks the relationship between Ferni and the user, celebrating
 * milestones and reflecting on the journey they've built together.
 *
 * @module services/superhuman/relationship-milestones
 */
export type MilestoneType = 'duration' | 'conversations' | 'trust' | 'breakthrough' | 'growth' | 'support' | 'celebration';
export interface RelationshipMilestone {
    id: string;
    userId: string;
    type: MilestoneType;
    title: string;
    description: string;
    achievedAt: number;
    acknowledged: boolean;
    context?: string;
    userSentiment?: string;
}
export interface RelationshipSummary {
    userId: string;
    firstConversation: number;
    totalDays: number;
    totalConversations: number;
    lastConversation: number;
    averageConversationsPerWeek: number;
    trustLevel: 'new' | 'building' | 'established' | 'deep' | 'profound';
    vulnerableMomentsShared: number;
    breakthroughsWitnessed: number;
    milestonesReached: RelationshipMilestone[];
    nextMilestone?: {
        type: string;
        description: string;
        progressPercent: number;
    };
}
export declare function checkAndRecordMilestones(userId: string, stats: {
    totalConversations: number;
    firstConversation: number;
    vulnerableMoments?: number;
    breakthroughs?: number;
}): Promise<RelationshipMilestone[]>;
export declare function recordSpecialMilestone(userId: string, milestone: {
    type: MilestoneType;
    title: string;
    description: string;
    context?: string;
}): Promise<RelationshipMilestone>;
export declare function acknowledgeMilestone(userId: string, milestoneId: string): Promise<void>;
export declare function buildRelationshipSummary(userId: string, stats: {
    totalConversations: number;
    firstConversation: number;
    lastConversation: number;
    vulnerableMoments?: number;
    breakthroughs?: number;
}): Promise<RelationshipSummary>;
export declare function buildMilestoneContext(userId: string, stats: {
    totalConversations: number;
    firstConversation: number;
    lastConversation: number;
    vulnerableMoments?: number;
    breakthroughs?: number;
}): Promise<string>;
export declare const relationshipMilestones: {
    checkAndRecord: typeof checkAndRecordMilestones;
    recordSpecial: typeof recordSpecialMilestone;
    acknowledge: typeof acknowledgeMilestone;
    buildSummary: typeof buildRelationshipSummary;
    buildContext: typeof buildMilestoneContext;
};
//# sourceMappingURL=relationship-milestones.d.ts.map