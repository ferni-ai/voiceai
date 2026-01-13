/**
 * Action Planning Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Converts conversations into actionable next steps.
 * After discussing a problem, creates tiny first steps that feel achievable.
 *
 * Philosophy:
 * - Small steps beat big plans
 * - Action cures anxiety
 * - Follow-up shows we care
 *
 * @module ActionPlanning
 */
export type ActionStatus = 'pending' | 'completed' | 'skipped' | 'deferred';
export type ActionPriority = 'high' | 'medium' | 'low';
export interface ActionItem {
    id: string;
    userId: string;
    action: string;
    context: string;
    goalId?: string;
    domain?: string;
    dueDate?: Date;
    suggestedTime?: string;
    status: ActionStatus;
    completedAt?: Date;
    skippedReason?: string;
    followUpScheduled?: Date;
    followUpSent: boolean;
    createdAt: Date;
    createdInConversation?: string;
}
export interface ActionProfile {
    userId: string;
    actions: ActionItem[];
    stats: {
        totalCreated: number;
        completed: number;
        skipped: number;
        completionRate: number;
    };
    preferences: {
        reminderTiming: 'morning' | 'evening' | 'custom';
        customReminderTime?: string;
        preferredActionSize: 'tiny' | 'small' | 'medium';
    };
}
export interface ActionSuggestion {
    action: string;
    timeEstimate: string;
    difficulty: 'easy' | 'medium' | 'hard';
    reason: string;
}
/**
 * Detect if this is a good moment to offer action planning
 */
export declare function detectActionOpportunity(userMessage: string, context?: {
    recentTopics?: string[];
    emotionalState?: string;
    conversationLength?: number;
}): {
    isOpportunity: boolean;
    reason?: string;
    extractedTopic?: string;
};
/**
 * Generate tiny first steps for a given topic/goal
 */
export declare function generateActionSuggestions(topic: string, context?: {
    userPreferences?: ActionProfile['preferences'];
    relatedGoal?: string;
}): ActionSuggestion[];
/**
 * Create a new action item
 */
export declare function createAction(userId: string, actionData: {
    action: string;
    context: string;
    goalId?: string;
    domain?: string;
    dueDate?: Date;
    suggestedTime?: string;
}): ActionItem;
/**
 * Complete an action
 */
export declare function completeAction(userId: string, actionId: string): boolean;
/**
 * Skip an action
 */
export declare function skipAction(userId: string, actionId: string, reason?: string): boolean;
/**
 * Defer an action to a new date
 */
export declare function deferAction(userId: string, actionId: string, newDate: Date): boolean;
/**
 * Get pending actions for a user
 */
export declare function getPendingActions(userId: string): ActionItem[];
/**
 * Get actions needing follow-up
 */
export declare function getActionsNeedingFollowUp(userId: string): ActionItem[];
/**
 * Get action stats
 */
export declare function getActionStats(userId: string): ActionProfile['stats'] | null;
/**
 * Generate a follow-up question for an action
 */
export declare function generateActionFollowUp(action: ActionItem): {
    question: string;
    ssml: string;
    tone: 'curious' | 'supportive' | 'celebratory';
};
/**
 * Get the highest priority action to follow up on
 */
export declare function getActionToFollowUp(userId: string): {
    action: ActionItem;
    followUp: ReturnType<typeof generateActionFollowUp>;
} | null;
/**
 * Build LLM context for actions
 */
export declare function buildActionContext(userId: string): string | null;
export declare function exportActionProfile(userId: string): ActionProfile | null;
export declare function importActionProfile(profile: ActionProfile): void;
declare const _default: {
    detectActionOpportunity: typeof detectActionOpportunity;
    generateActionSuggestions: typeof generateActionSuggestions;
    createAction: typeof createAction;
    completeAction: typeof completeAction;
    skipAction: typeof skipAction;
    deferAction: typeof deferAction;
    getPendingActions: typeof getPendingActions;
    getActionsNeedingFollowUp: typeof getActionsNeedingFollowUp;
    getActionStats: typeof getActionStats;
    generateActionFollowUp: typeof generateActionFollowUp;
    getActionToFollowUp: typeof getActionToFollowUp;
    buildActionContext: typeof buildActionContext;
    exportActionProfile: typeof exportActionProfile;
    importActionProfile: typeof importActionProfile;
};
export default _default;
//# sourceMappingURL=action-planning.d.ts.map