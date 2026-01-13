/**
 * Superhuman Intelligence → Proactive Outreach Integration
 *
 * Connects the superhuman intelligence system to proactive outreach,
 * enabling "Better Than Human" follow-ups like:
 * - "How did that interview go?"
 * - "It's been a week since you mentioned wanting to start exercising"
 * - "I've noticed Mondays are hard for you - just checking in"
 *
 * @module @ferni/superhuman-outreach-integration
 */
import { type OutreachTrigger } from './decision-engine.js';
export interface SuperhumanOutreachTrigger {
    type: 'memory_followup' | 'pattern_acknowledgment' | 'concern_checkin' | 'milestone';
    userId: string;
    content: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    suggestedMessage?: string;
    reason: string;
    source: 'proactive_memory' | 'concern_detection' | 'pattern_detection';
}
/**
 * Check if a user has pending memory-based outreach opportunities
 */
export declare function checkForMemoryBasedOutreach(userId: string, sessionId: string): Promise<SuperhumanOutreachTrigger[]>;
/**
 * Convert superhuman trigger to outreach system trigger
 * Returns partial trigger - id and createdAt are added by the decision engine
 */
export declare function convertToOutreachTrigger(trigger: SuperhumanOutreachTrigger): Omit<OutreachTrigger, 'id' | 'createdAt'>;
/**
 * Sync superhuman memories to outreach context
 */
export declare function syncMemoriesToOutreachContext(userId: string, sessionId: string): Promise<void>;
/**
 * Process superhuman concern for potential outreach
 */
export declare function processConcernForOutreach(userId: string, concernLevel: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis', concernType: string): Promise<SuperhumanOutreachTrigger | null>;
/**
 * Schedule outreach based on superhuman insights
 */
export declare function scheduleSuperhunmanOutreach(triggers: SuperhumanOutreachTrigger[]): Promise<void>;
export declare const superhumanOutreach: {
    checkForMemoryBasedOutreach: typeof checkForMemoryBasedOutreach;
    convertToOutreachTrigger: typeof convertToOutreachTrigger;
    syncMemoriesToOutreachContext: typeof syncMemoriesToOutreachContext;
    processConcernForOutreach: typeof processConcernForOutreach;
    scheduleSuperhunmanOutreach: typeof scheduleSuperhunmanOutreach;
};
//# sourceMappingURL=superhuman-outreach-integration.d.ts.map