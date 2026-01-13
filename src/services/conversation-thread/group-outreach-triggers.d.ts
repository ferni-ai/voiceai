/**
 * Group Outreach Triggers
 *
 * This module wires group outreach capabilities into the superhuman services
 * and decision engine. It determines when multiple personas should reach out
 * together instead of a single persona.
 *
 * @example
 * // From a superhuman service detecting a major milestone:
 * import { shouldTriggerGroupOutreach, triggerGroupOutreach } from './group-outreach-triggers.js';
 *
 * if (shouldTriggerGroupOutreach(userId, 'celebration', achievement)) {
 *   await triggerGroupOutreach(userId, 'celebration', achievement);
 * }
 */
import type { PersonaId } from '../../personas/types.js';
import type { OutreachTriggerType, OutreachPriority } from '../outreach/decision-engine-types.js';
import { type GroupOutreachResult } from './group-outreach.js';
/**
 * Trigger types that warrant group outreach.
 * These are situations where multiple perspectives add value.
 */
declare const GROUP_OUTREACH_TRIGGER_TYPES: Set<OutreachTriggerType>;
/**
 * Topic patterns that suggest group outreach would be valuable.
 */
declare const GROUP_TOPICS: Array<{
    pattern: RegExp;
    personas: PersonaId[];
    reason: string;
}>;
export interface GroupOutreachDecision {
    shouldUseGroup: boolean;
    personas: PersonaId[];
    reason: string;
    outreachType: 'text' | 'call' | 'roundtable';
}
/**
 * Determine if a trigger should use group outreach.
 *
 * @param userId - The user ID
 * @param triggerType - The type of outreach trigger
 * @param context - Additional context (topic, achievement, etc.)
 * @returns Decision about whether to use group outreach
 */
export declare function shouldTriggerGroupOutreach(userId: string, triggerType: OutreachTriggerType, context: {
    topic?: string;
    achievement?: string;
    priority?: OutreachPriority;
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
}): GroupOutreachDecision;
/**
 * Execute group outreach based on the trigger type and context.
 *
 * @param userId - The user ID
 * @param triggerType - The type of outreach trigger
 * @param context - Additional context
 * @returns Result of the outreach attempt
 */
export declare function triggerGroupOutreach(userId: string, triggerType: OutreachTriggerType, context: {
    topic?: string;
    achievement?: string;
    reason?: string;
    preferredName?: string;
    scheduledFor?: Date;
    priority?: OutreachPriority;
}): Promise<GroupOutreachResult>;
/**
 * Called when commitment keeper detects a major commitment milestone.
 */
export declare function onCommitmentMilestone(userId: string, milestone: {
    commitmentText: string;
    streakDays?: number;
    completionRate?: number;
    preferredName?: string;
}): Promise<GroupOutreachResult | null>;
/**
 * Called when relationship network detects a reconnection opportunity.
 * This could trigger a planning outreach with Jordan + Maya.
 */
export declare function onReconnectionOpportunity(userId: string, opportunity: {
    personName: string;
    daysSinceLastMention: number;
    suggestedAction: string;
    preferredName?: string;
}): Promise<GroupOutreachResult | null>;
/**
 * Called when predictive coaching detects a pattern worth discussing.
 */
export declare function onPredictivePattern(userId: string, pattern: {
    patternDescription: string;
    prediction: string;
    confidence: number;
    preferredName?: string;
}): Promise<GroupOutreachResult | null>;
/**
 * Called when emotional trajectory shows significant distress.
 */
export declare function onEmotionalDistress(userId: string, signal: {
    emotion: string;
    intensity: number;
    duration: string;
    preferredName?: string;
}): Promise<GroupOutreachResult | null>;
export { GROUP_OUTREACH_TRIGGER_TYPES, GROUP_TOPICS };
//# sourceMappingURL=group-outreach-triggers.d.ts.map