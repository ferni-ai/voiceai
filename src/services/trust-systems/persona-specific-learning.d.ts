/**
 * Persona-Specific Learning
 *
 * Phase 5: Each persona learns and remembers differently
 *
 * Philosophy:
 * - Each persona has their own "memory" of the user
 * - Ferni (main coach) has the deepest knowledge
 * - Specialist personas (Maya, Peter, etc.) learn domain-specific things
 * - Transfer learning shares relevant insights between personas
 * - Relationship dynamics vary per persona
 *
 * PERSONAS (using canonical IDs):
 * - ferni: Life coach, deep emotional understanding
 * - peter-john: Research, analytical insights
 * - alex-chen: Communications, social dynamics
 * - maya-santos: Habits & routines, behavioral patterns
 * - jordan-taylor: Events & planning, scheduling preferences
 * - nayan-patel: Sage mentor, wisdom, philosophy & long-term thinking (premium)
 */
export type PersonaId = 'ferni' | 'peter-john' | 'alex-chen' | 'maya-santos' | 'jordan-taylor' | 'nayan-patel';
export interface PersonaMemory {
    personaId: PersonaId;
    userId: string;
    interactions: {
        totalConversations: number;
        totalMinutes: number;
        lastInteraction: Date | null;
        firstInteraction: Date | null;
    };
    domainKnowledge: DomainKnowledge;
    rapport: {
        comfortLevel: number;
        trustLevel: number;
        preferredTone: 'casual' | 'professional' | 'warm' | 'direct' | null;
        topicsDiscussed: string[];
        avoidedTopics: string[];
    };
    observations: PersonaObservation[];
    shareable: ShareableInsight[];
    lastUpdated: Date;
}
export type DomainKnowledge = Record<string, unknown>;
export interface PersonaObservation {
    id: string;
    date: Date;
    type: string;
    observation: string;
    confidence: number;
    sharedWithOthers: boolean;
}
export interface ShareableInsight {
    id: string;
    fromPersona: PersonaId;
    insightType: 'preference' | 'boundary' | 'pattern' | 'milestone' | 'context';
    summary: string;
    relevantPersonas: PersonaId[];
    createdAt: Date;
    expiresAt: Date | null;
}
export declare function getPersonaMemory(userId: string, personaId: PersonaId): PersonaMemory | null;
export declare function getAllPersonaMemories(userId: string): PersonaMemory[];
/**
 * Record a conversation with a specific persona
 */
export declare function recordPersonaInteraction(userId: string, personaId: PersonaId, durationMinutes: number, topicsDiscussed: string[]): void;
/**
 * Learn domain-specific knowledge for a persona
 */
export declare function learnDomainKnowledge(userId: string, personaId: PersonaId, domain: string, knowledge: unknown): void;
/**
 * Get what a persona knows about a domain
 */
export declare function getPersonaDomainKnowledge(userId: string, personaId: PersonaId, domain: string): unknown | null;
/**
 * Record an observation from a persona's perspective
 */
export declare function recordPersonaObservation(userId: string, personaId: PersonaId, type: string, observation: string, confidence?: number): PersonaObservation;
/**
 * Get a persona's observations about the user
 */
export declare function getPersonaObservations(userId: string, personaId: PersonaId, type?: string): PersonaObservation[];
/**
 * Get insights shared with a persona
 */
export declare function getSharedInsights(userId: string, personaId: PersonaId): ShareableInsight[];
/**
 * Update rapport with a persona based on interaction quality
 */
export declare function updatePersonaRapport(userId: string, personaId: PersonaId, update: {
    comfortDelta?: number;
    trustDelta?: number;
    preferredTone?: PersonaMemory['rapport']['preferredTone'];
    avoidTopic?: string;
}): void;
/**
 * Get the preferred communication style for a persona with this user
 */
export declare function getPersonaCommunicationStyle(userId: string, personaId: PersonaId): {
    tone: string;
    formality: number;
    emoji: boolean;
    verbosity: 'concise' | 'moderate' | 'detailed';
};
/**
 * Build context about the user for a specific persona
 */
export declare function buildPersonaContext(userId: string, personaId: PersonaId): string;
/**
 * Export all persona memories for a user
 */
export declare function exportPersonaMemories(userId: string): Record<PersonaId, unknown>;
/**
 * Import persona memories from Firestore
 */
export declare function importPersonaMemories(userId: string, data: Record<string, unknown>): void;
export declare const personaLearning: {
    recordInteraction: typeof recordPersonaInteraction;
    learnDomain: typeof learnDomainKnowledge;
    getDomainKnowledge: typeof getPersonaDomainKnowledge;
    recordObservation: typeof recordPersonaObservation;
    getObservations: typeof getPersonaObservations;
    getSharedInsights: typeof getSharedInsights;
    updateRapport: typeof updatePersonaRapport;
    getCommunicationStyle: typeof getPersonaCommunicationStyle;
    buildContext: typeof buildPersonaContext;
    getMemory: typeof getPersonaMemory;
    getAllMemories: typeof getAllPersonaMemories;
    exportMemories: typeof exportPersonaMemories;
    importMemories: typeof importPersonaMemories;
    PERSONA_DOMAINS: Record<PersonaId, {
        name: string;
        specialty: string;
        learnsAbout: string[];
        sharesInsights: PersonaId[];
        receivesFrom: PersonaId[];
    }>;
};
//# sourceMappingURL=persona-specific-learning.d.ts.map