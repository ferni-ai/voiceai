/**
 * Channel Selector Service
 *
 * Intelligently selects the best outreach channel (call, text, email) based on:
 * 1. Content Type - What kind of message is this?
 * 2. User Preferences - How do they prefer to be contacted?
 * 3. Historical Success - What's worked before?
 * 4. Time Context - What's appropriate right now?
 * 5. Relationship Stage - How close are we?
 * 6. Urgency - How quickly do we need a response?
 *
 * Philosophy: Right channel for the right message at the right time.
 */
import type { OutreachPriority, OutreachTriggerType } from './decision-engine.js';
import type { OutreachChannel } from './persona-voice-generator.js';
export interface ChannelProfile {
    userId: string;
    preferences: {
        preferredChannel?: OutreachChannel;
        disabledChannels: OutreachChannel[];
        channelByContent: Partial<Record<ContentType, OutreachChannel>>;
    };
    learning: {
        responseRates: Record<OutreachChannel, number>;
        avgResponseTimes: Record<OutreachChannel, number>;
        satisfactionScores: Record<OutreachChannel, number>;
        totalByChannel: Record<OutreachChannel, number>;
        successfulByChannel: Record<OutreachChannel, number>;
    };
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    allowedChannels: OutreachChannel[];
    hasPhone: boolean;
    hasEmail: boolean;
}
export type ContentType = 'emotional' | 'celebration' | 'reminder' | 'information' | 'accountability' | 'casual' | 'urgent';
export interface ChannelContext {
    triggerType: OutreachTriggerType;
    priority: OutreachPriority;
    contentType: ContentType;
    messageLength?: 'short' | 'medium' | 'long';
    hasAttachment?: boolean;
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    isWorkHours: boolean;
}
export interface ChannelDecision {
    channel: OutreachChannel;
    confidence: number;
    reasoning: string;
    alternatives: Array<{
        channel: OutreachChannel;
        score: number;
        reason: string;
    }>;
}
/**
 * Get or create channel profile for a user
 */
export declare function getChannelProfile(userId: string): ChannelProfile;
/**
 * Update channel preferences
 */
export declare function updateChannelPreferences(userId: string, preferences: Partial<ChannelProfile['preferences']>): void;
/**
 * Update contact availability
 */
export declare function updateContactAvailability(userId: string, availability: {
    hasPhone?: boolean;
    hasEmail?: boolean;
}): void;
/**
 * Update relationship stage (affects allowed channels)
 */
export declare function updateRelationshipStage(userId: string, stage: ChannelProfile['relationshipStage']): void;
/**
 * Record the outcome of an outreach for learning
 */
export declare function recordOutreachOutcome(userId: string, data: {
    channel: OutreachChannel;
    gotResponse: boolean;
    responseTimeMs?: number;
    userSatisfaction?: 'positive' | 'neutral' | 'negative';
}): void;
/**
 * Select the optimal channel for an outreach
 */
export declare function selectChannel(userId: string, context: ChannelContext): ChannelDecision;
/**
 * Determine content type from trigger type
 */
export declare function getContentTypeFromTrigger(triggerType: OutreachTriggerType): ContentType;
/**
 * Determine time of day
 */
export declare function getTimeOfDay(date?: Date): ChannelContext['timeOfDay'];
/**
 * Check if work hours
 */
export declare function isWorkHours(date?: Date): boolean;
export interface ChannelSequence {
    id: string;
    name: string;
    steps: ChannelSequenceStep[];
}
export interface ChannelSequenceStep {
    channel: OutreachChannel;
    delayMs: number;
    condition?: 'noResponse' | 'voicemail' | 'always';
    messageVariant?: string;
}
/**
 * Pre-defined sequences for different scenarios
 */
export declare const CHANNEL_SEQUENCES: Record<string, ChannelSequence>;
/**
 * Get recommended sequence for a trigger type
 */
export declare function getRecommendedSequence(triggerType: OutreachTriggerType, priority: OutreachPriority): ChannelSequence | null;
export declare function clearUserChannelData(userId: string): void;
declare const _default: {
    getChannelProfile: typeof getChannelProfile;
    updateChannelPreferences: typeof updateChannelPreferences;
    updateContactAvailability: typeof updateContactAvailability;
    updateRelationshipStage: typeof updateRelationshipStage;
    recordOutreachOutcome: typeof recordOutreachOutcome;
    selectChannel: typeof selectChannel;
    getContentTypeFromTrigger: typeof getContentTypeFromTrigger;
    getTimeOfDay: typeof getTimeOfDay;
    isWorkHours: typeof isWorkHours;
    getRecommendedSequence: typeof getRecommendedSequence;
    CHANNEL_SEQUENCES: Record<string, ChannelSequence>;
    clearUserChannelData: typeof clearUserChannelData;
};
export default _default;
//# sourceMappingURL=channel-selector.d.ts.map