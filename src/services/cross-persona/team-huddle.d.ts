/**
 * Team Huddle Intelligence - Cross-Persona Coordination
 *
 * > "Six brilliant minds. One conversation. Coordinated care."
 *
 * This is the "Better than Human" brain that makes the team work together.
 * Human support networks don't coordinate - your therapist doesn't talk to
 * your coach who doesn't talk to your friend. Ferni's team DOES.
 *
 * The Team Huddle:
 * 1. Gathers observations from all personas
 * 2. Identifies patterns across domains
 * 3. Coordinates handoffs and referrals
 * 4. Synthesizes a unified understanding
 * 5. Triggers proactive team interventions
 *
 * Example Flow:
 * - Maya notices: "Sleep habits declining for 2 weeks"
 * - Peter notices: "Stress mentions up 40%"
 * - Jordan notices: "No exercise in calendar for 10 days"
 * - Team Huddle synthesizes: "User may be in a stress-sleep-exercise spiral"
 * - Ferni receives: "Your team has noticed something. Want to explore it together?"
 *
 * @module services/cross-persona/team-huddle
 */
export type PersonaId = 'ferni' | 'peter' | 'maya' | 'jordan' | 'alex' | 'nayan';
export interface PersonaObservation {
    personaId: PersonaId;
    observationType: 'pattern' | 'concern' | 'opportunity' | 'milestone' | 'insight';
    content: string;
    confidence: number;
    detectedAt: Date;
    domain: string;
    relatedTopics?: string[];
    suggestedAction?: string;
}
export interface CrossDomainConnection {
    /** First observation */
    observation1: PersonaObservation;
    /** Second observation */
    observation2: PersonaObservation;
    /** How they're connected */
    connectionType: 'causal' | 'correlated' | 'temporal' | 'thematic';
    /** Synthesized insight */
    synthesis: string;
    /** Combined confidence */
    confidence: number;
}
export interface TeamHuddleSummary {
    /** When this huddle was generated */
    generatedAt: Date;
    /** All active observations from the team */
    observations: PersonaObservation[];
    /** Cross-domain connections identified */
    connections: CrossDomainConnection[];
    /** Unified understanding / synthesis */
    synthesis: string;
    /** Recommended actions for Ferni */
    recommendations: TeamRecommendation[];
    /** Overall user state assessment */
    userStateAssessment: UserStateAssessment;
}
export interface TeamRecommendation {
    type: 'handoff' | 'mention' | 'coordinate' | 'proactive_outreach';
    targetPersona?: PersonaId;
    reason: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    suggestedApproach: string;
    /** If true, Ferni should mention "the team noticed something" */
    shouldMentionTeam: boolean;
}
export interface UserStateAssessment {
    /** Overall wellbeing estimate (0-1) */
    wellbeing: number;
    /** Key areas of concern */
    concerns: string[];
    /** Areas of strength/growth */
    strengths: string[];
    /** Current life chapter/theme */
    currentTheme: string;
    /** Trajectory: improving, stable, declining */
    trajectory: 'improving' | 'stable' | 'declining';
}
/**
 * Record an observation from a persona.
 * Call this whenever a persona notices something significant.
 */
export declare function recordObservation(userId: string, observation: Omit<PersonaObservation, 'detectedAt'>): void;
/**
 * Get all recent observations for a user.
 */
export declare function getObservations(userId: string): PersonaObservation[];
/**
 * Clear all observations for a user (primarily for testing).
 */
export declare function clearObservations(userId: string): void;
/**
 * Generate a Team Huddle summary for a user.
 * Call this before starting a conversation to give Ferni the full picture.
 */
export declare function generateTeamHuddle(userId: string): Promise<TeamHuddleSummary>;
/**
 * Format Team Huddle for injection into Ferni's context.
 */
export declare function formatTeamHuddleForLLM(huddle: TeamHuddleSummary): string;
export { getObservations as getTeamObservations, recordObservation as recordTeamObservation };
//# sourceMappingURL=team-huddle.d.ts.map