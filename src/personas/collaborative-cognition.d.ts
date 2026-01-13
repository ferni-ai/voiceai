/**
 * Collaborative Cognition
 *
 * Models how different cognitive styles see the same situation differently.
 * Creates richer team dynamics where each persona brings a unique perspective.
 */
import type { ReasoningStyle } from './cognitive-types.js';
export interface CognitivePerspective {
    personaId: string;
    personaName: string;
    reasoningStyle: ReasoningStyle;
    /** What this persona would notice */
    notices: string[];
    /** What this persona might miss */
    misses: string[];
    /** Their initial take on the situation */
    initialTake: string;
    /** Questions they would ask */
    questions: string[];
    /** What they would suggest */
    suggestion?: string;
}
export interface CollaborativeCognition {
    /** The situation being analyzed */
    situation: string;
    /** Each persona's perspective */
    perspectives: Map<string, CognitivePerspective>;
    /** Insights from combining perspectives */
    synthesis: string[];
    /** What the team collectively sees that individuals might miss */
    emergentInsights: string[];
    /** Recommended handoff based on cognitive fit */
    cognitiveHandoffRecommendation?: {
        toPersona: string;
        reason: string;
    };
}
/**
 * Generate a persona's perspective on a situation
 */
export declare function generatePerspective(personaId: string, situation: string, topic: string, details?: Record<string, string>): CognitivePerspective | null;
/**
 * Generate perspectives from multiple personas on a situation
 *
 * @param situation - The situation being analyzed
 * @param topic - The topic under discussion
 * @param personaIds - Optional list of persona IDs to include. Defaults to just Ferni
 *                     to avoid mentioning locked team members. Callers should pass
 *                     only unlocked member IDs.
 */
export declare function generateCollaborativePerspectives(situation: string, topic: string, personaIds?: string[]): CollaborativeCognition;
/**
 * Generate natural language commentary about what team members might say
 *
 * @param personaId - The current persona generating commentary
 * @param topic - The topic being discussed
 * @param context - The context type (handoff, reflection, collaboration)
 * @param unlockedMemberIds - Optional list of unlocked member IDs. If provided,
 *                            commentary will only reference these members.
 */
export declare function generateTeamCommentary(personaId: string, topic: string, context: 'handoff' | 'reflection' | 'collaboration', unlockedMemberIds?: string[]): string[];
declare const _default: {
    generatePerspective: typeof generatePerspective;
    generateCollaborativePerspectives: typeof generateCollaborativePerspectives;
    generateTeamCommentary: typeof generateTeamCommentary;
};
export default _default;
//# sourceMappingURL=collaborative-cognition.d.ts.map