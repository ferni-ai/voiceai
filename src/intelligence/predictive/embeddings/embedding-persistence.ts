/**
 * Embedding Intelligence Persistence
 *
 * Persists embedding-powered predictive data to Firestore.
 *
 * Similar to superhuman-persistence.ts but for the embedding capabilities:
 * - Semantic avoidance patterns
 * - Trajectory pattern library
 * - Breakthrough embeddings
 * - Cognitive fingerprints (community)
 * - Ripple embedding space
 * - Intervention situation library
 *
 * @module intelligence/predictive/embeddings/embedding-persistence
 */

import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { embeddingObservability } from './embedding-observability.js';

const log = createLogger({ module: 'EmbeddingPersistence' });

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

let firestoreDb: FirebaseFirestore.Firestore | null = null;

function getFirestoreDb(): FirebaseFirestore.Firestore | null {
  if (firestoreDb) return firestoreDb;

  try {
    // Dynamic import to avoid circular dependencies
    const admin = require('firebase-admin');
    if (admin.apps.length > 0) {
      firestoreDb = admin.firestore();
      return firestoreDb;
    }
  } catch (e) {
    // Firebase not initialized
  }

  return null;
}

// ============================================================================
// TYPES
// ============================================================================

export interface AvoidancePersistenceData {
  embeddings: Array<{
    topic: string;
    embedding: number[];
    deflectionPatterns: string[];
    emotionalSignature: string;
    frequency: number;
    lastDeflection: number;
  }>;
  clusters: Array<{
    id: string;
    label: string;
    themes: string[];
    topics: string[];
    centroidEmbedding: number[];
    cohesion: number;
    emotionalWeight: number;
  }>;
  [key: string]: unknown;
}

export interface TrajectoryPersistenceData {
  patterns: Array<{
    id: string;
    trajectory: string;
    severity: number;
    duration: number;
    trajectoryEmbedding: number[];
    precursorEmbedding: number[];
    contextEmbedding: number[];
    precursorSignals: Array<{
      signal: string;
      value: number;
      daysBeforeOnset: number;
    }>;
    contextDescription: string;
    lifeDomains: string[];
    recordedAt: number;
    onsetAt: number;
    resolvedAt?: number;
    resolution: string;
    helpfulInterventions?: string[];
  }>;
  [key: string]: unknown;
}

export interface BreakthroughPersistenceData {
  breakthroughs: Array<{
    id: string;
    topic: string;
    type: string;
    insightSummary: string;
    impact: number;
    contextEmbedding: number[];
    indicatorEmbedding: number[];
    catalystEmbedding: number[];
    insightEmbedding: number[];
    indicators: Array<{ type: string; strength: number; content: string }>;
    catalystType: string;
    catalystDescription: string;
    conversationContext: string;
    emotionalState: string;
    timestamp: number;
    conversationLength: number;
    followUpInsights?: string[];
    actionsTaken?: string[];
  }>;
  [key: string]: unknown;
}

export interface RippleSpacePersistenceData {
  domains: Array<{
    domain: string;
    coreEmbedding: number[];
    currentStateEmbedding: number[];
    healthyStateEmbedding: number[];
    personalMeaning: string;
    recentTopics: string[];
    emotionalAssociation: number;
  }>;
  influenceVectors: Array<{
    from: string;
    to: string;
    influenceEmbedding: number[];
    strength: number;
    direction: string;
    observationCount: number;
    exampleDescriptions: string[];
  }>;
  [key: string]: unknown;
}

export interface InterventionPersistenceData {
  situations: Array<{
    id: string;
    timestamp: number;
    situationEmbedding: number[];
    emotionalEmbedding: number[];
    topicEmbedding: number[];
    transcript: string;
    emotionalState: string;
    topic: string;
    conversationDepth: string;
    intervention: string;
    outcome: string;
    effectivenessScore: number;
    userResponse: string;
    timeOfDay: string;
    dayOfWeek: number;
    relationshipStage: string;
  }>;
  [key: string]: unknown;
}

// ============================================================================
// DIRTY TRACKING
// ============================================================================

const dirtyUsers = new Set<string>();

/**
 * Mark a user's embedding data as dirty (needs persistence)
 */
export function markEmbeddingDirty(userId: string): void {
  dirtyUsers.add(userId);
}

/**
 * Check if user has dirty embedding data
 */
export function isEmbeddingDirty(userId: string): boolean {
  return dirtyUsers.has(userId);
}

/**
 * Clear dirty flag after successful save
 */
function clearEmbeddingDirty(userId: string): void {
  dirtyUsers.delete(userId);
}

// ============================================================================
// SAVE FUNCTIONS
// ============================================================================

async function saveToFirestore(
  userId: string,
  docName: string,
  data: Record<string, unknown>
): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    log.debug({ userId, docName }, 'Firestore not available, skipping embedding save');
    return;
  }

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('embedding_intelligence')
      .doc(docName);

    const cleanedData = cleanForFirestore({
      ...data,
      updatedAt: new Date(),
    });

    await docRef.set(cleanedData, { merge: true });
    log.debug({ userId, docName }, 'Embedding data saved');
  } catch (error) {
    log.warn({ error: String(error), userId, docName }, 'Failed to save embedding data');
  }
}

/**
 * Save semantic avoidance data
 */
export async function saveSemanticAvoidance(
  userId: string,
  data: AvoidancePersistenceData
): Promise<void> {
  await saveToFirestore(userId, 'semantic_avoidance', data);
}

/**
 * Save trajectory patterns
 */
export async function saveTrajectoryPatterns(
  userId: string,
  data: TrajectoryPersistenceData
): Promise<void> {
  await saveToFirestore(userId, 'trajectory_patterns', data);
}

/**
 * Save breakthrough embeddings
 */
export async function saveBreakthroughEmbeddings(
  userId: string,
  data: BreakthroughPersistenceData
): Promise<void> {
  await saveToFirestore(userId, 'breakthrough_embeddings', data);
}

/**
 * Save ripple embedding space
 */
export async function saveRippleSpace(
  userId: string,
  data: RippleSpacePersistenceData
): Promise<void> {
  await saveToFirestore(userId, 'ripple_space', data);
}

/**
 * Save intervention situations
 */
export async function saveInterventionSituations(
  userId: string,
  data: InterventionPersistenceData
): Promise<void> {
  await saveToFirestore(userId, 'intervention_situations', data);
}

/**
 * Save cognitive fingerprint
 */
export async function saveCognitiveFingerprint(
  userId: string,
  data: {
    fingerprint: unknown;
    interventionOutcomes: Array<{
      interventionType: string;
      successes: number;
      failures: number;
      conditions: string[];
    }>;
  }
): Promise<void> {
  await saveToFirestore(userId, 'cognitive_fingerprint', data);
}

// ============================================================================
// LOAD FUNCTIONS
// ============================================================================

async function loadFromFirestore<T>(userId: string, docName: string): Promise<T | null> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    return null;
  }

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('embedding_intelligence')
      .doc(docName);

    const doc = await docRef.get();
    if (!doc.exists) return null;

    return doc.data() as T;
  } catch (error) {
    log.debug({ error: String(error), userId, docName }, 'Failed to load embedding data');
    return null;
  }
}

/**
 * Load semantic avoidance data
 */
export async function loadSemanticAvoidance(
  userId: string
): Promise<AvoidancePersistenceData | null> {
  return loadFromFirestore<AvoidancePersistenceData>(userId, 'semantic_avoidance');
}

/**
 * Load trajectory patterns
 */
export async function loadTrajectoryPatterns(
  userId: string
): Promise<TrajectoryPersistenceData | null> {
  return loadFromFirestore<TrajectoryPersistenceData>(userId, 'trajectory_patterns');
}

/**
 * Load breakthrough embeddings
 */
export async function loadBreakthroughEmbeddings(
  userId: string
): Promise<BreakthroughPersistenceData | null> {
  return loadFromFirestore<BreakthroughPersistenceData>(userId, 'breakthrough_embeddings');
}

/**
 * Load ripple embedding space
 */
export async function loadRippleSpace(userId: string): Promise<RippleSpacePersistenceData | null> {
  return loadFromFirestore<RippleSpacePersistenceData>(userId, 'ripple_space');
}

/**
 * Load intervention situations
 */
export async function loadInterventionSituations(
  userId: string
): Promise<InterventionPersistenceData | null> {
  return loadFromFirestore<InterventionPersistenceData>(userId, 'intervention_situations');
}

/**
 * Load cognitive fingerprint
 */
export async function loadCognitiveFingerprint(userId: string): Promise<{
  fingerprint: unknown;
  interventionOutcomes: Array<{
    interventionType: string;
    successes: number;
    failures: number;
    conditions: string[];
  }>;
} | null> {
  return loadFromFirestore(userId, 'cognitive_fingerprint');
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Load all embedding data for a user
 */
export async function loadAllEmbeddingData(userId: string): Promise<{
  avoidance: AvoidancePersistenceData | null;
  trajectories: TrajectoryPersistenceData | null;
  breakthroughs: BreakthroughPersistenceData | null;
  rippleSpace: RippleSpacePersistenceData | null;
  interventions: InterventionPersistenceData | null;
  cognitive: Awaited<ReturnType<typeof loadCognitiveFingerprint>>;
}> {
  const [avoidance, trajectories, breakthroughs, rippleSpace, interventions, cognitive] =
    await Promise.all([
      loadSemanticAvoidance(userId),
      loadTrajectoryPatterns(userId),
      loadBreakthroughEmbeddings(userId),
      loadRippleSpace(userId),
      loadInterventionSituations(userId),
      loadCognitiveFingerprint(userId),
    ]);

  return { avoidance, trajectories, breakthroughs, rippleSpace, interventions, cognitive };
}

/**
 * Flush embedding state for a user - saves all in-memory data to Firestore
 */
export async function flushEmbeddingState(userId: string): Promise<void> {
  log.debug({ userId }, '💾 Flushing embedding state to Firestore...');

  try {
    // Import the modules to get current state
    const { semanticAvoidance } = await import('./semantic-avoidance.js');
    const { trajectoryPatterns } = await import('./trajectory-patterns.js');
    const { breakthroughEmbeddings } = await import('./breakthrough-embeddings.js');
    const { rippleEmbeddingSpace } = await import('./ripple-embedding-space.js');
    const { interventionMatching } = await import('./intervention-matching.js');
    const { cognitiveSimilarity } = await import('./cognitive-similarity.js');

    // Get state from each module and save to Firestore
    const savePromises: Array<Promise<void>> = [];

    // 1. Semantic Avoidance
    const avoidanceState = semanticAvoidance.getStateForPersistence(userId);
    if (avoidanceState.embeddings.length > 0 || avoidanceState.clusters.length > 0) {
      savePromises.push(saveSemanticAvoidance(userId, avoidanceState as AvoidancePersistenceData));
    }

    // 2. Trajectory Patterns
    const trajectoryState = trajectoryPatterns.getStateForPersistence(userId);
    if (trajectoryState.patterns.length > 0) {
      savePromises.push(saveTrajectoryPatterns(userId, { patterns: trajectoryState.patterns }));
    }

    // 3. Breakthrough Embeddings
    const breakthroughState = breakthroughEmbeddings.getStateForPersistence(userId);
    if (breakthroughState.breakthroughs.length > 0) {
      savePromises.push(
        saveBreakthroughEmbeddings(userId, { breakthroughs: breakthroughState.breakthroughs })
      );
    }

    // 4. Ripple Embedding Space
    const rippleState = rippleEmbeddingSpace.getStateForPersistence(userId);
    if (rippleState && rippleState.domains.length > 0) {
      savePromises.push(saveRippleSpace(userId, rippleState as unknown as RippleSpacePersistenceData));
    }

    // 5. Intervention Matching
    const interventionState = interventionMatching.getStateForPersistence(userId);
    if (interventionState.situations.length > 0) {
      savePromises.push(
        saveInterventionSituations(userId, { situations: interventionState.situations })
      );
    }

    // 6. Cognitive Similarity (per-user fingerprint)
    const cognitiveState = cognitiveSimilarity.getStateForPersistence(userId);
    if (cognitiveState.fingerprint || cognitiveState.interventionOutcomes.length > 0) {
      savePromises.push(saveCognitiveFingerprint(userId, cognitiveState));
    }

    await Promise.all(savePromises);

    embeddingObservability.recordPersistence('flush', true);
    log.info({ userId, saveCount: savePromises.length }, '💾 Embedding state flushed');
  } catch (error) {
    embeddingObservability.recordPersistence('flush', false);
    log.warn({ error: String(error), userId }, 'Failed to flush embedding state');
  }

  clearEmbeddingDirty(userId);
}

/**
 * Flush all dirty users
 */
export async function flushAllDirtyEmbeddingUsers(): Promise<void> {
  const users = Array.from(dirtyUsers);

  for (const userId of users) {
    try {
      await flushEmbeddingState(userId);
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to flush embedding state');
    }
  }
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Initialize embedding intelligence for a session
 */
export async function initializeEmbeddingSession(userId: string, sessionId: string): Promise<void> {
  log.debug({ userId, sessionId }, '🧠 Initializing embedding session...');

  const { conversationTrajectory } = await import('./conversation-trajectory.js');
  const { rippleEmbeddingSpace } = await import('./ripple-embedding-space.js');
  const { semanticAvoidance } = await import('./semantic-avoidance.js');
  const { trajectoryPatterns } = await import('./trajectory-patterns.js');
  const { breakthroughEmbeddings } = await import('./breakthrough-embeddings.js');
  const { interventionMatching } = await import('./intervention-matching.js');
  const { cognitiveSimilarity } = await import('./cognitive-similarity.js');

  // Start conversation trajectory tracking (session-scoped, not persisted)
  conversationTrajectory.startTrajectory(sessionId, userId);

  // Load and hydrate persisted data
  try {
    const [
      avoidanceData,
      trajectoryData,
      breakthroughData,
      rippleData,
      interventionData,
      cognitiveData,
    ] = await Promise.all([
      loadSemanticAvoidance(userId),
      loadTrajectoryPatterns(userId),
      loadBreakthroughEmbeddings(userId),
      loadRippleSpace(userId),
      loadInterventionSituations(userId),
      loadCognitiveFingerprint(userId),
    ]);

    let hydratedCount = 0;

    // Hydrate each module with persisted data
    if (avoidanceData) {
      semanticAvoidance.hydrateFromPersistence(userId, avoidanceData);
      hydratedCount++;
    }

    if (trajectoryData) {
      trajectoryPatterns.hydrateFromPersistence(userId, trajectoryData as unknown as Parameters<typeof trajectoryPatterns.hydrateFromPersistence>[1]);
      hydratedCount++;
    }

    if (breakthroughData) {
      breakthroughEmbeddings.hydrateFromPersistence(userId, breakthroughData as unknown as Parameters<typeof breakthroughEmbeddings.hydrateFromPersistence>[1]);
      hydratedCount++;
    }

    if (rippleData) {
      rippleEmbeddingSpace.hydrateFromPersistence(userId, rippleData as unknown as Parameters<typeof rippleEmbeddingSpace.hydrateFromPersistence>[1]);
      hydratedCount++;
    } else {
      // Initialize domain space if no persisted data
      await rippleEmbeddingSpace.initializeDomainSpace(userId);
    }

    if (interventionData) {
      interventionMatching.hydrateFromPersistence(userId, interventionData as unknown as Parameters<typeof interventionMatching.hydrateFromPersistence>[1]);
      hydratedCount++;
    }

    if (cognitiveData) {
      cognitiveSimilarity.hydrateFromPersistence(
        userId,
        cognitiveData as {
          fingerprint: Parameters<
            typeof cognitiveSimilarity.hydrateFromPersistence
          >[1]['fingerprint'];
          interventionOutcomes: Parameters<
            typeof cognitiveSimilarity.hydrateFromPersistence
          >[1]['interventionOutcomes'];
        }
      );
      hydratedCount++;
    }

    embeddingObservability.recordPersistence('hydration', true);
    embeddingObservability.recordSession();
    log.info(
      { userId, sessionId, hydratedCount },
      '🧠 Embedding session initialized with persisted data'
    );
  } catch (error) {
    embeddingObservability.recordPersistence('hydration', false);
    log.warn(
      { error: String(error), userId },
      'Failed to load persisted embedding data, starting fresh'
    );
    // Initialize fresh domain space
    await rippleEmbeddingSpace.initializeDomainSpace(userId);
  }
}

/**
 * Cleanup embedding intelligence for a session
 */
export async function cleanupEmbeddingSession(userId: string, sessionId: string): Promise<void> {
  const { conversationTrajectory } = await import('./conversation-trajectory.js');

  // End trajectory tracking
  const trajectory = conversationTrajectory.endTrajectory(sessionId);

  // Mark for persistence
  markEmbeddingDirty(userId);

  log.debug(
    { userId, sessionId, turns: trajectory?.turns.length ?? 0 },
    '🧠 Embedding session cleaned up'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export const embeddingPersistence = {
  markDirty: markEmbeddingDirty,
  isDirty: isEmbeddingDirty,
  flush: flushEmbeddingState,
  flushAll: flushAllDirtyEmbeddingUsers,
  initializeSession: initializeEmbeddingSession,
  cleanupSession: cleanupEmbeddingSession,
  save: {
    avoidance: saveSemanticAvoidance,
    trajectories: saveTrajectoryPatterns,
    breakthroughs: saveBreakthroughEmbeddings,
    rippleSpace: saveRippleSpace,
    interventions: saveInterventionSituations,
    cognitive: saveCognitiveFingerprint,
  },
  load: {
    avoidance: loadSemanticAvoidance,
    trajectories: loadTrajectoryPatterns,
    breakthroughs: loadBreakthroughEmbeddings,
    rippleSpace: loadRippleSpace,
    interventions: loadInterventionSituations,
    cognitive: loadCognitiveFingerprint,
    all: loadAllEmbeddingData,
  },
};

export default embeddingPersistence;
