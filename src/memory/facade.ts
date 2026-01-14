/**
 * Memory System Facade (Clean Architecture)
 *
 * This is the PRIMARY PUBLIC API for the memory system.
 * Provides a simple, unified interface that hides internal complexity.
 *
 * Use this instead of importing from individual modules:
 * ```typescript
 * import { Memory } from './memory/facade.js';
 *
 * // Initialize
 * await Memory.initialize();
 *
 * // Capture from conversation
 * await Memory.capture({
 *   userId,
 *   sessionId,
 *   transcript,
 *   turnNumber,
 * });
 *
 * // Retrieve context
 * const context = await Memory.retrieve(userId, query);
 *
 * // Check health
 * const healthy = await Memory.isHealthy();
 * ```
 *
 * @module memory/facade
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'Memory' });

// ============================================================================
// FACADE CLASS
// ============================================================================

/**
 * Memory System Facade
 *
 * Unified interface for all memory operations.
 * This is the recommended way to interact with the memory system.
 */
export const Memory = {
  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize the memory system.
   * Call once at application startup.
   */
  async initialize(config?: {
    enableRedis?: boolean;
    usePersistentVectors?: boolean;
    lazyInit?: boolean;
  }): Promise<void> {
    const { initializeMemory } = await import('./init/index.js');
    await initializeMemory(config);
    log.info('Memory system initialized');
  },

  /**
   * Check if the memory system is initialized
   */
  async isInitialized(): Promise<boolean> {
    const { isInitialized } = await import('./init/index.js');
    return isInitialized();
  },

  /**
   * Shutdown the memory system.
   * Call at application shutdown for clean cleanup.
   */
  async shutdown(): Promise<void> {
    const { shutdown } = await import('./init/index.js');
    await shutdown();
    log.info('Memory system shutdown complete');
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Quick health check (is the system operational?)
   */
  async isHealthy(): Promise<boolean> {
    const { isHealthy } = await import('./init/index.js');
    return isHealthy();
  },

  /**
   * Detailed health status
   */
  async getHealth(): Promise<import('./init/index.js').HealthStatus> {
    const { getHealth } = await import('./init/index.js');
    return getHealth();
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPTURE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Capture memory from a conversation turn.
   *
   * This is the MAIN ENTRY POINT for capturing user interactions.
   * Handles:
   * - Fast regex extraction (inline)
   * - STM buffer recording
   * - Entity capture
   * - Async deep extraction (queued)
   */
  async capture(input: {
    userId: string;
    sessionId: string;
    turnNumber: number;
    transcript: string;
    timestamp?: Date;
    personaId?: string;
    emotion?: {
      primary?: string;
      intensity?: number;
      voiceEmotion?: string;
    };
    topic?: string;
  }): Promise<import('./capture/index.js').CaptureResultUnified> {
    const { captureTurnUnified } = await import('./capture/index.js');
    return captureTurnUnified(input);
  },

  /**
   * Capture a specific person entity
   */
  async capturePerson(
    userId: string,
    person: {
      name?: string;
      relationship?: string;
      phone?: string;
      email?: string;
      context?: string;
    },
    sessionContext: {
      sessionId: string;
      personaId: string;
      transcript: string;
    }
  ): Promise<import('./entity-store/types.js').CaptureResult> {
    const { capturePersonEntity } = await import('./entity-store/integration.js');
    return capturePersonEntity(userId, person, {
      conversationId: sessionContext.sessionId,
      sessionId: sessionContext.sessionId,
      personaId: sessionContext.personaId,
      transcript: sessionContext.transcript,
    });
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieve relevant context for a query.
   *
   * This is the MAIN ENTRY POINT for memory retrieval.
   * Combines:
   * - Semantic search
   * - Entity store
   * - STM buffer
   * - Knowledge graph
   */
  async retrieve(
    userId: string,
    query: string,
    options?: import('./retrieval/index.js').RetrievalOptions
  ): Promise<import('./retrieval/index.js').RetrievalResult> {
    const { retrieveContext } = await import('./retrieval/index.js');
    return retrieveContext(userId, query, undefined, options);
  },

  /**
   * Quick semantic search
   */
  async search(
    userId: string,
    query: string,
    topK = 5
  ): Promise<import('./interfaces/index.js').RetrievedMemory[]> {
    const { semanticSearch } = await import('./retrieval/index.js');
    return semanticSearch(userId, query, topK);
  },

  /**
   * Find an entity (person, place, thing)
   */
  async findEntity(
    userId: string,
    query: string
  ): Promise<import('./retrieval/index.js').EntityMatch | null> {
    const { findEntity } = await import('./retrieval/index.js');
    return findEntity(userId, query);
  },

  /**
   * Get recent conversation context from STM
   */
  async getRecentContext(sessionId: string, userId: string): Promise<string | null> {
    const { getRecentContext } = await import('./retrieval/index.js');
    return getRecentContext(sessionId, userId);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save a document to persistent storage
   */
  async saveDocument<T extends object>(
    userId: string,
    collection: string,
    docId: string,
    data: T
  ): Promise<void> {
    const { saveDocument } = await import('./persistence/index.js');
    await saveDocument(userId, collection, docId, data);
  },

  /**
   * Get a document from persistent storage
   */
  async getDocument<T>(
    userId: string,
    collection: string,
    docId: string
  ): Promise<T | null> {
    const { getDocument } = await import('./persistence/index.js');
    return getDocument<T>(userId, collection, docId);
  },

  /**
   * Delete a document from persistent storage
   */
  async deleteDocument(
    userId: string,
    collection: string,
    docId: string
  ): Promise<void> {
    const { deleteDocument } = await import('./persistence/index.js');
    await deleteDocument(userId, collection, docId);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KNOWLEDGE GRAPH
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Ask a natural language question about what we know
   */
  async ask(
    userId: string,
    question: string
  ): Promise<{
    answer: string;
    entities: Array<{ name: string; type: string }>;
    confidence: number;
  }> {
    const { executeNaturalQuery } = await import('./knowledge-graph/index.js');
    const result = await executeNaturalQuery(userId, question);

    return {
      answer: result.formattedResponse || 'I don\'t have information about that.',
      entities: result.relatedEntities.map((e) => ({
        name: e.canonicalName,
        type: e.type,
      })),
      confidence: result.confidence,
    };
  },

  /**
   * Get everything we know about an entity
   */
  async whatDoWeKnow(
    userId: string,
    entityName: string
  ): Promise<{
    entity: import('./entity-store/types.js').Entity | null;
    summary: string;
    facts: string[];
    relationships: string[];
  }> {
    const { whatDoWeKnowAbout } = await import('./entity-store/entity-resolver.js');
    const result = await whatDoWeKnowAbout(userId, entityName);

    if (!result.entity) {
      return {
        entity: null,
        summary: `I don't have any information about "${entityName}".`,
        facts: [],
        relationships: [],
      };
    }

    return {
      entity: result.entity,
      summary: `I know about ${result.entity.canonicalName}.`,
      facts: result.facts?.map((f) => f.content || `${f.key}: ${f.value}`) || [],
      relationships: result.relationships?.map((r) => `${r.type} (${r.fromEntity} -> ${r.toEntity})`) || [],
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Called when a session ends - promotes STM to persistent storage
   */
  async onSessionEnd(sessionId: string, userId: string): Promise<void> {
    const { onSessionEnd } = await import('./dynamic/stm-promotion.js');
    await onSessionEnd(sessionId, userId);
  },

  /**
   * Clear session data (for cleanup)
   */
  async clearSession(sessionId: string): Promise<void> {
    const { cleanupSession } = await import('./dynamic/stm-buffer.js');
    cleanupSession(sessionId);
  },
};

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

// Default export for clean imports
export default Memory;

// Named export for destructuring
export { Memory as MemoryFacade };

// Re-export types for convenience
export type { CaptureInput, CaptureResultUnified } from './capture/index.js';
export type { RetrievalOptions, RetrievalResult, EntityMatch } from './retrieval/index.js';
export type { InitConfig, HealthStatus } from './init/index.js';
export type { RetrievedMemory, RetrievalContext } from './interfaces/index.js';
