/**
 * Cognitive Learning Persistence
 *
 * > "Perfect memory. Zero judgment. Full presence."
 *
 * Firestore persistence for cognitive learning data.
 * Tracks which reasoning approaches work best for each user-persona pair,
 * what topics they're expert vs novice in, and knowledge state to avoid
 * re-explaining concepts they already understand.
 *
 * This is what makes Ferni "learn" over time - not just remember facts,
 * but remember HOW to communicate with each person.
 */
import type { ReasoningStyle } from './cognitive-types.js';
/**
 * User cognitive style - how THEY think (detected from conversations)
 */
export type UserCognitiveStyle = 'analytical' | 'emotional' | 'practical' | 'narrative' | 'systematic' | 'intuitive' | 'unknown';
/**
 * Persisted cognitive learning for a user-persona pair
 */
export interface PersistedCognitiveLearning {
    userId: string;
    personaId: string;
    /** Which approaches work best with this user (approach -> effectiveness score 0-1) */
    effectiveApproaches: Record<ReasoningStyle, number>;
    /** User's detected preferred cognitive style */
    userPreferredStyle: UserCognitiveStyle;
    /** Approaches that led to breakthroughs */
    breakthroughApproaches: ReasoningStyle[];
    /** Approaches to avoid (consistently ineffective) */
    ineffectiveApproaches: ReasoningStyle[];
    /** Topics where user has expertise (skip basics) */
    expertiseTopics: string[];
    /** Topics that need more explanation */
    noviceTopics: string[];
    /** Total interactions for confidence */
    totalInteractions: number;
    /** Last updated */
    updatedAt: string;
}
/**
 * Persisted knowledge state for a user
 */
export interface PersistedKnowledgeState {
    userId: string;
    /** Topics we've explained to this user */
    topicsExplained: Record<string, {
        firstExplained: string;
        timesRevisited: number;
        understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
        lastAssessedConfidence: number;
        personaWhoExplained: string;
    }>;
    /** Don't re-explain these */
    skipExplanationFor: string[];
    /** User has asked about these multiple times - might need different approach */
    confusionTopics: string[];
    /** Last updated */
    updatedAt: string;
}
/**
 * Save cognitive learning data for a user-persona pair
 */
export declare function saveCognitiveLearning(data: PersistedCognitiveLearning): Promise<void>;
/**
 * Load cognitive learning data for a user-persona pair
 */
export declare function loadCognitiveLearning(userId: string, personaId: string): Promise<PersistedCognitiveLearning | null>;
/**
 * Load all cognitive learning data for a user (across all personas)
 */
export declare function loadAllCognitiveLearning(userId: string): Promise<PersistedCognitiveLearning[]>;
/**
 * Save knowledge state for a user
 */
export declare function saveKnowledgeState(data: PersistedKnowledgeState): Promise<void>;
/**
 * Load knowledge state for a user
 */
export declare function loadKnowledgeState(userId: string): Promise<PersistedKnowledgeState | null>;
/**
 * Convert CognitiveLearning (in-memory Map-based) to PersistedCognitiveLearning
 */
export declare function toPersistableLearning(userId: string, personaId: string, learning: {
    effectiveApproaches: Map<ReasoningStyle, number>;
    userPreferredStyle: UserCognitiveStyle;
    breakthroughApproaches: ReasoningStyle[];
    ineffectiveApproaches: ReasoningStyle[];
    expertiseTopics: string[];
    noviceTopics: string[];
    totalInteractions: number;
}): PersistedCognitiveLearning;
/**
 * Convert PersistedCognitiveLearning back to in-memory format
 */
export declare function fromPersistedLearning(data: PersistedCognitiveLearning): {
    effectiveApproaches: Map<ReasoningStyle, number>;
    userPreferredStyle: UserCognitiveStyle;
    breakthroughApproaches: ReasoningStyle[];
    ineffectiveApproaches: ReasoningStyle[];
    expertiseTopics: string[];
    noviceTopics: string[];
    totalInteractions: number;
};
/**
 * Convert UserKnowledgeState (in-memory Map-based) to PersistedKnowledgeState
 */
export declare function toPersistableKnowledge(userId: string, state: {
    topicsExplained: Map<string, {
        firstExplained: Date;
        timesRevisited: number;
        understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
        lastAssessedConfidence: number;
        personaWhoExplained: string;
    }>;
    skipExplanationFor: string[];
    confusionTopics: string[];
}): PersistedKnowledgeState;
/**
 * Convert PersistedKnowledgeState back to in-memory format
 */
export declare function fromPersistedKnowledge(data: PersistedKnowledgeState): {
    userId: string;
    topicsExplained: Map<string, {
        firstExplained: Date;
        timesRevisited: number;
        understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
        lastAssessedConfidence: number;
        personaWhoExplained: string;
    }>;
    skipExplanationFor: string[];
    confusionTopics: string[];
};
declare const _default: {
    saveCognitiveLearning: typeof saveCognitiveLearning;
    loadCognitiveLearning: typeof loadCognitiveLearning;
    loadAllCognitiveLearning: typeof loadAllCognitiveLearning;
    saveKnowledgeState: typeof saveKnowledgeState;
    loadKnowledgeState: typeof loadKnowledgeState;
    toPersistableLearning: typeof toPersistableLearning;
    fromPersistedLearning: typeof fromPersistedLearning;
    toPersistableKnowledge: typeof toPersistableKnowledge;
    fromPersistedKnowledge: typeof fromPersistedKnowledge;
};
export default _default;
//# sourceMappingURL=cognitive-persistence.d.ts.map