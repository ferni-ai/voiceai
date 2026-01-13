/**
 * Handoff Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Intelligent detection of when to suggest another team member.
 * "I have a friend who's incredible at this..."
 *
 * Philosophy:
 * - Handoffs should feel like introductions, not referrals
 * - Every team member has unique strengths
 * - The user should never feel "passed off"
 *
 * @module HandoffIntelligence
 */
export type PersonaId = 'ferni' | 'maya-santos' | 'alex-chen' | 'peter-john' | 'jordan-taylor' | 'nayan-patel';
export interface HandoffCandidate {
    personaId: PersonaId;
    reason: string;
    confidence: number;
    warmIntro: string;
    specialization: string[];
}
export interface HandoffDecision {
    shouldHandoff: boolean;
    candidate: HandoffCandidate | null;
    currentPersona: PersonaId;
    userConsent: 'not_asked' | 'asked' | 'accepted' | 'declined';
}
export interface TeamMemberProfile {
    id: PersonaId;
    name: string;
    specializations: string[];
    keywords: string[];
    warmIntros: string[];
    description: string;
}
export interface UserTeamExperience {
    userId: string;
    metPersonas: PersonaId[];
    preferredPersonas: PersonaId[];
    handoffHistory: Array<{
        from: PersonaId;
        to: PersonaId;
        date: Date;
        topic: string;
        successful: boolean;
    }>;
}
export declare const TEAM_PROFILES: Record<PersonaId, TeamMemberProfile>;
export declare function getOrCreateExperience(userId: string): UserTeamExperience;
/**
 * Analyze message for potential handoff opportunity
 */
export declare function detectHandoffOpportunity(userId: string, userMessage: string, currentPersona?: PersonaId): HandoffDecision;
/**
 * Get the best team member for a topic
 */
export declare function getBestPersonaForTopic(topic: string): PersonaId;
/**
 * Record a handoff
 */
export declare function recordHandoff(userId: string, from: PersonaId, to: PersonaId, topic: string, successful: boolean): void;
/**
 * Get team members user hasn't met yet
 */
export declare function getUnmetTeamMembers(userId: string): PersonaId[];
/**
 * Generate a natural introduction to a team member
 */
export declare function generateTeamIntroduction(personaId: PersonaId, context?: string): {
    intro: string;
    ssml: string;
};
/**
 * Build LLM context for team coordination
 */
export declare function buildHandoffContext(userId: string, currentPersona: PersonaId): string | null;
export declare function exportTeamExperience(userId: string): UserTeamExperience | null;
export declare function importTeamExperience(experience: UserTeamExperience): void;
declare const _default: {
    detectHandoffOpportunity: typeof detectHandoffOpportunity;
    getBestPersonaForTopic: typeof getBestPersonaForTopic;
    recordHandoff: typeof recordHandoff;
    getUnmetTeamMembers: typeof getUnmetTeamMembers;
    generateTeamIntroduction: typeof generateTeamIntroduction;
    buildHandoffContext: typeof buildHandoffContext;
    exportTeamExperience: typeof exportTeamExperience;
    importTeamExperience: typeof importTeamExperience;
};
export default _default;
//# sourceMappingURL=handoff-intelligence.d.ts.map