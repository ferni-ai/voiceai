/**
 * Team Dynamics - How Personas Work Together
 *
 * Cross-persona references, handoff context, and team personality.
 * This makes the team feel like real colleagues who know and
 * respect each other, not isolated AI modules.
 */
/**
 * What each persona says about their teammates
 * These add warmth and make them feel like a real team
 */
export declare const TEAM_OPINIONS: {
    'jack-b': {
        'peter-john': string[];
        'nayan-patel': string[];
        'comm-specialist': string[];
        'spend-save': string[];
        'event-planner': string[];
    };
    'peter-john': {
        'jack-b': string[];
        'nayan-patel': string[];
        'spend-save': string[];
        'event-planner': string[];
        'comm-specialist': string[];
    };
    'comm-specialist': {
        'jack-b': string[];
        'peter-john': string[];
        'spend-save': string[];
        'event-planner': string[];
    };
    'spend-save': {
        'jack-b': string[];
        'peter-john': string[];
        'comm-specialist': string[];
        'event-planner': string[];
    };
    'event-planner': {
        'jack-b': string[];
        'peter-john': string[];
        'comm-specialist': string[];
        'spend-save': string[];
    };
};
export declare const HANDOFF_WARMTH: {
    toTeammate: {
        'peter-john': string[];
        'nayan-patel': string[];
        'comm-specialist': string[];
        'spend-save': string[];
        'event-planner': string[];
        'jack-b': string[];
    };
    fromTeammate: {
        'peter-john': string[];
        'nayan-patel': string[];
        'comm-specialist': string[];
        'spend-save': string[];
        'event-planner': string[];
        'jack-b': string[];
    };
};
export interface HandoffContext {
    fromPersona: string;
    toPersona: string;
    topicsDiscussed: string[];
    currentGoal?: string;
    emotionalState?: string;
    keyPointsToKnow: string[];
    userPreferences?: {
        communicationStyle?: string;
        pace?: string;
        humorAppreciation?: string;
    };
}
/**
 * Generate a context summary for handoff
 */
export declare function generateHandoffSummary(context: HandoffContext): string;
export declare const TEAM_MENTIONS: {
    suggest: {
        'peter-john': string[];
        'nayan-patel': string[];
        'comm-specialist': string[];
        'spend-save': string[];
        'event-planner': string[];
    };
    casual: {
        'peter-john': string[];
        'nayan-patel': string[];
        'comm-specialist': string[];
        'spend-save': string[];
        'event-planner': string[];
    };
};
/**
 * Get what one persona says about another
 */
export declare function getOpinionAbout(fromPersona: string, aboutPersona: string): string | null;
/**
 * Get handoff warmth phrase
 */
export declare function getHandoffWarmth(direction: 'to' | 'from', persona: string): string | null;
/**
 * Get suggestion phrase for bringing in a teammate
 */
export declare function getTeamSuggestion(persona: string): string | null;
/**
 * Get casual mention of a teammate
 */
export declare function getCasualMention(persona: string): string | null;
//# sourceMappingURL=team-dynamics.d.ts.map