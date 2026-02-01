/**
 * Unified Store Adapter for Memory-Aware Tools
 *
 * Bridges the memory-aware tool system with the UnifiedMemoryStore,
 * providing real Firestore-backed memory operations to tools.
 *
 * @module tools/memory-aware/unified-store-adapter
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getUnifiedStore } from '../../memory/unified-store/facade.js';
import type { UnifiedMemoryStore, StoredMemory, MemoryLinkType } from '../../memory/unified-store/types.js';
import type { MemoryStoreAdapter } from './context.js';

const log = createLogger({ module: 'UnifiedStoreAdapter' });

// ============================================================================
// UNIFIED STORE ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * Memory store adapter that uses the UnifiedMemoryStore
 *
 * This provides real Firestore-backed memory operations to tools,
 * replacing the mock adapter used during development.
 */
export class UnifiedStoreAdapter implements MemoryStoreAdapter {
  private store: UnifiedMemoryStore;
  private initialized = false;

  constructor(store?: UnifiedMemoryStore) {
    this.store = store || getUnifiedStore();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.store.initialize();
    this.initialized = true;
  }

  async recall(query: {
    userId: string;
    query?: string;
    topics?: string[];
    people?: string[];
    limit?: number;
    activeCommitmentsOnly?: boolean;
    timeRange?: { start: Date; end: Date };
  }): Promise<StoredMemory[]> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      // Build recall query for UnifiedStore
      const result = await this.store.recall({
        userId: query.userId,
        query: query.query || '',
        topics: query.topics,
        limit: query.limit || 10,
        minScore: 0.2, // Low threshold to get more results
      });

      let memories = result.memories.map((m) => m.memory);

      // Apply additional filters not supported by recall
      if (query.people?.length) {
        memories = memories.filter((m) =>
          m.peopleMentioned.some((p) =>
            query.people!.some((qp) => p.toLowerCase().includes(qp.toLowerCase()))
          )
        );
      }

      if (query.activeCommitmentsOnly) {
        memories = memories.filter((m) => m.isActiveCommitment);
      }

      if (query.timeRange) {
        memories = memories.filter((m) => {
          const created = new Date(m.createdAt);
          return created >= query.timeRange!.start && created <= query.timeRange!.end;
        });
      }

      log.debug(
        {
          userId: query.userId,
          resultCount: memories.length,
          durationMs: Date.now() - startTime,
        },
        'Tool memory recall complete'
      );

      return memories.slice(0, query.limit || 10);
    } catch (error) {
      log.error({ error: String(error), query }, 'Tool memory recall failed');
      return [];
    }
  }

  async capture(request: {
    userId: string;
    sessionId: string;
    personaId: string;
    content: string;
    type: StoredMemory['type'];
    topics?: string[];
    people?: string[];
    importance?: number;
    emotionalWeight?: number;
    isCommitment?: boolean;
    protect?: boolean;
  }): Promise<string> {
    await this.ensureInitialized();

    try {
      const memory = await this.store.store({
        userId: request.userId,
        type: request.type,
        content: request.content,
        topics: request.topics || [],
        peopleMentioned: request.people || [],
        importance: request.importance || 0.5,
        emotionalWeight: request.emotionalWeight || 0.5,
        isCommitment: request.isCommitment || false,
        personaIds: [request.personaId],
        sessionId: request.sessionId,
        metadata: {
          source: 'tool_capture',
          protected: request.protect || false,
        },
      });

      log.debug(
        {
          memoryId: memory.id,
          type: request.type,
          userId: request.userId,
        },
        'Tool captured memory'
      );

      return memory.id;
    } catch (error) {
      log.error({ error: String(error), request }, 'Tool memory capture failed');
      throw error;
    }
  }

  async linkMemories(memoryId1: string, memoryId2: string, linkType: string): Promise<void> {
    await this.ensureInitialized();

    try {
      // Use the UnifiedStore's addLink method
      await this.store.addLink('', {
        sourceId: memoryId1,
        targetId: memoryId2,
        type: linkType as MemoryLinkType,
        weight: 0.7,
        bidirectional: true,
        detectedBy: 'manual',
        confidence: 0.9,
        context: 'Linked by tool',
      });

      log.debug({ memoryId1, memoryId2, linkType }, 'Tool linked memories');
    } catch (error) {
      log.error({ error: String(error), memoryId1, memoryId2, linkType }, 'Tool memory link failed');
      throw error;
    }
  }

  async reinforceMemory(memoryId: string): Promise<void> {
    await this.ensureInitialized();

    try {
      // Use reinforceLink to boost the memory's connections
      // Also update the memory's accessCount and lastAccessedAt
      await this.store.update('', memoryId, {
        lastAccessedAt: new Date(),
        accessCount: 1, // This will be added to existing count by the store
      });

      log.debug({ memoryId }, 'Tool reinforced memory');
    } catch (error) {
      log.error({ error: String(error), memoryId }, 'Tool memory reinforcement failed');
      // Non-fatal - don't throw
    }
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

let adapterInstance: UnifiedStoreAdapter | null = null;

/**
 * Get or create the unified store adapter singleton
 */
export function getUnifiedStoreAdapter(): MemoryStoreAdapter {
  if (!adapterInstance) {
    adapterInstance = new UnifiedStoreAdapter();
  }
  return adapterInstance;
}

/**
 * Reset the adapter singleton (for testing)
 */
export function resetUnifiedStoreAdapter(): void {
  adapterInstance = null;
}

/**
 * Create a new adapter instance (for testing or isolation)
 */
export function createUnifiedStoreAdapter(store?: UnifiedMemoryStore): MemoryStoreAdapter {
  return new UnifiedStoreAdapter(store);
}
