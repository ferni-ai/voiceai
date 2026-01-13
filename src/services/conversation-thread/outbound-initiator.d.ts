/**
 * Outbound Initiator
 *
 * Enables any agent to initiate proactive outreach while maintaining
 * conversation thread continuity. This is the "agent reaches out" side
 * of bidirectional engagement.
 *
 * @module services/conversation-thread/outbound-initiator
 */
import type { PersonaId } from '../../personas/types.js';
import type { EngagementChannel } from './types.js';
import { type OutreachType } from '../outreach/conversation-context-bridge.js';
export interface InitiateOutreachOptions {
    /** User to reach out to */
    userId: string;
    /** Which agent is initiating */
    agentId: PersonaId;
    /** Channel to use (system may override if channel not available) */
    preferredChannel: EngagementChannel;
    /** Type of outreach */
    triggerType: OutreachType;
    /** Why we're reaching out */
    reason: string;
    /** Base message content (will be styled for agent voice) */
    messageContent: string;
    /** Priority for delivery */
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    /** Schedule for later? */
    scheduledFor?: Date;
    /** ML confidence if prediction-driven */
    mlConfidence?: number;
    /** Predicted emotional state */
    predictedEmotionalState?: string;
    /** Suggested follow-up topics */
    suggestedTopics?: string[];
}
export interface OutreachResult {
    success: boolean;
    outreachId: string;
    threadId: string;
    channel: EngagementChannel;
    message: string;
    scheduledFor?: Date;
    error?: string;
}
/**
 * Initiate outreach from any agent.
 * This creates/continues a thread and queues the message for delivery.
 */
export declare function initiateOutreach(options: InitiateOutreachOptions): Promise<OutreachResult>;
/**
 * Maya initiates habit support outreach.
 */
export declare function mayaHabitOutreach(userId: string, options: {
    habitName: string;
    streakCount?: number;
    isEncouragement?: boolean;
    isReminder?: boolean;
}): Promise<OutreachResult>;
/**
 * Peter initiates research update outreach.
 */
export declare function peterResearchOutreach(userId: string, options: {
    topic: string;
    insightSummary: string;
    source?: string;
}): Promise<OutreachResult>;
/**
 * Jordan initiates milestone/celebration outreach.
 */
export declare function jordanMilestoneOutreach(userId: string, options: {
    milestoneName: string;
    daysUntil?: number;
    celebrationContext?: string;
}): Promise<OutreachResult>;
/**
 * Alex initiates communication support outreach.
 */
export declare function alexCommunicationOutreach(userId: string, options: {
    context: string;
    urgency?: 'low' | 'medium' | 'high';
    draftReady?: boolean;
}): Promise<OutreachResult>;
/**
 * Nayan initiates reflection/wisdom outreach.
 */
export declare function nayanWisdomOutreach(userId: string, options: {
    reflectionPrompt: string;
    context?: string;
}): Promise<OutreachResult>;
/**
 * Ferni initiates coordinator check-in.
 */
export declare function ferniCheckInOutreach(userId: string, options: {
    reason: string;
    emotionalState?: string;
    mlConfidence?: number;
}): Promise<OutreachResult>;
export declare const outboundInitiator: {
    initiateOutreach: typeof initiateOutreach;
    mayaHabitOutreach: typeof mayaHabitOutreach;
    peterResearchOutreach: typeof peterResearchOutreach;
    jordanMilestoneOutreach: typeof jordanMilestoneOutreach;
    alexCommunicationOutreach: typeof alexCommunicationOutreach;
    nayanWisdomOutreach: typeof nayanWisdomOutreach;
    ferniCheckInOutreach: typeof ferniCheckInOutreach;
};
//# sourceMappingURL=outbound-initiator.d.ts.map