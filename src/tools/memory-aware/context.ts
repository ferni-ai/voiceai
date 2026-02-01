/**
 * Memory-Aware Tool Context
 *
 * Provides memory access to tools during execution.
 *
 * @module tools/memory-aware/context
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { StoredMemory } from '../../memory/unified-store/types.js';
import type {
  ToolMemoryContext,
  MemoryQuery,
  MemoryResult,
  MemoryCaptureRequest,
  MemoryAwareToolContext,
  UserContextSummary,
} from './types.js';

const log = createLogger({ module: 'MemoryAwareContext' });

// ============================================================================
// TOOL MEMORY CONTEXT IMPLEMENTATION
// ============================================================================

/**
 * Implementation of ToolMemoryContext
 */
export class ToolMemoryContextImpl implements ToolMemoryContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly personaId: string;

  private sessionMemories: StoredMemory[] = [];
  private memoryStore: MemoryStoreAdapter;

  constructor(
    userId: string,
    sessionId: string,
    personaId: string,
    memoryStore: MemoryStoreAdapter
  ) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.personaId = personaId;
    this.memoryStore = memoryStore;
  }

  async recall(query: MemoryQuery): Promise<MemoryResult> {
    const startTime = Date.now();

    try {
      const memories = await this.memoryStore.recall({
        userId: this.userId,
        query: query.query,
        topics: query.topics,
        people: query.people,
        limit: query.limit || 10,
        activeCommitmentsOnly: query.activeCommitmentsOnly,
        timeRange: query.timeRange,
      });

      return {
        memories,
        totalAvailable: memories.length, // Would be actual count from store
        query,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      log.error({ error, query }, 'Memory recall failed');
      return {
        memories: [],
        totalAvailable: 0,
        query,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async capture(request: MemoryCaptureRequest): Promise<string> {
    try {
      const memoryId = await this.memoryStore.capture({
        userId: this.userId,
        sessionId: this.sessionId,
        personaId: this.personaId,
        ...request,
      });

      log.debug({ memoryId, type: request.type }, 'Captured memory from tool');
      return memoryId;
    } catch (error) {
      log.error({ error, request }, 'Memory capture failed');
      throw error;
    }
  }

  async getSessionMemories(): Promise<StoredMemory[]> {
    if (this.sessionMemories.length === 0) {
      const result = await this.recall({
        limit: 50,
      });
      this.sessionMemories = result.memories.filter(
        (m) => m.sessionId === this.sessionId
      );
    }
    return this.sessionMemories;
  }

  async getCommitments(activeOnly: boolean = true): Promise<StoredMemory[]> {
    const result = await this.recall({
      activeCommitmentsOnly: activeOnly,
      limit: 20,
    });
    return result.memories.filter((m) => m.isActiveCommitment === activeOnly);
  }

  async getMemoriesAboutPerson(personName: string): Promise<StoredMemory[]> {
    const result = await this.recall({
      people: [personName],
      limit: 20,
    });
    return result.memories;
  }

  async getMemoriesAboutTopic(topic: string): Promise<StoredMemory[]> {
    const result = await this.recall({
      topics: [topic],
      limit: 20,
    });
    return result.memories;
  }

  async linkMemories(memoryId1: string, memoryId2: string, linkType: string): Promise<void> {
    await this.memoryStore.linkMemories(memoryId1, memoryId2, linkType);
    log.debug({ memoryId1, memoryId2, linkType }, 'Linked memories');
  }

  async reinforceMemory(memoryId: string): Promise<void> {
    await this.memoryStore.reinforceMemory(memoryId);
    log.debug({ memoryId }, 'Reinforced memory');
  }

  /**
   * Add a memory to session cache
   */
  addSessionMemory(memory: StoredMemory): void {
    this.sessionMemories.push(memory);
  }
}

// ============================================================================
// MEMORY STORE ADAPTER
// ============================================================================

/**
 * Adapter interface for the memory store
 */
export interface MemoryStoreAdapter {
  recall(query: {
    userId: string;
    query?: string;
    topics?: string[];
    people?: string[];
    limit?: number;
    activeCommitmentsOnly?: boolean;
    timeRange?: { start: Date; end: Date };
  }): Promise<StoredMemory[]>;

  capture(request: {
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
  }): Promise<string>;

  linkMemories(memoryId1: string, memoryId2: string, linkType: string): Promise<void>;

  reinforceMemory(memoryId: string): Promise<void>;
}

// ============================================================================
// FULL CONTEXT BUILDER
// ============================================================================

/**
 * Build full memory-aware tool context
 */
export async function buildMemoryAwareContext(
  userId: string,
  sessionId: string,
  personaId: string,
  memoryStore: MemoryStoreAdapter,
  options?: {
    activeTopics?: string[];
    recentPeople?: string[];
    emotionalState?: MemoryAwareToolContext['emotionalState'];
    turnCount?: number;
  }
): Promise<MemoryAwareToolContext> {
  const memory = new ToolMemoryContextImpl(userId, sessionId, personaId, memoryStore);

  // Build user summary
  const userSummary = await buildUserSummary(memory);

  // Determine session depth
  const turnCount = options?.turnCount ?? 0;
  const sessionDepth: MemoryAwareToolContext['sessionDepth'] =
    turnCount < 3 ? 'shallow' :
    turnCount < 10 ? 'moderate' : 'deep';

  return {
    memory,
    userSummary,
    activeTopics: options?.activeTopics ?? [],
    recentPeople: options?.recentPeople ?? [],
    emotionalState: options?.emotionalState,
    sessionDepth,
  };
}

/**
 * Build user context summary
 */
async function buildUserSummary(memory: ToolMemoryContext): Promise<UserContextSummary> {
  try {
    // Get commitments
    const commitments = await memory.getCommitments(true);

    // Get recent memories to extract topics and people
    const result = await memory.recall({ limit: 50 });

    // Extract key topics (most frequent)
    const topicCounts = new Map<string, number>();
    const peopleCounts = new Map<string, number>();

    for (const mem of result.memories) {
      for (const topic of mem.topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
      for (const person of mem.peopleMentioned) {
        peopleCounts.set(person, (peopleCounts.get(person) || 0) + 1);
      }
    }

    const keyTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    const importantPeople = [...peopleCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([person]) => person);

    // Determine memory health
    const memoryHealth: UserContextSummary['memoryHealth'] =
      result.memories.length > 50 ? 'healthy' :
      result.memories.length > 10 ? 'moderate' : 'sparse';

    return {
      activeCommitments: commitments.length,
      keyTopics,
      importantPeople,
      memoryHealth,
    };
  } catch (error) {
    log.error({ error }, 'Failed to build user summary');
    return {
      activeCommitments: 0,
      keyTopics: [],
      importantPeople: [],
      memoryHealth: 'sparse',
    };
  }
}

// ============================================================================
// MOCK ADAPTER FOR TESTING
// ============================================================================

/**
 * Mock memory store adapter for testing
 */
export class MockMemoryStoreAdapter implements MemoryStoreAdapter {
  private memories: StoredMemory[] = [];
  private links: Array<{ id1: string; id2: string; type: string }> = [];

  async recall(query: {
    userId: string;
    query?: string;
    topics?: string[];
    people?: string[];
    limit?: number;
    activeCommitmentsOnly?: boolean;
  }): Promise<StoredMemory[]> {
    let filtered = this.memories.filter((m) => m.userId === query.userId);

    if (query.topics?.length) {
      filtered = filtered.filter((m) =>
        m.topics.some((t) => query.topics!.includes(t))
      );
    }

    if (query.people?.length) {
      filtered = filtered.filter((m) =>
        m.peopleMentioned.some((p) =>
          query.people!.some((qp) => p.toLowerCase().includes(qp.toLowerCase()))
        )
      );
    }

    if (query.activeCommitmentsOnly) {
      filtered = filtered.filter((m) => m.isActiveCommitment);
    }

    return filtered.slice(0, query.limit || 10);
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
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = new Date();

    const memory: StoredMemory = {
      id,
      userId: request.userId,
      type: request.type,
      content: request.content,
      embedding: [],
      createdAt: now,
      lastAccessedAt: now,
      updatedAt: now,
      accessCount: 1,
      emotionalWeight: request.emotionalWeight ?? 0.5,
      strength: 1.0,
      importance: request.importance ?? 0.5,
      isProtected: request.protect ?? false,
      isActiveCommitment: request.isCommitment ?? false,
      topics: request.topics ?? [],
      personaIds: [request.personaId],
      peopleMentioned: request.people ?? [],
      sessionId: request.sessionId,
      metadata: {},
      storageLayer: 'memory',
    };

    this.memories.push(memory);
    return id;
  }

  async linkMemories(memoryId1: string, memoryId2: string, linkType: string): Promise<void> {
    this.links.push({ id1: memoryId1, id2: memoryId2, type: linkType });
  }

  async reinforceMemory(memoryId: string): Promise<void> {
    const memory = this.memories.find((m) => m.id === memoryId);
    if (memory) {
      memory.strength = Math.min(1, memory.strength + 0.2);
      memory.lastAccessedAt = new Date();
      memory.accessCount++;
    }
  }

  // Test helpers
  addMemory(memory: StoredMemory): void {
    this.memories.push(memory);
  }

  getMemories(): StoredMemory[] {
    return this.memories;
  }

  getLinks(): Array<{ id1: string; id2: string; type: string }> {
    return this.links;
  }

  clear(): void {
    this.memories = [];
    this.links = [];
  }
}
