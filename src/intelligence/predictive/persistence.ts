/**
 * Predictive Intelligence Persistence Layer
 *
 * Stores learned ML model state to Firestore so patterns survive restarts.
 *
 * WHAT GETS PERSISTED:
 * - Markov chain transition counts
 * - Time-series historical data
 * - Reinforcement learning weights
 * - Signal accuracy scores
 *
 * ARCHITECTURE:
 * - In-memory for fast reads during conversation
 * - Periodic flush to Firestore (batched for efficiency)
 * - Load on first access per user
 * - Shared community patterns stored separately
 *
 * @module intelligence/predictive/persistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../services/superhuman/firestore-utils.js';
import { Timestamp } from '@google-cloud/firestore';

const log = createLogger({ module: 'PredictiveMLPersistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface MarkovPersistenceData {
  firstOrder: Record<string, Record<string, TransitionData>>;
  secondOrder: Record<string, Record<string, TransitionData>>;
  totalObservations: number;
  lastUpdated: number;
}

interface TransitionData {
  probability: number;
  observations: number;
  lastSeen: number;
  confidence: 'low' | 'medium' | 'high' | 'very_high';
}

export interface TimeSeriesPersistenceData {
  mood: TimeSeriesPointData[];
  energy: TimeSeriesPointData[];
  engagement: TimeSeriesPointData[];
  stress: TimeSeriesPointData[];
  seasonality: SeasonalityData;
  lastUpdated: number;
}

interface TimeSeriesPointData {
  timestamp: number;
  value: number;
  dayOfWeek?: number;
  hourOfDay?: number;
  topic?: string;
}

interface SeasonalityData {
  mood: { dayOfWeek: number[]; hourOfDay: number[] };
  energy: { dayOfWeek: number[]; hourOfDay: number[] };
  engagement: { dayOfWeek: number[]; hourOfDay: number[] };
  stress: { dayOfWeek: number[]; hourOfDay: number[] };
}

export interface ReinforcementPersistenceData {
  predictions: Record<string, PredictionTrackingData>;
  calibration: CalibrationBucket[];
  signalAccuracy: Record<string, SignalAccuracyData>;
  outreachHistory: OutreachHistoryEntry[];
  lastUpdated: number;
}

interface PredictionTrackingData {
  prediction: string;
  confidence: number;
  timestamp: number;
  resolved: boolean;
  outcome?: string;
  actualHappened?: boolean;
}

interface CalibrationBucket {
  binStart: number;
  binEnd: number;
  actualRate: number;
  count: number;
}

interface SignalAccuracyData {
  signal: string;
  correctPredictions: number;
  totalPredictions: number;
  accuracy: number;
}

interface OutreachHistoryEntry {
  timestamp: number;
  hour: number;
  dayOfWeek: number;
  outcome: 'positive' | 'negative' | 'neutral';
}

// ============================================================================
// STATE TRACKING
// ============================================================================

/** Users with dirty state that need flushing */
const dirtyUsers = new Set<string>();

/** Last flush timestamp per user */
const lastFlushTime = new Map<string, number>();

/** Minimum time between flushes (5 minutes) */
const FLUSH_INTERVAL_MS = 5 * 60 * 1000;

/** Cache for loaded profiles */
const loadedUsers = new Set<string>();

/** Active flush locks to prevent concurrent writes per user */
const flushLocks = new Map<string, Promise<void>>();

/**
 * Execute with lock to prevent concurrent flushes for the same user
 */
async function withFlushLock(userId: string, fn: () => Promise<void>): Promise<void> {
  // Wait for any existing flush to complete
  const existingLock = flushLocks.get(userId);
  if (existingLock) {
    await existingLock;
  }

  // Create new lock and execute
  const lockPromise = fn().finally(() => {
    flushLocks.delete(userId);
  });
  flushLocks.set(userId, lockPromise);

  return lockPromise;
}

// ============================================================================
// MARKOV PERSISTENCE
// ============================================================================

/**
 * Save Markov model state to Firestore
 */
export async function saveMarkovState(userId: string, data: MarkovPersistenceData): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    log.debug({ userId }, 'Firestore not available, skipping Markov save');
    return;
  }

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('predictive_ml')
      .doc('markov');

    const cleanedData = cleanForFirestore({
      ...data,
      updatedAt: Timestamp.now(),
    });

    await docRef.set(cleanedData, { merge: true });
    log.debug({ userId, observations: data.totalObservations }, 'Markov state saved');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save Markov state');
  }
}

/**
 * Load Markov model state from Firestore
 */
export async function loadMarkovState(userId: string): Promise<MarkovPersistenceData | null> {
  const firestore = getFirestoreDb();
  if (!firestore) return null;

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('predictive_ml')
      .doc('markov');

    const doc = await docRef.get();
    if (!doc.exists) return null;

    const data = doc.data() as MarkovPersistenceData;
    log.debug({ userId, observations: data.totalObservations }, 'Markov state loaded');
    return data;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load Markov state');
    return null;
  }
}

// ============================================================================
// TIME SERIES PERSISTENCE
// ============================================================================

/**
 * Save time series model state to Firestore
 */
export async function saveTimeSeriesState(
  userId: string,
  data: TimeSeriesPersistenceData
): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    log.debug({ userId }, 'Firestore not available, skipping time series save');
    return;
  }

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('predictive_ml')
      .doc('time_series');

    // Limit points to last 90 days for storage efficiency
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const trimmedData: TimeSeriesPersistenceData = {
      ...data,
      mood: data.mood.filter((p) => p.timestamp > ninetyDaysAgo).slice(-100),
      energy: data.energy.filter((p) => p.timestamp > ninetyDaysAgo).slice(-100),
      engagement: data.engagement.filter((p) => p.timestamp > ninetyDaysAgo).slice(-100),
      stress: data.stress.filter((p) => p.timestamp > ninetyDaysAgo).slice(-100),
    };

    const cleanedData = cleanForFirestore({
      ...trimmedData,
      updatedAt: Timestamp.now(),
    });

    await docRef.set(cleanedData, { merge: true });

    const totalPoints =
      trimmedData.mood.length +
      trimmedData.energy.length +
      trimmedData.engagement.length +
      trimmedData.stress.length;
    log.debug({ userId, totalPoints }, 'Time series state saved');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save time series state');
  }
}

/**
 * Load time series model state from Firestore
 */
export async function loadTimeSeriesState(
  userId: string
): Promise<TimeSeriesPersistenceData | null> {
  const firestore = getFirestoreDb();
  if (!firestore) return null;

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('predictive_ml')
      .doc('time_series');

    const doc = await docRef.get();
    if (!doc.exists) return null;

    const data = doc.data() as TimeSeriesPersistenceData;
    const totalPoints =
      (data.mood?.length || 0) +
      (data.energy?.length || 0) +
      (data.engagement?.length || 0) +
      (data.stress?.length || 0);
    log.debug({ userId, totalPoints }, 'Time series state loaded');
    return data;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load time series state');
    return null;
  }
}

// ============================================================================
// REINFORCEMENT LEARNING PERSISTENCE
// ============================================================================

/**
 * Save reinforcement learning state to Firestore
 */
export async function saveReinforcementState(
  userId: string,
  data: ReinforcementPersistenceData
): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    log.debug({ userId }, 'Firestore not available, skipping reinforcement save');
    return;
  }

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('predictive_ml')
      .doc('reinforcement');

    // Keep only recent predictions (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentPredictions: Record<string, PredictionTrackingData> = {};
    for (const [key, pred] of Object.entries(data.predictions)) {
      if (pred.timestamp > thirtyDaysAgo) {
        recentPredictions[key] = pred;
      }
    }

    // Keep only recent outreach history (last 90 days)
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const recentOutreach = data.outreachHistory.filter((o) => o.timestamp > ninetyDaysAgo);

    const trimmedData: ReinforcementPersistenceData = {
      ...data,
      predictions: recentPredictions,
      outreachHistory: recentOutreach.slice(-200), // Max 200 entries
    };

    const cleanedData = cleanForFirestore({
      ...trimmedData,
      updatedAt: Timestamp.now(),
    });

    await docRef.set(cleanedData, { merge: true });
    log.debug(
      { userId, predictionCount: Object.keys(recentPredictions).length },
      'Reinforcement state saved'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to save reinforcement state');
  }
}

/**
 * Load reinforcement learning state from Firestore
 */
export async function loadReinforcementState(
  userId: string
): Promise<ReinforcementPersistenceData | null> {
  const firestore = getFirestoreDb();
  if (!firestore) return null;

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('predictive_ml')
      .doc('reinforcement');

    const doc = await docRef.get();
    if (!doc.exists) return null;

    const data = doc.data() as ReinforcementPersistenceData;
    log.debug(
      { userId, predictionCount: Object.keys(data.predictions || {}).length },
      'Reinforcement state loaded'
    );
    return data;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load reinforcement state');
    return null;
  }
}

// ============================================================================
// COMMUNITY PATTERNS PERSISTENCE
// ============================================================================

/**
 * Save community-wide patterns (aggregated, anonymous)
 */
export async function saveCommunityPatterns(data: MarkovPersistenceData): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) return;

  try {
    const docRef = firestore.collection('predictive_intelligence').doc('community_patterns');

    const cleanedData = cleanForFirestore({
      ...data,
      updatedAt: Timestamp.now(),
    });

    await docRef.set(cleanedData, { merge: true });
    log.info({ observations: data.totalObservations }, 'Community patterns saved');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to save community patterns');
  }
}

/**
 * Load community-wide patterns
 */
export async function loadCommunityPatterns(): Promise<MarkovPersistenceData | null> {
  const firestore = getFirestoreDb();
  if (!firestore) return null;

  try {
    const docRef = firestore.collection('predictive_intelligence').doc('community_patterns');
    const doc = await docRef.get();
    if (!doc.exists) return null;

    const data = doc.data() as MarkovPersistenceData;
    log.info({ observations: data.totalObservations }, 'Community patterns loaded');
    return data;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load community patterns');
    return null;
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Mark a user's ML state as dirty (needs persistence)
 */
export function markDirty(userId: string): void {
  dirtyUsers.add(userId);
}

/**
 * Check if user is loaded
 */
export function isUserLoaded(userId: string): boolean {
  return loadedUsers.has(userId);
}

/**
 * Mark user as loaded
 */
export function markUserLoaded(userId: string): void {
  loadedUsers.add(userId);
}

/**
 * Flush all dirty users to Firestore
 *
 * Called periodically by scheduled job or on shutdown.
 */
export async function flushDirtyUsers(
  getMarkovData: (userId: string) => MarkovPersistenceData | null,
  getTimeSeriesData: (userId: string) => TimeSeriesPersistenceData | null,
  getReinforcementData: (userId: string) => ReinforcementPersistenceData | null
): Promise<{ flushed: number; errors: number }> {
  const now = Date.now();
  let flushed = 0;
  let errors = 0;

  for (const userId of Array.from(dirtyUsers)) {
    // Check if we should flush (respect interval)
    const lastFlush = lastFlushTime.get(userId) || 0;
    if (now - lastFlush < FLUSH_INTERVAL_MS) {
      continue; // Skip - too soon
    }

    try {
      // Save all model types in parallel
      const markovData = getMarkovData(userId);
      const timeSeriesData = getTimeSeriesData(userId);
      const reinforcementData = getReinforcementData(userId);

      const promises: Promise<void>[] = [];

      if (markovData) {
        promises.push(saveMarkovState(userId, markovData));
      }
      if (timeSeriesData) {
        promises.push(saveTimeSeriesState(userId, timeSeriesData));
      }
      if (reinforcementData) {
        promises.push(saveReinforcementState(userId, reinforcementData));
      }

      await Promise.all(promises);

      dirtyUsers.delete(userId);
      lastFlushTime.set(userId, now);
      flushed++;
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to flush user ML state');
      errors++;
    }
  }

  if (flushed > 0) {
    log.info({ flushed, errors }, 'Flushed dirty ML state to Firestore');
  }

  return { flushed, errors };
}

/**
 * Force flush a specific user (e.g., on session end)
 * Uses lock to prevent concurrent writes to the same user's data.
 */
export async function forceFlushUser(
  userId: string,
  getMarkovData: (userId: string) => MarkovPersistenceData | null,
  getTimeSeriesData: (userId: string) => TimeSeriesPersistenceData | null,
  getReinforcementData: (userId: string) => ReinforcementPersistenceData | null
): Promise<void> {
  return withFlushLock(userId, async () => {
    const markovData = getMarkovData(userId);
    const timeSeriesData = getTimeSeriesData(userId);
    const reinforcementData = getReinforcementData(userId);

    const promises: Promise<void>[] = [];

    if (markovData) {
      promises.push(saveMarkovState(userId, markovData));
    }
    if (timeSeriesData) {
      promises.push(saveTimeSeriesState(userId, timeSeriesData));
    }
    if (reinforcementData) {
      promises.push(saveReinforcementState(userId, reinforcementData));
    }

    await Promise.all(promises);

    dirtyUsers.delete(userId);
    lastFlushTime.set(userId, Date.now());
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;
let flushIntervalHandle: NodeJS.Timeout | null = null;

/**
 * Initialize persistence layer with periodic flushing
 */
export function initializePersistence(
  getMarkovData: (userId: string) => MarkovPersistenceData | null,
  getTimeSeriesData: (userId: string) => TimeSeriesPersistenceData | null,
  getReinforcementData: (userId: string) => ReinforcementPersistenceData | null
): void {
  if (initialized) return;

  // Set up periodic flush (every 5 minutes)
  flushIntervalHandle = setInterval(() => {
    void flushDirtyUsers(getMarkovData, getTimeSeriesData, getReinforcementData);
  }, FLUSH_INTERVAL_MS);

  initialized = true;
  log.info('🧠 Predictive ML persistence initialized');
}

/**
 * Shutdown persistence layer (flush remaining data)
 */
export async function shutdownPersistence(
  getMarkovData: (userId: string) => MarkovPersistenceData | null,
  getTimeSeriesData: (userId: string) => TimeSeriesPersistenceData | null,
  getReinforcementData: (userId: string) => ReinforcementPersistenceData | null
): Promise<void> {
  if (flushIntervalHandle) {
    clearInterval(flushIntervalHandle);
    flushIntervalHandle = null;
  }

  // Final flush of all dirty users
  await flushDirtyUsers(getMarkovData, getTimeSeriesData, getReinforcementData);

  initialized = false;
  log.info('🧠 Predictive ML persistence shut down');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const predictiveMLPersistence = {
  // Markov
  saveMarkov: saveMarkovState,
  loadMarkov: loadMarkovState,
  // Time Series
  saveTimeSeries: saveTimeSeriesState,
  loadTimeSeries: loadTimeSeriesState,
  // Reinforcement
  saveReinforcement: saveReinforcementState,
  loadReinforcement: loadReinforcementState,
  // Community
  saveCommunity: saveCommunityPatterns,
  loadCommunity: loadCommunityPatterns,
  // Batch
  markDirty,
  flushDirty: flushDirtyUsers,
  forceFlush: forceFlushUser,
  // Lifecycle
  initialize: initializePersistence,
  shutdown: shutdownPersistence,
  // State
  isUserLoaded,
  markUserLoaded,
};

export default predictiveMLPersistence;
