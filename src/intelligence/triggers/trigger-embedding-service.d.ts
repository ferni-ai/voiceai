/**
 * Trigger Embedding Service
 *
 * Generates and manages embeddings for proactive triggers.
 * Phase 1 of the Superhuman Trigger Intelligence system.
 *
 * Philosophy: Transform trigger descriptions into semantic vectors
 * that capture INTENT, not just keywords. This enables matching
 * emotional undertones and implicit meanings.
 *
 * @module TriggerEmbeddingService
 */
import type { ProactiveTrigger, EmbeddedTrigger, TriggerCategory, PersonaTriggerSet } from './types.js';
/**
 * Detect the category of a trigger based on its description
 */
export declare function detectTriggerCategory(triggerText: string): TriggerCategory;
/**
 * Service for generating and managing trigger embeddings
 */
export declare class TriggerEmbeddingService {
    private embeddedTriggers;
    private pendingEmbeddings;
    private initialized;
    /**
     * Initialize the service with triggers from a persona
     */
    initializeForPersona(triggerSet: PersonaTriggerSet): Promise<number>;
    /**
     * Generate embedding for user text
     */
    embedUserText(text: string): Promise<number[]>;
    /**
     * Find semantically similar triggers for user text
     */
    findSimilarTriggers(userText: string, options?: {
        personaId?: string;
        category?: TriggerCategory;
        topK?: number;
        minSimilarity?: number;
    }): Promise<Array<{
        trigger: EmbeddedTrigger;
        similarity: number;
    }>>;
    /**
     * Get all embedded triggers for a persona
     */
    getTriggersForPersona(personaId: string): EmbeddedTrigger[];
    /**
     * Get trigger by ID
     */
    getTrigger(personaId: string, triggerName: string): EmbeddedTrigger | undefined;
    /**
     * Check if service is initialized
     */
    isInitialized(): boolean;
    /**
     * Get stats about embedded triggers
     */
    getStats(): {
        totalTriggers: number;
        byPersona: Record<string, number>;
        byCategory: Record<TriggerCategory, number>;
        embeddingDimensions: number;
        model: string;
    };
    /**
     * Clear all cached embeddings
     */
    clear(): void;
    /**
     * Add or update a single trigger embedding
     */
    addTrigger(personaId: string, name: string, trigger: ProactiveTrigger): Promise<EmbeddedTrigger>;
    /**
     * Remove a trigger
     */
    removeTrigger(personaId: string, name: string): boolean;
}
/**
 * Get the singleton trigger embedding service
 */
export declare function getTriggerEmbeddingService(): TriggerEmbeddingService;
/**
 * Reset the singleton (for testing)
 */
export declare function resetTriggerEmbeddingService(): void;
declare const _default: {
    TriggerEmbeddingService: typeof TriggerEmbeddingService;
    getTriggerEmbeddingService: typeof getTriggerEmbeddingService;
    resetTriggerEmbeddingService: typeof resetTriggerEmbeddingService;
    detectTriggerCategory: typeof detectTriggerCategory;
};
export default _default;
//# sourceMappingURL=trigger-embedding-service.d.ts.map