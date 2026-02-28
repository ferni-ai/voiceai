/**
 * Superhuman Intelligence Persistence
 *
 * Handles saving and loading of superhuman intelligence data across sessions.
 * This is what enables "Better Than Human" memory - remembering patterns,
 * struggles, goals, and insights that even humans would forget.
 *
 * @module @ferni/superhuman-persistence
 */

import type {
  SuperhumanLearningData,
  SuperhumanMemoryData,
  SuperhumanPatternData,
} from '../../types/profile/conversation-memory.js';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const logger = createLogger({ module: 'SuperhumanPersistence' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complete superhuman data for a user
 */
export interface SuperhumanUserData {
  userId: string;
  memories: SuperhumanMemoryData[];
  patterns: SuperhumanPatternData[];
  learning?: SuperhumanLearningData;
  lastUpdated: Date;
  version: number;
}

/**
 * Store interface for superhuman data
 */
export interface SuperhumanStore {
  getSuperhumanData: (userId: string) => Promise<SuperhumanUserData | null>;
  saveSuperhumanData: (data: SuperhumanUserData) => Promise<void>;
  deleteSuperhumanData: (userId: string) => Promise<boolean>;
}

// ============================================================================
// CONVERSION FUNCTIONS
// ============================================================================

/**
 * Convert engine exports to persistence format
 */
export function convertMemoriesToPersistence(
  memories: Array<{
    id: string;
    type: string;
    content: string;
    context?: string;
    topics: string[];
    people: string[];
    mentionedAt: Date;
    expectedFollowUpAt?: Date;
    emotionalWeight: string;
    wasVulnerable: boolean;
  }>
): SuperhumanMemoryData[] {
  return memories.map((m) => ({
    id: m.id,
    type: m.type as SuperhumanMemoryData['type'],
    content: m.content,
    context: m.context,
    topics: m.topics,
    people: m.people,
    mentionedAt: m.mentionedAt,
    expectedFollowUpAt: m.expectedFollowUpAt,
    emotionalWeight: m.emotionalWeight as SuperhumanMemoryData['emotionalWeight'],
    wasVulnerable: m.wasVulnerable,
  }));
}

/**
 * Convert pattern data to persistence format
 */
export function convertPatternsToPersistence(
  patterns: Array<{
    type: string;
    description: string;
    confidence: number;
    evidence: string[];
    detectedAt?: Date;
  }>
): SuperhumanPatternData[] {
  return patterns.map((p) => ({
    type: p.type as SuperhumanPatternData['type'],
    description: p.description,
    confidence: p.confidence,
    evidence: p.evidence,
    detectedAt: p.detectedAt || new Date(),
  }));
}

/**
 * Convert learning data to persistence format
 */
export function convertLearningToPersistence(learning: {
  topicTransitions: Array<{ from: string; to: string; count: number }>;
  baseline: {
    avgValence: number;
    avgArousal: number;
    preferredNeed: string;
    speechRateBaseline: number;
    energyBaseline: number;
    typicalTopicFlow?: Map<string, string[]>;
  };
}): SuperhumanLearningData {
  return {
    topicTransitions: learning.topicTransitions,
    baseline: {
      avgValence: learning.baseline.avgValence,
      avgArousal: learning.baseline.avgArousal,
      preferredNeed: learning.baseline.preferredNeed,
      speechRateBaseline: learning.baseline.speechRateBaseline,
      energyBaseline: learning.baseline.energyBaseline,
    },
  };
}

// ============================================================================
// INTEGRATION WITH SUPERHUMAN ENGINES
// ============================================================================

/**
 * Load superhuman data into engines at session start
 */
export async function loadSuperhumanData(
  userId: string,
  sessionId: string,
  store: SuperhumanStore
): Promise<void> {
  try {
    const data = await store.getSuperhumanData(userId);

    if (!data) {
      logger.info({ userId }, 'No existing superhuman data found - starting fresh');
      return;
    }

    // Import engines dynamically to avoid circular dependencies
    const { getProactiveMemoryEngine } = await import('../../conversation/proactive-memory.js');
    const { getPredictiveAnticipationEngine } =
      await import('../../conversation/predictive-anticipation/index.js');

    // Load memories into proactive memory engine
    const memoryEngine = getProactiveMemoryEngine(sessionId);
    const memories = data.memories ?? [];
    if (memories.length > 0) {
      // Convert to engine format (they're the same structure, but engine has additional runtime fields)
      const memoriesForEngine = memories.map((m) => ({
        ...m,
        surfaced: false,
        surfaceCount: 0,
        sessionId: 'previous', // Mark as from previous session
      }));
      memoryEngine.importMemories(memoriesForEngine);
      logger.info(
        { userId, memoryCount: memories.length },
        '🧠 Loaded memories from previous sessions'
      );
    }

    // Load learning into predictive anticipation engine
    const anticipationEngine = getPredictiveAnticipationEngine(sessionId);
    if (data.learning) {
      // Add contexts property and cast types for compatibility
      const learningWithContexts = {
        topicTransitions: data.learning.topicTransitions?.map((t) => ({
          ...t,
          contexts: [] as string[],
        })),
        baseline: data.learning.baseline
          ? {
              ...data.learning.baseline,
              preferredNeed: (data.learning.baseline.preferredNeed ||
                'unknown') as import('../../conversation/predictive-anticipation/index.js').PredictedNeed,
            }
          : undefined,
      };
      anticipationEngine.importLearning(learningWithContexts);
      logger.info({ userId }, '🧠 Loaded learning patterns from previous sessions');
    }

    const patterns = data.patterns ?? [];
    logger.info(
      {
        userId,
        memoriesLoaded: memories.length,
        patternsLoaded: patterns.length,
        hasLearning: !!data.learning,
      },
      '✅ Superhuman data loaded successfully'
    );
  } catch (error) {
    logger.error({ userId, error }, 'Failed to load superhuman data');
  }
}

/**
 * Save superhuman data at session end
 */
export async function saveSuperhumanData(
  userId: string,
  sessionId: string,
  store: SuperhumanStore
): Promise<void> {
  try {
    // Import engines dynamically
    const { getProactiveMemoryEngine } = await import('../../conversation/proactive-memory.js');
    const { getPredictiveAnticipationEngine } =
      await import('../../conversation/predictive-anticipation/index.js');

    const memoryEngine = getProactiveMemoryEngine(sessionId);
    const anticipationEngine = getPredictiveAnticipationEngine(sessionId);

    // Export from engines
    const memories = memoryEngine.exportMemories();
    const patterns = memoryEngine.getAllPatterns();
    const learning = anticipationEngine.exportLearning();

    // Get existing data to merge
    const existingData = await store.getSuperhumanData(userId);

    // Merge memories (keep existing, add new)
    const existingMemoryIds = new Set((existingData?.memories || []).map((m) => m.id));
    const newMemories = memories.filter((m) => !existingMemoryIds.has(m.id));
    const mergedMemories = [...(existingData?.memories || []), ...newMemories];

    // Keep only most recent 100 memories to prevent unbounded growth
    const sortedMemories = mergedMemories
      .sort((a, b) => new Date(b.mentionedAt).getTime() - new Date(a.mentionedAt).getTime())
      .slice(0, 100);

    // Merge patterns (replace with newer)
    const existingPatternDescriptions = new Set(patterns.map((p) => p.description));
    const oldPatterns = (existingData?.patterns || []).filter(
      (p) => !existingPatternDescriptions.has(p.description)
    );
    const mergedPatterns = [...oldPatterns, ...convertPatternsToPersistence(patterns)];

    // Merge learning (update with latest)
    const mergedLearning = learning
      ? convertLearningToPersistence(learning)
      : existingData?.learning;

    const dataToSave: SuperhumanUserData = {
      userId,
      memories: convertMemoriesToPersistence(sortedMemories),
      patterns: mergedPatterns.slice(0, 50), // Keep max 50 patterns
      learning: mergedLearning,
      lastUpdated: new Date(),
      version: (existingData?.version || 0) + 1,
    };

    await store.saveSuperhumanData(dataToSave);

    logger.info(
      {
        userId,
        memoriesSaved: dataToSave.memories.length,
        patternsSaved: dataToSave.patterns.length,
        version: dataToSave.version,
      },
      '✅ Superhuman data saved successfully'
    );
  } catch (error) {
    logger.error({ userId, error }, 'Failed to save superhuman data');
  }
}

// ============================================================================
// FIRESTORE INTEGRATION
// ============================================================================

/**
 * Create a Firestore-backed superhuman store
 */
export function createFirestoreSuperhumanStore(
  getFirestore: () => Promise<{
    collection: (name: string) => {
      doc: (id: string) => {
        get: () => Promise<{ exists: boolean; data: () => unknown }>;
        set: (data: unknown, opts?: { merge?: boolean }) => Promise<void>;
        delete: () => Promise<void>;
      };
    };
  }>
): SuperhumanStore {
  const COLLECTION = 'superhuman_intelligence';

  return {
    async getSuperhumanData(userId: string): Promise<SuperhumanUserData | null> {
      try {
        const db = await getFirestore();
        const doc = await db.collection(COLLECTION).doc(userId).get();

        if (!doc.exists) return null;

        const data = doc.data() as SuperhumanUserData;

        // Hydrate dates
        return {
          ...data,
          memories: data.memories.map((m) => ({
            ...m,
            mentionedAt: new Date(m.mentionedAt),
            expectedFollowUpAt: m.expectedFollowUpAt ? new Date(m.expectedFollowUpAt) : undefined,
          })),
          patterns: data.patterns.map((p) => ({
            ...p,
            detectedAt: new Date(p.detectedAt),
          })),
          lastUpdated: new Date(data.lastUpdated),
        };
      } catch (error) {
        logger.error({ userId, error }, 'Error getting superhuman data from Firestore');
        return null;
      }
    },

    async saveSuperhumanData(data: SuperhumanUserData): Promise<void> {
      try {
        const db = await getFirestore();

        // Serialize dates for Firestore
        const serialized = {
          ...data,
          memories: data.memories.map((m) => ({
            ...m,
            mentionedAt: m.mentionedAt.toISOString(),
            expectedFollowUpAt: m.expectedFollowUpAt?.toISOString(),
          })),
          patterns: data.patterns.map((p) => ({
            ...p,
            detectedAt: p.detectedAt.toISOString(),
          })),
          lastUpdated: data.lastUpdated.toISOString(),
        };

        await db
          .collection(COLLECTION)
          .doc(data.userId)
          .set(cleanForFirestore(serialized), { merge: true });
      } catch (error) {
        logger.error({ userId: data.userId, error }, 'Error saving superhuman data to Firestore');
        throw error;
      }
    },

    async deleteSuperhumanData(userId: string): Promise<boolean> {
      try {
        const db = await getFirestore();
        await db.collection(COLLECTION).doc(userId).delete();
        return true;
      } catch (error) {
        logger.error({ userId, error }, 'Error deleting superhuman data from Firestore');
        return false;
      }
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const superhumanPersistence = {
  load: loadSuperhumanData,
  save: saveSuperhumanData,
  createFirestoreStore: createFirestoreSuperhumanStore,
  convertMemories: convertMemoriesToPersistence,
  convertPatterns: convertPatternsToPersistence,
  convertLearning: convertLearningToPersistence,
};
