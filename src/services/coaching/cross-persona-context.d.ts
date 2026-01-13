/**
 * Cross-Persona Context Sharing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Shares context between team members so they know what's happening
 * with the user across their whole Ferni experience.
 *
 * Philosophy:
 * - The team should feel like a team
 * - No one should have to repeat themselves
 * - Continuity builds trust
 *
 * @module CrossPersonaContext
 */
import type { PersonaId } from './handoff-intelligence.js';
export interface SharedContext {
    topic: string;
    summary: string;
    importance: 'low' | 'medium' | 'high';
    sharedBy: PersonaId;
    sharedAt: Date;
    relevantFor: PersonaId[];
    expiresAt?: Date;
}
export interface PersonaInteraction {
    personaId: PersonaId;
    date: Date;
    topics: string[];
    emotionalState?: string;
    openItems?: string[];
    nextSteps?: string[];
}
export interface UserTeamContext {
    userId: string;
    personaInteractions: Map<PersonaId, PersonaInteraction[]>;
    sharedContexts: SharedContext[];
    crossPersonaItems: Array<{
        item: string;
        originPersona: PersonaId;
        relevantPersonas: PersonaId[];
        status: 'active' | 'resolved';
        createdAt: Date;
    }>;
    currentSituation?: {
        summary: string;
        keyTopics: string[];
        emotionalState: string;
        updatedAt: Date;
        updatedBy: PersonaId;
    };
}
/**
 * Clear ALL cached data for a specific user.
 * Called by SessionDataManager when a session ends.
 * This is CRITICAL for preventing memory leaks.
 */
export declare function clearUserContext(userId: string): void;
/**
 * Clear ALL cached data (for shutdown).
 */
export declare function clearAllContexts(): void;
/**
 * Get cache statistics for monitoring.
 */
export declare function getContextStats(): {
    users: number;
    entries: number;
};
/**
 * Register with SessionDataManager (call during initialization).
 */
export declare function registerWithSessionDataManager(): Promise<void>;
/**
 * Share context from one persona for others to see
 */
export declare function shareContext(userId: string, context: Omit<SharedContext, 'sharedAt'>): void;
/**
 * Record an interaction with a persona
 */
export declare function recordPersonaInteraction(userId: string, interaction: PersonaInteraction): void;
/**
 * Update the user's current situation (visible to all personas)
 */
export declare function updateCurrentSituation(userId: string, situation: {
    summary: string;
    keyTopics: string[];
    emotionalState: string;
}, updatedBy: PersonaId): void;
/**
 * Add a cross-persona item (something one persona started that others should know about)
 */
export declare function addCrossPersonaItem(userId: string, item: string, originPersona: PersonaId, relevantPersonas: PersonaId[]): void;
/**
 * Get relevant context for a specific persona
 */
export declare function getContextForPersona(userId: string, personaId: PersonaId): {
    recentSharedContexts: SharedContext[];
    recentTeamInteractions: Array<{
        persona: PersonaId;
        topics: string[];
        date: Date;
    }>;
    relevantItems: string[];
    currentSituation?: UserTeamContext['currentSituation'];
};
/**
 * Get a handoff summary when switching personas
 */
export declare function getHandoffSummary(userId: string, fromPersona: PersonaId, toPersona: PersonaId): {
    summary: string;
    keyPoints: string[];
    openItems: string[];
    emotionalContext?: string;
};
/**
 * Build LLM context for cross-persona awareness
 */
export declare function buildCrossPersonaContext(userId: string, currentPersona: PersonaId): string | null;
export declare function exportTeamContext(userId: string): UserTeamContext | null;
export declare function importTeamContext(context: UserTeamContext): void;
declare const _default: {
    shareContext: typeof shareContext;
    recordPersonaInteraction: typeof recordPersonaInteraction;
    updateCurrentSituation: typeof updateCurrentSituation;
    addCrossPersonaItem: typeof addCrossPersonaItem;
    getContextForPersona: typeof getContextForPersona;
    getHandoffSummary: typeof getHandoffSummary;
    buildCrossPersonaContext: typeof buildCrossPersonaContext;
    exportTeamContext: typeof exportTeamContext;
    importTeamContext: typeof importTeamContext;
};
export default _default;
//# sourceMappingURL=cross-persona-context.d.ts.map