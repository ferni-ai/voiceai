/**
 * Cross-Persona Memory Coherence
 *
 * > "Peter told me you two got into the weeds on index funds."
 *
 * Makes the Ferni team feel like a real team that communicates.
 * Personas share observations, pass notes, and reference each
 * other's conversations naturally.
 *
 * Key capabilities:
 * - Handoff notes between personas
 * - Shared observations
 * - Team compliments about user
 * - Context from colleagues
 *
 * @module @ferni/superhuman/team-coherence
 */
import type { TeamAwarenessResult, TeamCoherence, TeamHandoffNote } from './types.js';
export declare class TeamCoherenceEngine {
    private userId;
    private coherence;
    private lastTeamMentionTurn;
    constructor(userId: string, existing?: Partial<TeamCoherence>);
    /**
     * Record a handoff note from one persona to another
     */
    recordHandoffNote(fromPersona: string, toPersona: string, type: TeamHandoffNote['type'], content: string, topic?: string): void;
    /**
     * Record topic discussed by a persona
     */
    recordTopicDiscussion(personaId: string, topic: string): void;
    /**
     * Add a shared observation about the user
     */
    addSharedObservation(observation: string): void;
    /**
     * Record a shared preference
     */
    recordPreference(key: string, value: string): void;
    /**
     * Check if we should mention team awareness
     */
    checkForTeamAwareness(currentPersona: string, context: {
        turnCount: number;
        isSessionStart: boolean;
        currentTopic?: string;
        sessionCount: number;
    }): TeamAwarenessResult;
    /**
     * Generate a handoff summary for persona transition
     */
    generateHandoffSummary(fromPersona: string, toPersona: string, conversationContext: {
        topics: string[];
        emotionalTone: string;
        keyMoments?: string[];
    }): string;
    private getRelevantHandoffNote;
    private generateHandoffPhrase;
    private findPersonaWhoDiscussedTopic;
    private generateColleagueContextPhrase;
    private selectRandom;
    /**
     * Get coherence state
     */
    getCoherence(): TeamCoherence;
    /**
     * Export for persistence
     */
    export(): {
        handoffNotes: TeamHandoffNote[];
        sharedObservations: string[];
        sharedPreferences: [string, string][];
        personaTopicHistory: [string, string[]][];
    };
    /**
     * Import from persistence
     */
    import(data: ReturnType<TeamCoherenceEngine['export']>): void;
    /**
     * Reset
     */
    reset(): void;
}
export declare function getTeamCoherence(userId: string, existing?: Partial<TeamCoherence>): TeamCoherenceEngine;
export declare function clearTeamCoherence(userId: string): void;
export default TeamCoherenceEngine;
//# sourceMappingURL=team-coherence.d.ts.map