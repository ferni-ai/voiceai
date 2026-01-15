/**
 * Shared Memory API
 *
 * Unified memory API for "Better Than Human" cross-persona memory access.
 * All personas share the same user memories but with different lenses.
 *
 * Architecture:
 * ```
 * User Memory Store (Firestore/Spanner)
 *          │
 *    ┌─────┴─────┐
 *    │           │
 *    ▼           ▼
 * Shared     Persona-Specific
 * Memories   Context Lens
 *    │           │
 *    └─────┬─────┘
 *          │
 *          ▼
 *   Persona Memory Context
 * ```
 *
 * Key Features:
 * - Single source of truth for all memories
 * - Persona-specific relevance filtering
 * - Cross-persona insight sharing
 * - Attribution tracking for surfaced memories
 *
 * @module memory/cross-persona/shared-memory-api
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SharedMemoryAPI' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Persona identifiers
 */
export type PersonaId =
  | 'ferni'      // Life coach (coordinator)
  | 'peter'     // Research
  | 'maya'      // Habits/routines
  | 'jordan'    // Event planning
  | 'alex'      // Communication
  | 'nayan';    // Wisdom/philosophy

/**
 * Memory type categories
 */
export type MemoryCategory =
  | 'fact'           // Static facts about the user
  | 'entity'         // People, places, things
  | 'emotion'        // Emotional moments
  | 'commitment'     // Promises, goals, intentions
  | 'habit'          // Habits and routines
  | 'relationship'   // Relationship information
  | 'preference'     // User preferences
  | 'milestone'      // Achievements, anniversaries
  | 'insight';       // Cross-persona insights

/**
 * Shared memory record
 */
export interface SharedMemory {
  /** Unique memory ID */
  id: string;
  /** User ID */
  userId: string;
  /** Memory content */
  content: string;
  /** Category for filtering */
  category: MemoryCategory;
  /** Which persona captured this */
  capturedBy: PersonaId;
  /** When captured */
  capturedAt: Date;
  /** Emotional weight (0-1) */
  emotionalWeight: number;
  /** Confidence (0-1) */
  confidence: number;
  /** Personas this is relevant to */
  relevantToPersonas: PersonaId[];
  /** Related entity IDs */
  relatedEntities?: string[];
  /** Attribution for surfacing */
  attribution?: string;
  /** Times this has been surfaced */
  surfaceCount: number;
  /** Last surfaced timestamp */
  lastSurfaced?: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Memory query filters
 */
export interface MemoryQueryFilters {
  /** Filter by categories */
  categories?: MemoryCategory[];
  /** Filter by capturing persona */
  capturedBy?: PersonaId[];
  /** Filter by relevance to persona */
  relevantTo?: PersonaId;
  /** Minimum emotional weight */
  minEmotionalWeight?: number;
  /** Minimum confidence */
  minConfidence?: number;
  /** Date range */
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  /** Related entity IDs */
  relatedEntities?: string[];
  /** Exclude recently surfaced (within hours) */
  excludeRecentlySurfaced?: number;
  /** Maximum results */
  limit?: number;
}

/**
 * Memory query result
 */
export interface MemoryQueryResult {
  /** Matched memories */
  memories: SharedMemory[];
  /** Total count (before pagination) */
  totalCount: number;
  /** Query execution time ms */
  queryTimeMs: number;
  /** Applied filters */
  appliedFilters: MemoryQueryFilters;
}

/**
 * Cross-persona insight
 */
export interface CrossPersonaInsight {
  /** Insight ID */
  id: string;
  /** User ID */
  userId: string;
  /** Generating persona */
  fromPersona: PersonaId;
  /** Target persona(s) */
  forPersonas: PersonaId[];
  /** Insight content */
  content: string;
  /** Priority (1-100) */
  priority: number;
  /** Confidence (0-1) */
  confidence: number;
  /** Related memory IDs */
  relatedMemoryIds: string[];
  /** Created timestamp */
  createdAt: Date;
  /** Expiry time (if applicable) */
  expiresAt?: Date;
  /** Whether this has been delivered */
  delivered: boolean;
}

// ============================================================================
// PERSONA RELEVANCE MAPPING
// ============================================================================

/**
 * Memory categories relevant to each persona
 */
export const PERSONA_MEMORY_INTERESTS: Record<PersonaId, MemoryCategory[]> = {
  ferni: ['fact', 'entity', 'emotion', 'commitment', 'relationship', 'insight'],
  peter: ['fact', 'entity', 'preference', 'insight'],
  maya: ['habit', 'commitment', 'emotion', 'milestone', 'preference'],
  jordan: ['entity', 'relationship', 'milestone', 'preference'],
  alex: ['relationship', 'entity', 'preference', 'commitment'],
  nayan: ['emotion', 'milestone', 'insight', 'relationship'],
};

// ============================================================================
// MEMORY STORAGE
// ============================================================================

// In-memory cache for recent memories (backed by Firestore)
const memoryCache = new Map<string, SharedMemory[]>();

// Cross-persona insights queue
const insightsQueue = new Map<string, CrossPersonaInsight[]>();

/**
 * Get memories for a user
 */
export async function getMemories(
  userId: string,
  filters: MemoryQueryFilters = {}
): Promise<MemoryQueryResult> {
  const startTime = Date.now();

  try {
    // Check cache first
    let memories = memoryCache.get(userId) || [];

    // If cache empty, load from Firestore
    if (memories.length === 0) {
      memories = await loadMemoriesFromFirestore(userId);
      memoryCache.set(userId, memories);
    }

    // Apply filters
    let filtered = [...memories];

    if (filters.categories && filters.categories.length > 0) {
      filtered = filtered.filter((m) => filters.categories!.includes(m.category));
    }

    if (filters.capturedBy && filters.capturedBy.length > 0) {
      filtered = filtered.filter((m) => filters.capturedBy!.includes(m.capturedBy));
    }

    if (filters.relevantTo) {
      filtered = filtered.filter((m) =>
        m.relevantToPersonas.includes(filters.relevantTo!)
      );
    }

    if (filters.minEmotionalWeight !== undefined) {
      filtered = filtered.filter((m) => m.emotionalWeight >= filters.minEmotionalWeight!);
    }

    if (filters.minConfidence !== undefined) {
      filtered = filtered.filter((m) => m.confidence >= filters.minConfidence!);
    }

    if (filters.dateRange) {
      if (filters.dateRange.start) {
        filtered = filtered.filter((m) => m.capturedAt >= filters.dateRange!.start!);
      }
      if (filters.dateRange.end) {
        filtered = filtered.filter((m) => m.capturedAt <= filters.dateRange!.end!);
      }
    }

    if (filters.relatedEntities && filters.relatedEntities.length > 0) {
      filtered = filtered.filter((m) =>
        m.relatedEntities?.some((e) => filters.relatedEntities!.includes(e))
      );
    }

    if (filters.excludeRecentlySurfaced && filters.excludeRecentlySurfaced > 0) {
      const cutoff = Date.now() - filters.excludeRecentlySurfaced * 60 * 60 * 1000;
      filtered = filtered.filter(
        (m) => !m.lastSurfaced || m.lastSurfaced.getTime() < cutoff
      );
    }

    // Apply limit
    const totalCount = filtered.length;
    if (filters.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }

    return {
      memories: filtered,
      totalCount,
      queryTimeMs: Date.now() - startTime,
      appliedFilters: filters,
    };
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Memory query failed');

    return {
      memories: [],
      totalCount: 0,
      queryTimeMs: Date.now() - startTime,
      appliedFilters: filters,
    };
  }
}

/**
 * Get memories relevant to a specific persona
 */
export async function getMemoriesForPersona(
  userId: string,
  personaId: PersonaId,
  additionalFilters: Omit<MemoryQueryFilters, 'relevantTo'> = {}
): Promise<MemoryQueryResult> {
  const relevantCategories = PERSONA_MEMORY_INTERESTS[personaId];

  return getMemories(userId, {
    ...additionalFilters,
    relevantTo: personaId,
    categories: additionalFilters.categories || relevantCategories,
  });
}

/**
 * Store a new memory
 */
export async function storeMemory(memory: Omit<SharedMemory, 'id' | 'surfaceCount' | 'capturedAt'>): Promise<SharedMemory> {
  const newMemory: SharedMemory = {
    ...memory,
    id: generateMemoryId(),
    capturedAt: new Date(),
    surfaceCount: 0,
  };

  // Add to cache
  const userMemories = memoryCache.get(memory.userId) || [];
  userMemories.push(newMemory);
  memoryCache.set(memory.userId, userMemories);

  // Persist to Firestore
  await persistMemoryToFirestore(newMemory);

  log.debug(
    {
      userId: memory.userId,
      category: memory.category,
      capturedBy: memory.capturedBy,
    },
    '📝 Memory stored'
  );

  return newMemory;
}

/**
 * Record that a memory was surfaced
 */
export async function recordMemorySurfaced(
  userId: string,
  memoryId: string
): Promise<void> {
  const userMemories = memoryCache.get(userId) || [];
  const memory = userMemories.find((m) => m.id === memoryId);

  if (memory) {
    memory.surfaceCount++;
    memory.lastSurfaced = new Date();

    // Update Firestore
    await updateMemoryInFirestore(memory);
  }
}

// ============================================================================
// CROSS-PERSONA INSIGHTS
// ============================================================================

/**
 * Create a cross-persona insight.
 *
 * Used when one persona discovers something relevant to another.
 */
export async function createInsight(
  insight: Omit<CrossPersonaInsight, 'id' | 'createdAt' | 'delivered'>
): Promise<CrossPersonaInsight> {
  const newInsight: CrossPersonaInsight = {
    ...insight,
    id: generateInsightId(),
    createdAt: new Date(),
    delivered: false,
  };

  // Add to queue for target personas
  for (const targetPersona of insight.forPersonas) {
    const key = `${insight.userId}_${targetPersona}`;
    const queue = insightsQueue.get(key) || [];
    queue.push(newInsight);
    insightsQueue.set(key, queue);
  }

  // Persist to Firestore
  await persistInsightToFirestore(newInsight);

  log.debug(
    {
      userId: insight.userId,
      fromPersona: insight.fromPersona,
      forPersonas: insight.forPersonas,
      priority: insight.priority,
    },
    '💡 Cross-persona insight created'
  );

  return newInsight;
}

/**
 * Get pending insights for a persona
 */
export async function getInsightsForPersona(
  userId: string,
  personaId: PersonaId,
  limit: number = 5
): Promise<CrossPersonaInsight[]> {
  const key = `${userId}_${personaId}`;
  const queue = insightsQueue.get(key) || [];

  // Filter out expired and already delivered
  const now = new Date();
  const valid = queue.filter(
    (i) => !i.delivered && (!i.expiresAt || i.expiresAt > now)
  );

  // Sort by priority (highest first)
  valid.sort((a, b) => b.priority - a.priority);

  return valid.slice(0, limit);
}

/**
 * Mark an insight as delivered
 */
export async function markInsightDelivered(
  userId: string,
  insightId: string
): Promise<void> {
  for (const [key, queue] of insightsQueue.entries()) {
    if (key.startsWith(userId)) {
      const insight = queue.find((i) => i.id === insightId);
      if (insight) {
        insight.delivered = true;
        await updateInsightInFirestore(insight);
        break;
      }
    }
  }
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

async function loadMemoriesFromFirestore(userId: string): Promise<SharedMemory[]> {
  try {
    const { getFirestore } = await import('../firestore-factory.js');
    const db = getFirestore();

    if (!db) return [];

    const snapshot = await db
      .collection('users')
      .doc(userId)
      .collection('shared_memories')
      .orderBy('capturedAt', 'desc')
      .limit(500)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        capturedAt: data.capturedAt?.toDate?.() || new Date(data.capturedAt),
        lastSurfaced: data.lastSurfaced?.toDate?.() || undefined,
      } as SharedMemory;
    });
  } catch (error) {
    log.debug({ userId, error: String(error) }, 'Failed to load memories from Firestore');
    return [];
  }
}

async function persistMemoryToFirestore(memory: SharedMemory): Promise<void> {
  try {
    const { getFirestore } = await import('../firestore-factory.js');
    const db = getFirestore();

    if (!db) return;

    await db
      .collection('users')
      .doc(memory.userId)
      .collection('shared_memories')
      .doc(memory.id)
      .set(memory);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to persist memory to Firestore');
  }
}

async function updateMemoryInFirestore(memory: SharedMemory): Promise<void> {
  try {
    const { getFirestore } = await import('../firestore-factory.js');
    const db = getFirestore();

    if (!db) return;

    await db
      .collection('users')
      .doc(memory.userId)
      .collection('shared_memories')
      .doc(memory.id)
      .update({
        surfaceCount: memory.surfaceCount,
        lastSurfaced: memory.lastSurfaced,
      });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to update memory in Firestore');
  }
}

async function persistInsightToFirestore(insight: CrossPersonaInsight): Promise<void> {
  try {
    const { getFirestore } = await import('../firestore-factory.js');
    const db = getFirestore();

    if (!db) return;

    await db
      .collection('users')
      .doc(insight.userId)
      .collection('cross_persona_insights')
      .doc(insight.id)
      .set(insight);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to persist insight to Firestore');
  }
}

async function updateInsightInFirestore(insight: CrossPersonaInsight): Promise<void> {
  try {
    const { getFirestore } = await import('../firestore-factory.js');
    const db = getFirestore();

    if (!db) return;

    await db
      .collection('users')
      .doc(insight.userId)
      .collection('cross_persona_insights')
      .doc(insight.id)
      .update({
        delivered: insight.delivered,
      });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to update insight in Firestore');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function generateMemoryId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateInsightId(): string {
  return `ins_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear memory cache for a user
 */
export function clearMemoryCache(userId: string): void {
  memoryCache.delete(userId);
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  memoryCache.clear();
  insightsQueue.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats(): {
  userCount: number;
  totalMemories: number;
  totalInsights: number;
} {
  let totalMemories = 0;
  let totalInsights = 0;

  for (const memories of memoryCache.values()) {
    totalMemories += memories.length;
  }

  for (const insights of insightsQueue.values()) {
    totalInsights += insights.length;
  }

  return {
    userCount: memoryCache.size,
    totalMemories,
    totalInsights,
  };
}
