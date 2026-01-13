/**
 * Group Outreach
 *
 * Enables team roundtables (multiple personas) to proactively reach out
 * to users together. This is the "team reaches out" side of bidirectional
 * engagement.
 *
 * Use cases:
 * - "Maya and Jordan have some ideas for your trip..."
 * - "The team has been thinking about your goals..."
 * - Conference call with multiple personas
 *
 * @module services/conversation-thread/group-outreach
 */
import type { PersonaId } from '../../personas/types.js';
import type { EngagementChannel } from './types.js';
import { type OutreachType } from '../outreach/conversation-context-bridge.js';
export interface GroupOutreachOptions {
    /** User to reach out to */
    userId: string;
    /** Personas initiating together */
    personas: PersonaId[];
    /** Who leads the outreach (speaks first/most) */
    leadPersona: PersonaId;
    /** Channel to use */
    preferredChannel: EngagementChannel;
    /** Type of outreach */
    triggerType: OutreachType;
    /** Why the team is reaching out */
    reason: string;
    /** Topic of discussion */
    topic: string;
    /** Priority for delivery */
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    /** Schedule for later? */
    scheduledFor?: Date;
    /** Collaboration mode for the roundtable */
    collaborationMode?: 'discussion' | 'brainstorm' | 'support';
    /** Additional context for personalization */
    context?: {
        userName?: string;
        preferredName?: string;
        relationshipStage?: 'new' | 'building' | 'established' | 'deep';
        recentTopics?: string[];
        currentStruggles?: string[];
        recentWins?: string[];
    };
}
export interface GroupOutreachResult {
    success: boolean;
    outreachId: string;
    threadId: string;
    channel: EngagementChannel;
    message: string;
    personas: PersonaId[];
    scheduledFor?: Date;
    roundtableConfig?: RoundtableSetupConfig;
    error?: string;
}
export interface RoundtableSetupConfig {
    /** Room name for LiveKit */
    roomName: string;
    /** Personas to join */
    personas: PersonaId[];
    /** Topic of discussion */
    topic: string;
    /** Who moderates */
    moderator: PersonaId;
    /** Collaboration style */
    collaborationMode: 'discussion' | 'brainstorm' | 'support';
    /** Context for the roundtable */
    context: {
        triggerType: string;
        reason: string;
        outreachId: string;
    };
}
/**
 * Generate introduction messages for a group voice call.
 * Each persona introduces themselves briefly.
 */
export declare function generateGroupCallIntroductions(personas: PersonaId[], topic: string, leadPersona: PersonaId): Map<PersonaId, string>;
/**
 * Initiate outreach from a team of personas.
 */
export declare function initiateGroupOutreach(options: GroupOutreachOptions): Promise<GroupOutreachResult>;
/**
 * Maya and Jordan brainstorm trip/event planning together.
 */
export declare function mayaJordanPlanningOutreach(userId: string, options: {
    eventName: string;
    eventDate?: Date;
    currentStatus?: string;
    preferredName?: string;
}): Promise<GroupOutreachResult>;
/**
 * Peter and Ferni share research insights together.
 */
export declare function peterFerniInsightOutreach(userId: string, options: {
    topic: string;
    insight: string;
    preferredName?: string;
}): Promise<GroupOutreachResult>;
/**
 * Team celebration with Ferni, Maya, and Jordan.
 */
export declare function teamCelebrationOutreach(userId: string, options: {
    achievement: string;
    preferredName?: string;
    recentWins?: string[];
}): Promise<GroupOutreachResult>;
/**
 * Full team support for someone going through a tough time.
 */
export declare function fullTeamSupportOutreach(userId: string, options: {
    situation: string;
    preferredName?: string;
    currentStruggles?: string[];
}): Promise<GroupOutreachResult>;
/**
 * Initiate a team roundtable voice call.
 */
export declare function initiateTeamRoundtableCall(userId: string, options: {
    personas: PersonaId[];
    topic: string;
    reason: string;
    moderator?: PersonaId;
    collaborationMode?: 'discussion' | 'brainstorm' | 'support';
    preferredName?: string;
}): Promise<GroupOutreachResult>;
export declare const groupOutreach: {
    initiateGroupOutreach: typeof initiateGroupOutreach;
    generateGroupCallIntroductions: typeof generateGroupCallIntroductions;
    mayaJordanPlanningOutreach: typeof mayaJordanPlanningOutreach;
    peterFerniInsightOutreach: typeof peterFerniInsightOutreach;
    teamCelebrationOutreach: typeof teamCelebrationOutreach;
    fullTeamSupportOutreach: typeof fullTeamSupportOutreach;
    initiateTeamRoundtableCall: typeof initiateTeamRoundtableCall;
};
//# sourceMappingURL=group-outreach.d.ts.map