/**
 * Firestore Persistence for Semantic Router
 *
 * Provides persistent storage for:
 * - Routing corrections (active learning)
 * - User personalization profiles
 * - Routing analytics/events
 * - A/B test results
 *
 * Uses the same Firestore instance as the memory module.
 *
 * @module tools/semantic-router/persistence/firestore-persistence
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'semantic-router:persistence' });

// ============================================================================
// TYPES (mirrors Firestore SDK interfaces)
// ============================================================================

interface FirestoreDB {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  add: (data: Record<string, unknown>) => Promise<DocumentReference>;
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

interface DocumentReference {
  id: string;
  set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
  get: () => Promise<DocumentSnapshot>;
  update: (data: Record<string, unknown>) => Promise<void>;
  delete: () => Promise<void>;
  collection: (name: string) => CollectionReference;
}

interface DocumentSnapshot {
  exists: boolean;
  id: string;
  data: () => Record<string, unknown> | undefined;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

interface Query {
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

// ============================================================================
// COLLECTION NAMES
// ============================================================================

export const COLLECTIONS = {
  CORRECTIONS: 'semantic_router_corrections',
  USER_PROFILES: 'user_tool_profiles',
  ROUTING_EVENTS: 'semantic_router_events',
  AB_TESTS: 'semantic_router_ab_tests',
  LEARNING_STATE: 'semantic_router_learning',
  TOOL_EMBEDDINGS: 'semantic_router_tool_embeddings',
} as const;

// ============================================================================
// FIRESTORE CONNECTION
// ============================================================================

let firestoreInstance: FirestoreDB | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the Firestore connection for semantic router
 * Reuses existing Firestore instance from memory module if available
 */
export async function initializeFirestorePersistence(): Promise<void> {
  if (firestoreInstance) return;

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = doInitialize();
  await initializationPromise;
  initializationPromise = null;
}

async function doInitialize(): Promise<void> {
  try {
    // Try to get Firestore from the memory module's store factory
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();

    // The store has a private db property - we need to access it
    // This is a bit hacky, but avoids creating a second Firestore connection
    if (store && (store as unknown as { db?: FirestoreDB }).db) {
      firestoreInstance = (store as unknown as { db: FirestoreDB }).db;
      log.info('Using existing Firestore connection from memory module');
      return;
    }
  } catch {
    log.debug('Memory module Firestore not available, initializing standalone');
  }

  // Fall back to initializing our own connection
  try {
    const hasGCP = Boolean(process.env.GOOGLE_CLOUD_PROJECT);
    if (!hasGCP) {
      log.warn('No GOOGLE_CLOUD_PROJECT - semantic router persistence disabled');
      return;
    }

    const { Firestore } = await import('@google-cloud/firestore');
    firestoreInstance = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    }) as unknown as FirestoreDB;

    log.info('Firestore persistence initialized for semantic router');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to initialize Firestore - using in-memory only');
  }
}

/**
 * Get the Firestore instance (null if not initialized)
 */
export function getFirestore(): FirestoreDB | null {
  return firestoreInstance;
}

/**
 * Check if persistence is available
 */
export function isPersistenceAvailable(): boolean {
  return firestoreInstance !== null;
}

// ============================================================================
// CORRECTION PERSISTENCE
// ============================================================================

export interface PersistedCorrection {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  originalQuery: string;
  normalizedQuery: string;
  predictedTool: string;
  predictedConfidence: number;
  predictedArgs: Record<string, unknown>;
  actualTool: string | null;
  actualArgs?: Record<string, unknown>;
  correctionSource: 'user_explicit' | 'user_implicit' | 'system';
  conversationContext: string[];
  personaId: string;
  feedbackType: 'wrong_tool' | 'wrong_args' | 'should_not_call' | 'missed_tool';
  userFeedback?: string;
}

/**
 * Save a routing correction to Firestore
 */
export async function saveCorrection(correction: PersistedCorrection): Promise<void> {
  if (!firestoreInstance) {
    log.debug('Firestore not available - correction not persisted');
    return;
  }

  try {
    await firestoreInstance
      .collection(COLLECTIONS.CORRECTIONS)
      .doc(correction.id)
      .set(
        cleanForFirestore({
          ...correction,
          timestamp: correction.timestamp,
          _createdAt: new Date(),
        })
      );

    log.debug({ correctionId: correction.id }, 'Correction persisted to Firestore');
  } catch (error) {
    log.error(
      { error: String(error), correctionId: correction.id },
      'Failed to persist correction'
    );
  }
}

/**
 * Load corrections from Firestore
 */
export async function loadCorrections(options?: {
  userId?: string;
  since?: Date;
  limit?: number;
}): Promise<PersistedCorrection[]> {
  if (!firestoreInstance) {
    return [];
  }

  try {
    let query = firestoreInstance.collection(COLLECTIONS.CORRECTIONS) as Query;

    if (options?.userId) {
      query = query.where('userId', '==', options.userId);
    }
    if (options?.since) {
      query = query.where('timestamp', '>=', options.since);
    }

    query = query.orderBy('timestamp', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data()!;
      return {
        ...data,
        id: doc.id,
        timestamp:
          (data.timestamp as { toDate?: () => Date })?.toDate?.() ||
          new Date(data.timestamp as string),
      } as PersistedCorrection;
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load corrections');
    return [];
  }
}

// ============================================================================
// USER PROFILE PERSISTENCE
// ============================================================================

export interface PersistedUserProfile {
  userId: string;
  toolBoosts: Record<string, number>;
  vocabulary: Record<string, string>;
  timePatterns: Record<string, Record<string, number>>;
  contextPatterns: Record<string, Record<string, number>>;
  totalInteractions: number;
  lastUpdated: Date;
  correctionRate: number;
}

/**
 * Save user profile to Firestore
 */
export async function saveUserProfile(profile: PersistedUserProfile): Promise<void> {
  if (!firestoreInstance) {
    log.debug('Firestore not available - profile not persisted');
    return;
  }

  try {
    await firestoreInstance
      .collection(COLLECTIONS.USER_PROFILES)
      .doc(profile.userId)
      .set(
        cleanForFirestore({
          ...profile,
          lastUpdated: profile.lastUpdated,
          _updatedAt: new Date(),
        })
      );

    log.debug({ userId: profile.userId }, 'User profile persisted to Firestore');
  } catch (error) {
    log.error({ error: String(error), userId: profile.userId }, 'Failed to persist user profile');
  }
}

/**
 * Load user profile from Firestore
 */
export async function loadUserProfile(userId: string): Promise<PersistedUserProfile | null> {
  if (!firestoreInstance) {
    return null;
  }

  try {
    const doc = await firestoreInstance.collection(COLLECTIONS.USER_PROFILES).doc(userId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      ...data,
      userId: doc.id,
      lastUpdated: (data.lastUpdated as { toDate?: () => Date })?.toDate?.() || new Date(),
    } as PersistedUserProfile;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load user profile');
    return null;
  }
}

// ============================================================================
// ROUTING EVENT PERSISTENCE
// ============================================================================

export interface PersistedRoutingEvent {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  personaId: string;
  inputText: string;
  actionType: string;
  toolId?: string;
  confidence?: number;
  latencyMs: number;
  outcome?: {
    toolExecuted: string | null;
    executionSuccess: boolean;
    corrected?: boolean;
    llmFallbackUsed: boolean;
  };
}

/**
 * Save routing event to Firestore
 * Uses date-partitioned subcollections for efficient querying
 */
export async function saveRoutingEvent(event: PersistedRoutingEvent): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    const dateStr = event.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    await firestoreInstance
      .collection(COLLECTIONS.ROUTING_EVENTS)
      .doc(dateStr)
      .collection('events')
      .doc(event.id)
      .set(
        cleanForFirestore({
          ...event,
          timestamp: event.timestamp,
        })
      );
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to persist routing event');
  }
}

/**
 * Load routing events from Firestore
 */
export async function loadRoutingEvents(options: {
  date: string; // YYYY-MM-DD
  userId?: string;
  limit?: number;
}): Promise<PersistedRoutingEvent[]> {
  if (!firestoreInstance) {
    return [];
  }

  try {
    let query = firestoreInstance
      .collection(COLLECTIONS.ROUTING_EVENTS)
      .doc(options.date)
      .collection('events') as unknown as Query;

    if (options.userId) {
      query = query.where('userId', '==', options.userId);
    }

    query = query.orderBy('timestamp', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data()!;
      return {
        ...data,
        id: doc.id,
        timestamp: (data.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(),
      } as PersistedRoutingEvent;
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to load routing events');
    return [];
  }
}

// ============================================================================
// A/B TEST PERSISTENCE
// ============================================================================

export interface PersistedABTest {
  testId: string;
  variants: Array<{
    name: string;
    weight: number;
    config: Record<string, unknown>;
  }>;
  metrics: string[];
  startDate: Date;
  endDate?: Date;
  results: Record<string, number[]>;
  status: 'running' | 'completed' | 'stopped';
}

/**
 * Save A/B test to Firestore
 */
export async function saveABTest(test: PersistedABTest): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    await firestoreInstance
      .collection(COLLECTIONS.AB_TESTS)
      .doc(test.testId)
      .set(
        cleanForFirestore({
          ...test,
          startDate: test.startDate,
          endDate: test.endDate || null,
          _updatedAt: new Date(),
        })
      );
  } catch (error) {
    log.error({ error: String(error), testId: test.testId }, 'Failed to persist A/B test');
  }
}

/**
 * Load A/B tests from Firestore
 */
export async function loadABTests(options?: {
  status?: 'running' | 'completed' | 'stopped';
}): Promise<PersistedABTest[]> {
  if (!firestoreInstance) {
    return [];
  }

  try {
    let query = firestoreInstance.collection(COLLECTIONS.AB_TESTS) as unknown as Query;

    if (options?.status) {
      query = query.where('status', '==', options.status);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data()!;
      return {
        ...data,
        testId: doc.id,
        startDate: (data.startDate as { toDate?: () => Date })?.toDate?.() || new Date(),
        endDate: data.endDate ? (data.endDate as { toDate?: () => Date })?.toDate?.() : undefined,
      } as PersistedABTest;
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load A/B tests');
    return [];
  }
}

// ============================================================================
// TOOL EMBEDDING INDEX PERSISTENCE
// ============================================================================

export interface PersistedToolEmbeddingIndex {
  toolId: string;
  version: string;
  descriptionEmbedding: number[];
  exampleEmbeddings: number[][];
  embeddingModel: string;
  createdAt: Date;
  toolHash: string; // Hash of tool definition for change detection
}

/**
 * Save tool embedding index to Firestore
 * Uses version-partitioned storage for easy migrations
 */
export async function saveToolEmbedding(index: PersistedToolEmbeddingIndex): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    // Store under version/toolId path for easy version migrations
    const docId = `${index.version}:${index.toolId}`;
    await firestoreInstance
      .collection(COLLECTIONS.TOOL_EMBEDDINGS)
      .doc(docId)
      .set(
        cleanForFirestore({
          ...index,
          createdAt: index.createdAt,
          _updatedAt: new Date(),
        })
      );

    log.debug({ toolId: index.toolId, version: index.version }, 'Tool embedding index persisted');
  } catch (error) {
    log.debug({ error: String(error), toolId: index.toolId }, 'Failed to persist tool embedding');
  }
}

/**
 * Load a specific tool embedding index from Firestore
 */
export async function loadToolEmbedding(
  toolId: string,
  version: string
): Promise<PersistedToolEmbeddingIndex | null> {
  if (!firestoreInstance) {
    return null;
  }

  try {
    const docId = `${version}:${toolId}`;
    const doc = await firestoreInstance.collection(COLLECTIONS.TOOL_EMBEDDINGS).doc(docId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      toolId: data.toolId as string,
      version: data.version as string,
      descriptionEmbedding: data.descriptionEmbedding as number[],
      exampleEmbeddings: data.exampleEmbeddings as number[][],
      embeddingModel: data.embeddingModel as string,
      createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
      toolHash: data.toolHash as string,
    };
  } catch (error) {
    log.debug({ error: String(error), toolId, version }, 'Failed to load tool embedding');
    return null;
  }
}

/**
 * Load all tool embeddings for a version from Firestore
 */
export async function loadAllToolEmbeddings(
  version: string
): Promise<PersistedToolEmbeddingIndex[]> {
  if (!firestoreInstance) {
    return [];
  }

  try {
    const query = firestoreInstance
      .collection(COLLECTIONS.TOOL_EMBEDDINGS)
      .where('version', '==', version);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data()!;
      return {
        toolId: data.toolId as string,
        version: data.version as string,
        descriptionEmbedding: data.descriptionEmbedding as number[],
        exampleEmbeddings: data.exampleEmbeddings as number[][],
        embeddingModel: data.embeddingModel as string,
        createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
        toolHash: data.toolHash as string,
      };
    });
  } catch (error) {
    log.debug({ error: String(error), version }, 'Failed to load tool embeddings');
    return [];
  }
}

/**
 * Delete old tool embedding versions (cleanup)
 */
export async function deleteToolEmbeddingVersion(version: string): Promise<number> {
  if (!firestoreInstance) {
    return 0;
  }

  try {
    const query = firestoreInstance
      .collection(COLLECTIONS.TOOL_EMBEDDINGS)
      .where('version', '==', version)
      .limit(500);

    const snapshot = await query.get();
    let deleted = 0;

    for (const doc of snapshot.docs) {
      await firestoreInstance.collection(COLLECTIONS.TOOL_EMBEDDINGS).doc(doc.id).delete();
      deleted++;
    }

    log.info({ version, deleted }, 'Deleted old tool embedding version');
    return deleted;
  } catch (error) {
    log.error({ error: String(error), version }, 'Failed to delete tool embedding version');
    return 0;
  }
}

// ============================================================================
// LEARNING STATE PERSISTENCE (confusion matrix, etc.)
// ============================================================================

export interface PersistedLearningState {
  confusionMatrix: Record<string, Record<string, number>>;
  lastRetrainTime?: Date;
  accuracyHistory: Array<{ timestamp: Date; accuracy: number }>;
}

/**
 * Save learning state to Firestore
 */
export async function saveLearningState(state: PersistedLearningState): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    await firestoreInstance
      .collection(COLLECTIONS.LEARNING_STATE)
      .doc('global')
      .set(
        cleanForFirestore({
          ...state,
          lastRetrainTime: state.lastRetrainTime || null,
          _updatedAt: new Date(),
        })
      );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist learning state');
  }
}

/**
 * Load learning state from Firestore
 */
export async function loadLearningState(): Promise<PersistedLearningState | null> {
  if (!firestoreInstance) {
    return null;
  }

  try {
    const doc = await firestoreInstance.collection(COLLECTIONS.LEARNING_STATE).doc('global').get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      confusionMatrix: data.confusionMatrix as Record<string, Record<string, number>>,
      lastRetrainTime: data.lastRetrainTime
        ? (data.lastRetrainTime as { toDate?: () => Date })?.toDate?.()
        : undefined,
      accuracyHistory:
        (data.accuracyHistory as Array<{ timestamp: unknown; accuracy: number }>)?.map((h) => ({
          timestamp: (h.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(),
          accuracy: h.accuracy,
        })) || [],
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load learning state');
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clean up old data (run periodically)
 */
export async function cleanupOldData(options: {
  correctionRetentionDays?: number;
  eventRetentionDays?: number;
}): Promise<{ deletedCorrections: number; deletedEvents: number }> {
  if (!firestoreInstance) {
    return { deletedCorrections: 0, deletedEvents: 0 };
  }

  const correctionCutoff = new Date();
  correctionCutoff.setDate(correctionCutoff.getDate() - (options.correctionRetentionDays || 90));

  const eventCutoff = new Date();
  eventCutoff.setDate(eventCutoff.getDate() - (options.eventRetentionDays || 30));

  let deletedCorrections = 0;
  const deletedEvents = 0;

  try {
    // Delete old corrections
    const oldCorrections = await firestoreInstance
      .collection(COLLECTIONS.CORRECTIONS)
      .where('timestamp', '<', correctionCutoff)
      .limit(500)
      .get();

    for (const doc of oldCorrections.docs) {
      await firestoreInstance.collection(COLLECTIONS.CORRECTIONS).doc(doc.id).delete();
      deletedCorrections++;
    }

    // Delete old event date partitions
    const cutoffDateStr = eventCutoff.toISOString().split('T')[0];
    // Note: This is simplified - in production you'd list and delete old date docs
    log.info({ cutoffDate: cutoffDateStr }, 'Would delete event partitions before this date');
  } catch (error) {
    log.error({ error: String(error) }, 'Cleanup failed');
  }

  return { deletedCorrections, deletedEvents };
}

// ============================================================================
// FIRESTORE PERSISTENCE CLASS (convenience wrapper)
// ============================================================================

/**
 * Class wrapper for Firestore persistence operations
 * Provides a unified interface for all persistence operations
 */
export class FirestorePersistence {
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = initializeFirestorePersistence();
    await this.initPromise;
  }

  isAvailable(): boolean {
    return isPersistenceAvailable();
  }

  // Corrections
  async saveCorrection(correction: PersistedCorrection): Promise<void> {
    return saveCorrection(correction);
  }

  async loadCorrections(options?: {
    userId?: string;
    since?: Date;
    limit?: number;
  }): Promise<PersistedCorrection[]> {
    return loadCorrections(options);
  }

  // User Profiles
  async saveUserProfile(profile: PersistedUserProfile): Promise<void> {
    return saveUserProfile(profile);
  }

  async loadUserProfile(userId: string): Promise<PersistedUserProfile | null> {
    return loadUserProfile(userId);
  }

  // Routing Events
  async saveRoutingEvent(event: PersistedRoutingEvent): Promise<void> {
    return saveRoutingEvent(event);
  }

  async loadRoutingEvents(options: {
    date: string;
    userId?: string;
    limit?: number;
  }): Promise<PersistedRoutingEvent[]> {
    return loadRoutingEvents(options);
  }

  // A/B Tests
  async saveABTest(test: PersistedABTest): Promise<void> {
    return saveABTest(test);
  }

  async loadABTests(options?: {
    status?: 'running' | 'completed' | 'stopped';
  }): Promise<PersistedABTest[]> {
    return loadABTests(options);
  }

  // Tool Embeddings
  async saveToolEmbedding(index: PersistedToolEmbeddingIndex): Promise<void> {
    return saveToolEmbedding(index);
  }

  async loadToolEmbedding(
    toolId: string,
    version: string
  ): Promise<PersistedToolEmbeddingIndex | null> {
    return loadToolEmbedding(toolId, version);
  }

  async loadAllToolEmbeddings(version: string): Promise<PersistedToolEmbeddingIndex[]> {
    return loadAllToolEmbeddings(version);
  }

  async deleteToolEmbeddingVersion(version: string): Promise<number> {
    return deleteToolEmbeddingVersion(version);
  }

  // Learning State
  async saveLearningState(state: PersistedLearningState): Promise<void> {
    return saveLearningState(state);
  }

  async loadLearningState(): Promise<PersistedLearningState | null> {
    return loadLearningState();
  }

  // Cleanup
  async cleanup(options: {
    correctionRetentionDays?: number;
    eventRetentionDays?: number;
  }): Promise<{ deletedCorrections: number; deletedEvents: number }> {
    return cleanupOldData(options);
  }
}

// Singleton instance
let persistenceInstance: FirestorePersistence | null = null;

/**
 * Get the singleton FirestorePersistence instance
 */
export function getFirestorePersistence(): FirestorePersistence {
  if (!persistenceInstance) {
    persistenceInstance = new FirestorePersistence();
  }
  return persistenceInstance;
}
