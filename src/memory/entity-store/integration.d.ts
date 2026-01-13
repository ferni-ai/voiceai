/**
 * Entity Store Integration
 *
 * This module provides the integration hooks for capturing entities from
 * various sources (data capture, conversation, imports) into the unified store.
 *
 * @module memory/entity-store/integration
 */
import type { PersonCaptureInput, CaptureContext, CaptureResult } from './types.js';
/**
 * Check if entity store is ready to use
 */
export declare function isEntityStoreReady(): boolean;
/**
 * Initialize entity store
 */
export declare function initializeEntityStore(): Promise<void>;
/**
 * Capture a person entity from conversation
 *
 * This is the main entry point for data capture integration.
 * Call this whenever a person is mentioned in conversation.
 */
export declare function capturePersonEntity(userId: string, input: PersonCaptureInput, context: CaptureContext): Promise<CaptureResult>;
/**
 * Capture multiple people at once (for imports)
 */
export declare function captureMultiplePeople(userId: string, inputs: PersonCaptureInput[], context: Omit<CaptureContext, 'transcript'>): Promise<CaptureResult[]>;
/**
 * Find a contact for telephony (call/text)
 *
 * This replaces the fragmented contact lookup used by telephony tools.
 */
export declare function findContactForTelephony(userId: string, query: string): Promise<{
    name: string;
    phone: string;
    relationship?: string;
} | null>;
/**
 * Get all contacts for a user (for contact list display)
 */
export declare function getAllContacts(userId: string): Promise<Array<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    relationship?: string;
}>>;
/**
 * Get entity store health status
 */
export declare function getEntityStoreHealth(userId: string): Promise<{
    ready: boolean;
    error?: string;
    stats?: {
        entityCount: number;
        mentionCount: number;
        relationshipCount: number;
    };
}>;
/**
 * Options for unified memory retrieval
 */
export interface RetrieveMemoriesOptions {
    currentTopic?: string;
    currentEmotion?: string;
    personaId?: string;
    conversationTurn?: number;
    recentTopics?: string[];
    limit?: number;
}
/**
 * Score breakdown for retrieved entity
 */
interface EntityScoreBreakdown {
    semantic: number;
    temporal: number;
    emotional: number;
    graphDistance: number;
}
/**
 * Retrieved entity result
 */
interface EntityRetrievalResult {
    entity: {
        id: string;
        type: string;
        lastSeen: string;
        emotionalWeight: number;
        salienceScore: number;
        canonicalName?: string;
        relationship?: string;
        specificRelation?: string;
        [key: string]: unknown;
    };
    score: number;
    scoreBreakdown: EntityScoreBreakdown;
    reason: string;
}
/**
 * Result of unified memory retrieval
 */
interface UnifiedMemoryResult {
    entities: EntityRetrievalResult[];
    formattedContext: string;
}
/**
 * Retrieve memories from entity store using unified Graph-RAG approach
 *
 * This function combines entity lookup with Graph-RAG for contextual retrieval.
 * TODO: Implement full Graph-RAG retrieval with entity relationships
 */
export declare function retrieveMemoriesUnified(userId: string, query: string, options?: RetrieveMemoriesOptions): Promise<UnifiedMemoryResult>;
/**
 * Options for checking proactive surfacing opportunities
 */
export interface ProactiveSurfacingOptions {
    sessionId: string;
    personaId: string;
    turnNumber: number;
    surfacingCountThisSession: number;
    sessionTopics: string[];
    conversationMood?: 'exploratory' | 'venting' | 'seeking_help' | 'casual';
    lastTurnWasQuestion?: boolean;
    detectedEmotion?: string;
}
/**
 * Check for proactive surfacing opportunities based on current turn
 *
 * This wraps the ProactiveSurfacingEngine to analyze the current conversation
 * context and find relevant memories worth mentioning.
 */
export declare function checkProactiveSurfacing(userId: string, currentTurn: string, options: ProactiveSurfacingOptions): Promise<import('./types.js').SurfacingOpportunity[]>;
/**
 * Initialize the entity store integration
 * Alias for initializeEntityStore for backward compatibility
 */
export declare const initializeEntityStoreIntegration: typeof initializeEntityStore;
/**
 * Capture a commitment entity from conversation
 * TODO: Implement full commitment capture logic
 */
export declare function captureCommitmentEntity(userId: string, data: {
    commitment: string;
    type?: 'promise' | 'intention' | 'goal' | 'decision';
    dueDate?: Date;
    relatedEntityIds?: string[];
}, context: {
    sessionId: string;
    personaId: string;
    transcript: string;
}): Promise<CaptureResult>;
export {};
//# sourceMappingURL=integration.d.ts.map