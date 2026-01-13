/**
 * Proactive Outreach Integration
 *
 * Connects the "thinking of you" system to the actual outreach execution.
 * This makes proactive check-ins actually happen.
 *
 * Philosophy: The best check-ins feel like they came from a friend who
 * genuinely was thinking about you - not a scheduled notification.
 *
 * @module OutreachIntegration
 */
import { type ThinkingOfYouMoment } from './thinking-of-you.js';
import { type CelebrationOpportunity } from './small-wins.js';
import { type GrowthReflection } from './growth-reflection.js';
export interface OutreachItem {
    id: string;
    userId: string;
    type: 'thinking_of_you' | 'celebration' | 'growth_reflection' | 'habit_check' | 'appointment_reminder';
    priority: 'high' | 'medium' | 'low';
    message: string;
    ssml: string;
    scheduledFor: Date;
    /** Which persona should deliver this outreach (default: auto-routed based on type) */
    personaId?: string;
    metadata: Record<string, unknown>;
}
export interface OutreachResult {
    success: boolean;
    itemId: string;
    method: 'voice' | 'sms' | 'push';
    sentAt?: Date;
    error?: string;
}
export interface OutreachPreferences {
    enabled: boolean;
    maxPerDay: number;
    maxPerWeek: number;
    preferredMethod: 'voice' | 'sms' | 'push' | 'any';
    quietHoursStart: string;
    quietHoursEnd: string;
    quietDays: string[];
}
/**
 * Queue a "thinking of you" moment for delivery
 */
export declare function queueThinkingOfYou(userId: string, moment: ThinkingOfYouMoment): OutreachItem;
/**
 * Queue a celebration for delivery
 */
export declare function queueCelebration(userId: string, celebration: CelebrationOpportunity): OutreachItem;
/**
 * Queue a growth reflection for delivery
 */
export declare function queueGrowthReflection(userId: string, reflection: GrowthReflection): OutreachItem;
/**
 * Get items ready for delivery
 */
export declare function getDueItems(userId: string): OutreachItem[];
/**
 * Check if we can send outreach right now
 */
export declare function canSendOutreach(userId: string): {
    allowed: boolean;
    reason?: string;
};
/**
 * Execute outreach delivery
 */
export declare function executeOutreach(item: OutreachItem, method?: 'voice' | 'sms' | 'push'): Promise<OutreachResult>;
/**
 * Generate all outreach opportunities for a user
 */
export declare function generateOutreachOpportunities(userId: string): {
    thinkingOfYou: ThinkingOfYouMoment[];
    celebrations: CelebrationOpportunity[];
    growthReflections: GrowthReflection[];
};
/**
 * Process all due outreach for a user
 */
export declare function processUserOutreach(userId: string): Promise<{
    sent: number;
    skipped: number;
    failed: number;
}>;
/**
 * Update user outreach preferences
 */
export declare function setUserPreferences(userId: string, prefs: Partial<OutreachPreferences>): void;
/**
 * Get user outreach preferences
 */
export declare function getUserPreferences(userId: string): OutreachPreferences;
/**
 * Disable outreach for a user
 */
export declare function disableOutreach(userId: string): void;
/**
 * Enable outreach for a user
 */
export declare function enableOutreach(userId: string): void;
declare const _default: {
    queueThinkingOfYou: typeof queueThinkingOfYou;
    queueCelebration: typeof queueCelebration;
    queueGrowthReflection: typeof queueGrowthReflection;
    getDueItems: typeof getDueItems;
    canSendOutreach: typeof canSendOutreach;
    executeOutreach: typeof executeOutreach;
    generateOutreachOpportunities: typeof generateOutreachOpportunities;
    processUserOutreach: typeof processUserOutreach;
    setUserPreferences: typeof setUserPreferences;
    getUserPreferences: typeof getUserPreferences;
    disableOutreach: typeof disableOutreach;
    enableOutreach: typeof enableOutreach;
};
export default _default;
//# sourceMappingURL=outreach-integration.d.ts.map