/**
 * Memory Lifecycle Management
 *
 * Coordinates memory consolidation, decay, and graph maintenance.
 * This is the "Better Than Human" memory system that:
 * - Consolidates related memories into richer representations
 * - Applies time-based decay to less accessed memories
 * - Maintains the memory graph for spreading activation
 *
 * Philosophy: Like human memory, we don't need to remember every detail.
 * We keep the essence while letting go of redundancy, strengthening
 * frequently accessed memories while naturally forgetting the trivial.
 *
 * @module memory/memory-lifecycle
 */

import { createLogger } from '../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../utils/firestore-utils.js';
import { getMemoryConsolidator, type ConsolidatedMemory } from './memory-consolidator.js';
import type { MemoryItem } from './advanced-retrieval.js';

const log = createLogger({ module: 'MemoryLifecycle' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConsolidationSummary {
  consolidated: number;
  processed: number;
  groups: number;
  durationMs: number;
}

export interface DecayResult {
  decayed: number;
  archived: number;
  durationMs: number;
}

export interface MaintenanceResult {
  consolidation: ConsolidationSummary;
  decay: DecayResult;
  graphPruned: number;
  durationMs: number;
}

// ============================================================================
// MEMORY LOADING
// ============================================================================

/**
 * Load memories for a user from Firestore
 */
async function loadUserMemories(userId: string): Promise<MemoryItem[]> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available');
    return [];
  }

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memories')
      .orderBy('timestamp', 'desc')
      .limit(500) // Reasonable limit for consolidation
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type || 'general',
        content: data.content || '',
        timestamp: data.timestamp?.toDate() || new Date(),
        emotionalWeight: data.emotionalWeight || 0.5,
        relevanceDecay: data.relevanceDecay || 0,
        baseImportance: data.baseImportance || 0.5,
        topics: data.topics || [],
        source: data.source || { collection: 'memories', documentId: doc.id },
        embedding: data.embedding,
      } as MemoryItem;
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load memories');
    return [];
  }
}

// ============================================================================
// CONSOLIDATION
// ============================================================================

/**
 * Consolidate a user's related memories
 *
 * This function:
 * 1. Loads all memories for the user
 * 2. Finds groups of related memories
 * 3. Consolidates each group into a richer representation
 * 4. Persists the consolidated memories
 */
export async function consolidateUserMemories(userId: string): Promise<ConsolidationSummary> {
  const startTime = Date.now();
  const consolidator = getMemoryConsolidator();

  try {
    // Load memories
    const memories = await loadUserMemories(userId);
    if (memories.length < 5) {
      // Not enough memories to consolidate
      return {
        consolidated: 0,
        processed: memories.length,
        groups: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Find consolidation candidates
    const groups = await consolidator.findConsolidationCandidates(memories);
    if (groups.size === 0) {
      return {
        consolidated: 0,
        processed: memories.length,
        groups: 0,
        durationMs: Date.now() - startTime,
      };
    }

    let consolidatedCount = 0;

    // Process each group
    for (const [topic, groupMemories] of groups) {
      try {
        const result = await consolidator.consolidateMemories(groupMemories, topic);

        // Check if it's a Result type (v2) or ConsolidationResult (v1)
        if ('ok' in result && result.ok) {
          // v2 Result<ConsolidatedMemory, MemoryError>
          await persistConsolidatedMemory(userId, result.value);
          consolidatedCount++;
        } else if ('consolidated' in result && Array.isArray(result.consolidated)) {
          // v1 ConsolidationResult
          for (const consolidated of result.consolidated) {
            await persistConsolidatedMemory(userId, consolidated);
            consolidatedCount++;
          }
        }
      } catch (groupError) {
        log.warn(
          { error: String(groupError), userId, topic },
          'Failed to consolidate group (continuing)'
        );
      }
    }

    return {
      consolidated: consolidatedCount,
      processed: memories.length,
      groups: groups.size,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Memory consolidation failed');
    return {
      consolidated: 0,
      processed: 0,
      groups: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Persist a consolidated memory to Firestore
 */
async function persistConsolidatedMemory(
  userId: string,
  consolidated: ConsolidatedMemory
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('consolidated_memories')
      .doc(consolidated.id)
      .set(
        cleanForFirestore({
          ...consolidated,
          consolidatedAt: new Date(),
        })
      );

    log.debug(
      { userId, memoryId: consolidated.id, topic: consolidated.topic },
      '📦 Consolidated memory persisted'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to persist consolidated memory');
  }
}

// ============================================================================
// MEMORY DECAY
// ============================================================================

/**
 * Apply time-based decay to memories
 *
 * Memories that haven't been accessed recently will have their
 * relevance scores reduced. Highly decayed memories may be archived.
 */
export async function applyMemoryDecay(userId: string): Promise<DecayResult> {
  const startTime = Date.now();
  const db = getFirestoreDb();

  if (!db) {
    return { decayed: 0, archived: 0, durationMs: 0 };
  }

  try {
    const memories = await loadUserMemories(userId);
    const now = new Date();
    let decayed = 0;
    let archived = 0;

    const batch = db.batch();

    for (const memory of memories) {
      // Calculate days since memory was created
      const ageMs = now.getTime() - memory.timestamp.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      // Apply decay formula: decay = 0.01 per day, capped at 0.9
      const decay = Math.min(0.9, ageDays * 0.01);

      // Only update if decay changed significantly
      if (Math.abs(decay - (memory.relevanceDecay || 0)) > 0.05) {
        const memRef = db
          .collection('bogle_users')
          .doc(userId)
          .collection('memories')
          .doc(memory.id);

        // If decay is very high, archive the memory
        if (decay > 0.8 && memory.emotionalWeight < 0.3) {
          batch.update(memRef, { archived: true, relevanceDecay: decay });
          archived++;
        } else {
          batch.update(memRef, { relevanceDecay: decay });
          decayed++;
        }
      }
    }

    await batch.commit();

    return {
      decayed,
      archived,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Memory decay failed');
    return {
      decayed: 0,
      archived: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// GRAPH PRUNING
// ============================================================================

/**
 * Prune weak links in the memory graph
 *
 * Removes connections that have fallen below a threshold strength,
 * keeping the graph focused on meaningful relationships.
 */
export async function pruneMemoryGraph(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) return 0;

  try {
    // Load graph edges
    const edgesSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_graph_edges')
      .where('strength', '<', 0.2) // Weak links
      .limit(100)
      .get();

    if (edgesSnapshot.empty) return 0;

    const batch = db.batch();
    for (const doc of edgesSnapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();

    return edgesSnapshot.size;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Graph pruning failed');
    return 0;
  }
}

// ============================================================================
// FULL MAINTENANCE
// ============================================================================

/**
 * Run full memory maintenance for a user
 *
 * This includes:
 * 1. Memory consolidation
 * 2. Decay application
 * 3. Graph pruning
 */
export async function runMemoryMaintenance(userId: string): Promise<MaintenanceResult> {
  const startTime = Date.now();

  log.info({ userId }, '🧠 Starting memory maintenance');

  // Run all maintenance tasks
  const [consolidation, decay, graphPruned] = await Promise.all([
    consolidateUserMemories(userId),
    applyMemoryDecay(userId),
    pruneMemoryGraph(userId),
  ]);

  const result: MaintenanceResult = {
    consolidation,
    decay,
    graphPruned,
    durationMs: Date.now() - startTime,
  };

  log.info(
    {
      userId,
      consolidated: consolidation.consolidated,
      decayed: decay.decayed,
      archived: decay.archived,
      graphPruned,
      durationMs: result.durationMs,
    },
    '🧠 Memory maintenance completed'
  );

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  consolidateUserMemories,
  applyMemoryDecay,
  pruneMemoryGraph,
  runMemoryMaintenance,
};
