/**
 * Memory Lifecycle Integration
 *
 * Connects consolidation, decay, and graph operations to actual storage.
 * This module bridges the gap between the lifecycle engines (Phase 2)
 * and the underlying Firestore/vector storage.
 *
 * Philosophy: The consolidator, decay manager, and graph operate on MemoryItem
 * abstractions. This module handles the translation to/from persistent storage.
 *
 * @module memory/lifecycle-integration
 */

import { cleanForFirestore, getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreVectorStore } from '../firestore-vector-store/index.js';
import type { MemoryItem } from '../interfaces/index.js';
import { getMemoryConsolidator, type ConsolidatedMemory } from '../memory-consolidator.js';
import { getMemoryDecayManager } from '../memory-decay.js';
import { getMemoryGraph, type MemoryLink } from '../memory-graph.js';

const log = createLogger({ module: 'LifecycleIntegration' });

// ============================================================================
// TYPES
// ============================================================================

export interface LifecycleResult {
  consolidation: {
    memoriesProcessed: number;
    groupsFound: number;
    consolidated: number;
    saved: number;
  };
  decay: {
    memoriesAnalyzed: number;
    memoriesDecayed: number;
    memoriesArchived: number;
    memoriesProtected: number;
  };
  links: {
    created: number;
    strengthened: number;
  };
  durationMs: number;
}

export interface StoredMemoryDocument {
  id: string;
  userId: string;
  content: string;
  type: string;
  strength: number;
  emotionalWeight: number;
  topics?: string[];
  embedding?: number[];
  lastAccessed?: Date;
  reactivationCount?: number;
  archived?: boolean;
  consolidatedFrom?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

/**
 * Get all memories for a user from Firestore
 */
export async function getUserMemories(userId: string): Promise<MemoryItem[]> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, returning empty memories');
    return [];
  }

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memories')
      .where('archived', '!=', true)
      .orderBy('archived')
      .orderBy('createdAt', 'desc')
      .limit(500) // Cap to prevent memory issues
      .get();

    const memories: MemoryItem[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as StoredMemoryDocument;
      memories.push(convertToMemoryItem(data));
    }

    log.debug({ userId, count: memories.length }, 'Loaded user memories');
    return memories;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load user memories');
    return [];
  }
}

/**
 * Save a memory to Firestore
 */
export async function saveMemory(
  userId: string,
  memory: MemoryItem,
  strength = 1.0
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId, memoryId: memory.id }, 'Firestore not available, memory not saved');
    return false;
  }

  try {
    const doc: StoredMemoryDocument = {
      id: memory.id,
      userId,
      content: memory.content,
      type: memory.type,
      strength,
      emotionalWeight: memory.emotionalWeight,
      topics: memory.topics,
      embedding: memory.embedding,
      lastAccessed: new Date(),
      reactivationCount: 0,
      archived: false,
      createdAt: memory.timestamp,
      updatedAt: new Date(),
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memories')
      .doc(memory.id)
      .set(cleanForFirestore(doc), { merge: true });

    // Also index to vector store for semantic search
    if (memory.embedding) {
      const vectorStore = getFirestoreVectorStore();
      await vectorStore.addDocument({
        id: `memory_${userId}_${memory.id}`,
        text: memory.content,
        embedding: memory.embedding,
        metadata: {
          userId,
          source: 'memory',
          memoryId: memory.id,
          type: memory.type,
          topics: memory.topics,
          timestamp: memory.timestamp,
        },
      });
    }

    return true;
  } catch (error) {
    log.error({ error: String(error), userId, memoryId: memory.id }, 'Failed to save memory');
    return false;
  }
}

/**
 * Update memory strength (for decay)
 */
export async function updateMemoryStrength(
  userId: string,
  memoryId: string,
  strength: number,
  archived = false
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memories')
      .doc(memoryId)
      .update(
        cleanForFirestore({
          strength,
          archived,
          updatedAt: new Date(),
        })
      );

    return true;
  } catch (error) {
    log.error({ error: String(error), userId, memoryId }, 'Failed to update memory strength');
    return false;
  }
}

/**
 * Reinforce a memory (boost strength on access)
 */
export async function reinforceMemory(
  userId: string,
  memoryId: string,
  boostFactor = 1.5
): Promise<{ previousStrength: number; newStrength: number }> {
  const db = getFirestoreDb();
  if (!db) {
    return { previousStrength: 0.5, newStrength: 0.5 };
  }

  try {
    const docRef = db.collection('bogle_users').doc(userId).collection('memories').doc(memoryId);

    const doc = await docRef.get();
    if (!doc.exists) {
      return { previousStrength: 0.5, newStrength: 0.5 };
    }

    const data = doc.data() as StoredMemoryDocument;
    const previousStrength = data.strength ?? 0.5;
    const reactivationCount = (data.reactivationCount ?? 0) + 1;
    const newStrength = Math.min(1.0, previousStrength * boostFactor);

    await docRef.update(
      cleanForFirestore({
        strength: newStrength,
        lastAccessed: new Date(),
        reactivationCount,
        archived: false, // Un-archive if previously archived
        updatedAt: new Date(),
      })
    );

    log.debug(
      { userId, memoryId, previousStrength, newStrength, reactivationCount },
      'Memory reinforced'
    );

    return { previousStrength, newStrength };
  } catch (error) {
    log.error({ error: String(error), userId, memoryId }, 'Failed to reinforce memory');
    return { previousStrength: 0.5, newStrength: 0.5 };
  }
}

/**
 * Save a consolidated memory
 */
export async function saveConsolidatedMemory(
  userId: string,
  consolidated: ConsolidatedMemory
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    // Save to consolidated_memories collection
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('consolidated_memories')
      .doc(consolidated.id)
      .set(
        cleanForFirestore({
          ...consolidated,
          consolidatedAt: consolidated.consolidatedAt,
          evolution: consolidated.evolution.map((e) => ({
            ...e,
            date: e.date,
          })),
        })
      );

    // Also save as a regular memory for retrieval
    const memoryItem = convertConsolidatedToMemoryItem(consolidated);
    await saveMemory(userId, memoryItem, 1.0);

    // Mark source memories as consolidated (but don't delete)
    for (const sourceId of consolidated.sourceMemoryIds) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('memories')
        .doc(sourceId)
        .update(
          cleanForFirestore({
            consolidatedInto: consolidated.id,
            updatedAt: new Date(),
          })
        );
    }

    log.debug(
      { userId, consolidatedId: consolidated.id, sourceCount: consolidated.sourceMemoryIds.length },
      'Saved consolidated memory'
    );

    return true;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to save consolidated memory');
    return false;
  }
}

// ============================================================================
// LIFECYCLE OPERATIONS
// ============================================================================

/**
 * Run full lifecycle maintenance for a user
 * This is the deep integration that actually affects storage
 */
export async function runLifecycleMaintenance(userId: string): Promise<LifecycleResult> {
  const startTime = Date.now();
  const result: LifecycleResult = {
    consolidation: { memoriesProcessed: 0, groupsFound: 0, consolidated: 0, saved: 0 },
    decay: { memoriesAnalyzed: 0, memoriesDecayed: 0, memoriesArchived: 0, memoriesProtected: 0 },
    links: { created: 0, strengthened: 0 },
    durationMs: 0,
  };

  try {
    // 1. Load all memories
    const memories = await getUserMemories(userId);
    result.decay.memoriesAnalyzed = memories.length;

    if (memories.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // 2. Run consolidation
    const consolidator = getMemoryConsolidator();
    const consolidationResult = await consolidator.runConsolidationPass(memories);

    result.consolidation.memoriesProcessed = consolidationResult.memoriesProcessed;
    result.consolidation.groupsFound = consolidationResult.groupsFound;
    result.consolidation.consolidated = consolidationResult.consolidated.length;

    // Save consolidated memories
    for (const consolidated of consolidationResult.consolidated) {
      const saved = await saveConsolidatedMemory(userId, consolidated);
      if (saved) {
        result.consolidation.saved++;
      }
    }

    // 3. Apply decay
    const decayManager = getMemoryDecayManager();
    const decayingMemories = memories.map((m) => decayManager.initializeDecay(m));
    const pruneResult = decayManager.pruneWeakMemories(decayingMemories);

    result.decay.memoriesArchived = pruneResult.archived.length;
    result.decay.memoriesProtected =
      result.decay.memoriesAnalyzed -
      pruneResult.archived.length -
      pruneResult.strengthDistribution.weak;

    // Update strength in storage
    for (const memory of decayingMemories) {
      const decayResult = decayManager.calculateStrength(memory);
      const shouldArchive = pruneResult.archived.includes(memory.id);

      if (decayResult.currentStrength < memory.strength || shouldArchive) {
        await updateMemoryStrength(userId, memory.id, decayResult.currentStrength, shouldArchive);
        result.decay.memoriesDecayed++;
      }
    }

    // 4. Create/strengthen graph links for strong memories
    const graph = getMemoryGraph();
    const strongMemories = decayingMemories.filter(
      (m) => decayManager.calculateStrength(m).currentStrength > 0.6
    );

    for (const memory of strongMemories.slice(0, 20)) {
      // Limit to prevent slowness
      const existingForLinks = strongMemories
        .filter((m) => m.id !== memory.id)
        .map((m) => ({
          id: m.id,
          content: m.content,
          topics: m.topics,
          personMentioned: m.personMentioned,
        }));

      const links = await graph.detectLinks(userId, memory.id, memory.content, existingForLinks);
      result.links.created += links.length;
    }

    result.durationMs = Date.now() - startTime;

    log.info(
      {
        userId,
        ...result,
      },
      'Lifecycle maintenance complete'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Lifecycle maintenance failed');
    result.durationMs = Date.now() - startTime;
    return result;
  }
}

/**
 * Create links for a new memory automatically
 * Call this when a new memory is written
 */
export async function createLinksForNewMemory(
  userId: string,
  newMemory: MemoryItem
): Promise<MemoryLink[]> {
  try {
    // Get existing memories
    const existingMemories = await getUserMemories(userId);

    if (existingMemories.length === 0) {
      return [];
    }

    // Convert to format expected by detectLinks
    const existingForLinks = existingMemories.slice(0, 50).map((m) => ({
      id: m.id,
      content: m.content,
      topics: m.topics,
      personMentioned: m.personMentioned,
    }));

    // Detect and create links
    const graph = getMemoryGraph();
    const links = await graph.detectLinks(
      userId,
      newMemory.id,
      newMemory.content,
      existingForLinks
    );

    log.debug(
      { userId, memoryId: newMemory.id, linksCreated: links.length },
      'Created links for new memory'
    );

    return links;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to create links for new memory');
    return [];
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function convertToMemoryItem(doc: StoredMemoryDocument): MemoryItem {
  return {
    id: doc.id,
    type: doc.type as MemoryItem['type'],
    content: doc.content,
    timestamp: doc.createdAt,
    emotionalWeight: doc.emotionalWeight,
    relevanceDecay: 1 - (doc.strength ?? 1),
    baseImportance: doc.strength ?? 0.5,
    topics: doc.topics,
    embedding: doc.embedding,
    source: {
      collection: 'memories',
      documentId: doc.id,
    },
  };
}

function convertConsolidatedToMemoryItem(consolidated: ConsolidatedMemory): MemoryItem {
  return {
    id: consolidated.id,
    type: 'topic',
    content: consolidated.consolidatedContent,
    timestamp: consolidated.consolidatedAt,
    emotionalWeight:
      consolidated.emotionalSignature === 'heavy'
        ? 0.9
        : consolidated.emotionalSignature === 'medium'
          ? 0.6
          : 0.3,
    relevanceDecay: 0,
    baseImportance: 0.8 + Math.min(0.2, consolidated.frequency * 0.02),
    topics: [consolidated.topic, ...consolidated.themes],
    embedding: consolidated.embedding,
    source: {
      collection: 'consolidated_memories',
      documentId: consolidated.id,
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getUserMemories,
  saveMemory,
  updateMemoryStrength,
  reinforceMemory,
  saveConsolidatedMemory,
  runLifecycleMaintenance,
  createLinksForNewMemory,
};
