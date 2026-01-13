/**
 * Team Chemistry Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module powers the natural, warm dynamics between Ferni team members.
 * Real teams have inside jokes, mutual admiration, playful teasing, and
 * shared history. So does the Ferni team.
 */
import type { RelationshipStage } from '../relationship-memory/index.js';
export interface TeamPairDynamic {
    relationship: 'complementary' | 'aligned' | 'energizing' | 'deep_resonance' | 'balancing' | 'efficient' | 'supportive' | 'action_partners' | 'philosophically_curious';
    dynamic: string;
    mutualRespect: string;
    playfulTension: string;
    handoffMoments: string[];
}
export interface TeamReference {
    personaId: string;
    aboutPersona: string;
    type: 'admiration' | 'playful_teasing';
    phrase: string;
}
export interface TeamStory {
    id: string;
    story: string;
    canReference: string[];
}
export interface TeamInsideJoke {
    trigger: string;
    reference: string;
    personasWhoUseIt: string[];
}
export interface HandoffContext {
    fromPersona: string;
    toPersona: string;
    emotionalContext: string;
    topicContext: string;
    trustContext: string;
}
export interface TeamChemistryConfig {
    teamReferenceFrequency: number;
    teamReferenceMinSessions: number;
    insideJokeMinRelationship: RelationshipStage;
    teamStoryMinRelationship: RelationshipStage;
    handoffContextAlways: boolean;
    complimentMaxPerSession: number;
    complimentMinSessionsBetween: number;
}
/**
 * Get team dynamics between two personas
 */
export declare function getTeamDynamics(persona1: string, persona2: string): TeamPairDynamic | undefined;
/**
 * Get a reference one persona might make about another
 */
export declare function getTeamReference(fromPersona: string, aboutPersona: string, type?: 'admiration' | 'playful_teasing'): string | undefined;
/**
 * Get all team references a persona can make
 */
export declare function getAllTeamReferences(fromPersona: string): TeamReference[];
/**
 * Check if a trigger matches a team inside joke
 */
export declare function checkTeamInsideJoke(trigger: string, fromPersona: string): {
    reference: string;
} | null;
/**
 * Get a team compliment for a user
 */
export declare function getTeamCompliment(trait?: 'persistence' | 'growth' | 'vulnerability' | 'humor'): string;
/**
 * Build handoff context for team transitions
 */
export declare function buildHandoffContext(fromPersona: string, toPersona: string, emotionalState: 'high_emotion' | 'excited' | 'struggling' | 'neutral', topic: string, trustLevel: RelationshipStage): HandoffContext;
/**
 * Generate a handoff note from one persona to another
 */
export declare function generateHandoffNote(fromPersona: string, toPersona: string, topic: string, emotionalState: 'high_emotion' | 'excited' | 'struggling' | 'neutral', trustLevel: RelationshipStage): string;
/**
 * Get the default team chemistry config
 */
export declare function getTeamChemistryConfig(): TeamChemistryConfig;
/**
 * Context for determining if a team reference is relevant
 */
export interface TeamReferenceContext {
    currentTopic?: string;
    currentMessage?: string;
    mentionedTeammate?: string;
    hasEmotionalMoment?: boolean;
    isHandoffCandidate?: boolean;
    sessionNumber: number;
    lastTeamReferenceSession: number;
}
/**
 * Check if the current context is relevant for mentioning a team member
 */
export declare function isTeamReferenceRelevant(aboutPersona: string, context: TeamReferenceContext): {
    relevant: boolean;
    reason?: string;
};
/**
 * Get the most relevant team member to reference based on context
 */
export declare function getMostRelevantTeamMember(fromPersona: string, context: TeamReferenceContext): {
    persona: string;
    reason: string;
} | null;
/**
 * Should we include a team reference in this response?
 *
 * NOW CONTEXT-AWARE! No more random probability.
 * Team references only happen when contextually relevant.
 */
export declare function shouldIncludeTeamReference(sessionNumber: number, lastTeamReferenceSession: number, config?: TeamChemistryConfig, context?: TeamReferenceContext): boolean;
/**
 * Get a contextually appropriate team reference
 *
 * Returns the reference phrase and which team member, or null if not appropriate.
 */
export declare function getContextualTeamReference(fromPersona: string, context: TeamReferenceContext, config?: TeamChemistryConfig): {
    phrase: string;
    aboutPersona: string;
    reason: string;
} | null;
declare const _default: {
    getTeamDynamics: typeof getTeamDynamics;
    getTeamReference: typeof getTeamReference;
    getAllTeamReferences: typeof getAllTeamReferences;
    checkTeamInsideJoke: typeof checkTeamInsideJoke;
    getTeamCompliment: typeof getTeamCompliment;
    buildHandoffContext: typeof buildHandoffContext;
    generateHandoffNote: typeof generateHandoffNote;
    getTeamChemistryConfig: typeof getTeamChemistryConfig;
    shouldIncludeTeamReference: typeof shouldIncludeTeamReference;
    isTeamReferenceRelevant: typeof isTeamReferenceRelevant;
    getMostRelevantTeamMember: typeof getMostRelevantTeamMember;
    getContextualTeamReference: typeof getContextualTeamReference;
};
export default _default;
//# sourceMappingURL=team-chemistry.d.ts.map