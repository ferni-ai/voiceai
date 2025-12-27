/**
 * Collective Learning Store
 *
 * Persists community insights and agent evolution data to Firestore.
 * Automatically loads on startup and saves on shutdown.
 *
 * Collections:
 * - community_insights: Cross-user learning patterns
 * - agent_evolution: Persona-specific learnings and adjustments
 * - learning_signals: Raw signals for batch processing
 */

import { getLogger } from '../../utils/safe-logger.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import {
  getCommunityInsights,
  getAgentEvolution,
  type CommunityResponsePattern,
  type CommunityJourneyPattern,
  type EffectiveQuestion,
  type StoryResonance,
  type PersonaEvolutionState,
} from '../../intelligence/index.js';

// ============================================================================
// TYPES
// ============================================================================

interface FirestoreDB {
  collection: (path: string) => CollectionRef;
  runTransaction: <T>(fn: (transaction: Transaction) => Promise<T>) => Promise<T>;
}

interface CollectionRef {
  doc: (id: string) => DocumentRef;
  get: () => Promise<QuerySnapshot>;
  where: (field: string, op: string, value: unknown) => Query;
}

interface DocumentRef {
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
  get: () => Promise<DocumentSnapshot>;
  delete: () => Promise<void>;
  update: (data: unknown) => Promise<void>;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
}

interface QuerySnapshot {
  docs: DocumentSnapshot[];
  empty: boolean;
}

interface Query {
  get: () => Promise<QuerySnapshot>;
  limit: (n: number) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
}

interface Transaction {
  get: (ref: DocumentRef) => Promise<DocumentSnapshot>;
  set: (ref: DocumentRef, data: unknown, options?: { merge?: boolean }) => Transaction;
  update: (ref: DocumentRef, data: unknown) => Transaction;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export class CollectiveLearningStore {
  private db: FirestoreDB | null = null;
  private initialized = false;

  // Collection names
  private readonly COMMUNITY_INSIGHTS = 'community_insights';
  private readonly AGENT_EVOLUTION = 'agent_evolution';
  private readonly LEARNING_SIGNALS = 'learning_signals';

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { Firestore } = await import('@google-cloud/firestore');

      this.db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      }) as unknown as FirestoreDB;

      this.initialized = true;
      getLogger().info('📚 Collective learning store initialized');

      // Load existing data in BACKGROUND - don't block startup!
      // This is optional enhancement data, not critical for operation
      this.loadAllData().catch((error) => {
        getLogger().debug({ error }, 'Background collective learning load failed (non-blocking)');
      });
    } catch (error) {
      getLogger().warn(
        { error },
        'Collective learning store initialization skipped (no Firestore)'
      );
      // Not a fatal error - we can operate without persistence
    }
  }

  // ==========================================================================
  // LOAD ON STARTUP
  // ==========================================================================

  /**
   * Load all community insights and evolution data on startup
   * Runs with timeout to prevent blocking startup
   */
  async loadAllData(): Promise<void> {
    if (!this.db) return;

    // Timeout for all Firestore operations - don't let them block forever
    const LOAD_TIMEOUT_MS = 3000;

    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS);
    });

    try {
      // Load in parallel with timeout
      const result = await Promise.race([
        Promise.all([this.loadCommunityInsights(), this.loadAgentEvolution()]),
        timeoutPromise,
      ]);

      if (result === 'timeout') {
        getLogger().warn('Collective learning load timed out after 3s (continuing without data)');
        return;
      }

      getLogger().info('📖 Collective learning data loaded from Firestore');
    } catch (error) {
      getLogger().warn({ error }, 'Failed to load collective learning data');
    }
  }

  private async loadCommunityInsights(): Promise<void> {
    if (!this.db) return;

    const insights = getCommunityInsights();

    try {
      // Load all documents in PARALLEL (not sequential!)
      const [patternsSnap, questionsSnap, storiesSnap, journeysSnap] = await Promise.all([
        this.db.collection(this.COMMUNITY_INSIGHTS).doc('patterns').get(),
        this.db.collection(this.COMMUNITY_INSIGHTS).doc('questions').get(),
        this.db.collection(this.COMMUNITY_INSIGHTS).doc('stories').get(),
        this.db.collection(this.COMMUNITY_INSIGHTS).doc('journeys').get(),
      ]);

      const data: {
        patterns?: CommunityResponsePattern[];
        journeyPatterns?: CommunityJourneyPattern[];
        effectiveQuestions?: EffectiveQuestion[];
        storyResonance?: StoryResonance[];
      } = {};

      if (patternsSnap.exists) {
        const patternData = patternsSnap.data();
        if (patternData?.patterns) {
          data.patterns = this.hydrateArray(
            patternData.patterns as unknown[]
          ) as CommunityResponsePattern[];
        }
      }

      if (questionsSnap.exists) {
        const questionData = questionsSnap.data();
        if (questionData?.questions) {
          data.effectiveQuestions = this.hydrateArray(
            questionData.questions as unknown[]
          ) as EffectiveQuestion[];
        }
      }

      if (storiesSnap.exists) {
        const storyData = storiesSnap.data();
        if (storyData?.stories) {
          data.storyResonance = this.hydrateArray(
            storyData.stories as unknown[]
          ) as StoryResonance[];
        }
      }

      if (journeysSnap.exists) {
        const journeyData = journeysSnap.data();
        if (journeyData?.journeys) {
          data.journeyPatterns = this.hydrateArray(
            journeyData.journeys as unknown[]
          ) as CommunityJourneyPattern[];
        }
      }

      insights.importInsights(data);

      getLogger().debug(
        {
          patterns: data.patterns?.length || 0,
          questions: data.effectiveQuestions?.length || 0,
          stories: data.storyResonance?.length || 0,
        },
        'Community insights loaded'
      );
    } catch (error) {
      getLogger().warn({ error }, 'Failed to load community insights');
    }
  }

  private async loadAgentEvolution(): Promise<void> {
    if (!this.db) return;

    const evolution = getAgentEvolution();

    try {
      const snap = await this.db.collection(this.AGENT_EVOLUTION).get();

      if (!snap.empty) {
        const states: Record<string, PersonaEvolutionState> = {};

        for (const doc of snap.docs) {
          const data = doc.data();
          if (data) {
            states[doc.id] = this.hydrateObject(data) as unknown as PersonaEvolutionState;
          }
        }

        evolution.importState(states);

        getLogger().debug({ personaCount: Object.keys(states).length }, 'Agent evolution loaded');
      }
    } catch (error) {
      getLogger().warn({ error }, 'Failed to load agent evolution');
    }
  }

  // ==========================================================================
  // SAVE ON SHUTDOWN
  // ==========================================================================

  /**
   * Save all community insights and evolution data on shutdown
   */
  async saveAllData(): Promise<void> {
    if (!this.db) return;

    try {
      // Save community insights
      await this.saveCommunityInsights();

      // Save agent evolution states
      await this.saveAgentEvolution();

      getLogger().info('💾 Collective learning data saved to Firestore');
    } catch (error) {
      getLogger().error({ error }, 'Failed to save collective learning data');
    }
  }

  private async saveCommunityInsights(): Promise<void> {
    if (!this.db) return;

    const insights = getCommunityInsights();
    const exported = insights.exportInsights();

    try {
      // Save patterns
      if (exported.patterns.length > 0) {
        await this.db
          .collection(this.COMMUNITY_INSIGHTS)
          .doc('patterns')
          .set(
            cleanForFirestore({ patterns: exported.patterns, updatedAt: new Date().toISOString() }),
            { merge: true }
          );
      }

      // Save questions
      if (exported.effectiveQuestions.length > 0) {
        await this.db
          .collection(this.COMMUNITY_INSIGHTS)
          .doc('questions')
          .set(
            cleanForFirestore({ questions: exported.effectiveQuestions, updatedAt: new Date().toISOString() }),
            { merge: true }
          );
      }

      // Save stories
      if (exported.storyResonance.length > 0) {
        await this.db
          .collection(this.COMMUNITY_INSIGHTS)
          .doc('stories')
          .set(
            cleanForFirestore({ stories: exported.storyResonance, updatedAt: new Date().toISOString() }),
            { merge: true }
          );
      }

      // Save journeys
      if (exported.journeyPatterns.length > 0) {
        await this.db
          .collection(this.COMMUNITY_INSIGHTS)
          .doc('journeys')
          .set(
            cleanForFirestore({ journeys: exported.journeyPatterns, updatedAt: new Date().toISOString() }),
            { merge: true }
          );
      }

      getLogger().debug(
        {
          patterns: exported.patterns.length,
          questions: exported.effectiveQuestions.length,
          stories: exported.storyResonance.length,
        },
        'Community insights saved'
      );
    } catch (error) {
      getLogger().error({ error }, 'Failed to save community insights');
    }
  }

  private async saveAgentEvolution(): Promise<void> {
    if (!this.db) return;

    const evolution = getAgentEvolution();
    const states = evolution.exportState();

    try {
      for (const [personaId, state] of states.entries()) {
        await this.db
          .collection(this.AGENT_EVOLUTION)
          .doc(personaId)
          .set(removeUndefined({ ...state, updatedAt: new Date().toISOString() }), { merge: true });
      }

      getLogger().debug({ personaCount: states.size }, 'Agent evolution saved');
    } catch (error) {
      getLogger().error({ error }, 'Failed to save agent evolution');
    }
  }

  // ==========================================================================
  // INCREMENTAL UPDATES (Called during conversations)
  // ==========================================================================

  /**
   * Save a batch of learning signals for later processing
   * Called at the end of each session
   */
  async saveLearningSignals(
    sessionId: string,
    personaId: string,
    signals: Array<{
      type: string;
      context: Record<string, unknown>;
      outcome: Record<string, unknown>;
      timestamp: Date;
    }>
  ): Promise<void> {
    if (!this.db || signals.length === 0) return;

    try {
      const docId = `${sessionId}_${Date.now()}`;
      await this.db
        .collection(this.LEARNING_SIGNALS)
        .doc(docId)
        .set(
          removeUndefined({
            sessionId,
            personaId,
            signals,
            createdAt: new Date().toISOString(),
            processed: false,
          })
        );

      getLogger().debug({ sessionId, signalCount: signals.length }, 'Learning signals saved');
    } catch (error) {
      getLogger().warn({ error }, 'Failed to save learning signals');
    }
  }

  /**
   * Increment a counter atomically (for high-frequency signals)
   */
  async incrementCounter(
    collection: string,
    docId: string,
    field: string,
    amount = 1
  ): Promise<void> {
    if (!this.db) return;

    try {
      const docRef = this.db.collection(collection).doc(docId);

      await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        const current = doc.exists ? (doc.data()?.[field] as number) || 0 : 0;
        transaction.set(
          docRef,
          { [field]: current + amount, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      });
    } catch (error) {
      getLogger().debug({ error }, 'Failed to increment counter');
    }
  }

  // ==========================================================================
  // EVOLUTION CYCLE (Run periodically)
  // ==========================================================================

  /**
   * Run evolution cycle for all personas
   * This should be called by a scheduled Cloud Function
   */
  async runEvolutionCycle(): Promise<{
    personasProcessed: number;
    patternsComputed: number;
    adjustmentsCreated: number;
  }> {
    const insights = getCommunityInsights();
    const evolution = getAgentEvolution();

    // Recompute patterns from signals
    insights.recomputePatterns();

    // Get all persona IDs that have data
    const states = evolution.exportState();
    const personaIds = Array.from(states.keys());

    // Add standard personas if not present
    const standardPersonas = [
      'ferni',
      'nayan-patel',
      'peter-john',
      'maya-santos',
      'jordan-taylor',
      'alex-chen',
    ];
    for (const id of standardPersonas) {
      if (!personaIds.includes(id)) {
        personaIds.push(id);
      }
    }

    let adjustmentsCreated = 0;

    // Run evolution for each persona
    for (const personaId of personaIds) {
      await evolution.runEvolutionCycle(personaId);

      const state = states.get(personaId);
      if (state) {
        adjustmentsCreated += state.adjustments.filter((a) => a.enabled).length;
      }
    }

    // Save updated data
    await this.saveAllData();

    const stats = insights.getStats();

    getLogger().info(
      {
        personasProcessed: personaIds.length,
        patternsComputed: stats.totalPatterns,
        adjustmentsCreated,
      },
      '🧬 Evolution cycle complete'
    );

    return {
      personasProcessed: personaIds.length,
      patternsComputed: stats.totalPatterns,
      adjustmentsCreated,
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private hydrateArray(arr: unknown[]): unknown[] {
    return arr.map((item) => this.hydrateObject(item as Record<string, unknown>));
  }

  private hydrateObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && '_seconds' in value) {
        // Firestore Timestamp
        result[key] = new Date((value as { _seconds: number })._seconds * 1000);
      } else if (value && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        // ISO date string
        result[key] = new Date(value);
      } else if (Array.isArray(value)) {
        result[key] = this.hydrateArray(value);
      } else if (value && typeof value === 'object') {
        result[key] = this.hydrateObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async shutdown(): Promise<void> {
    if (this.initialized) {
      await this.saveAllData();
      this.initialized = false;
      getLogger().info('Collective learning store shut down');
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let store: CollectiveLearningStore | null = null;

export function getCollectiveLearningStore(): CollectiveLearningStore {
  if (!store) {
    store = new CollectiveLearningStore();
  }
  return store;
}

export async function initializeCollectiveLearning(): Promise<CollectiveLearningStore> {
  const s = getCollectiveLearningStore();
  await s.initialize();
  return s;
}

export async function shutdownCollectiveLearning(): Promise<void> {
  if (store) {
    await store.shutdown();
    store = null;
  }
}

export default CollectiveLearningStore;
