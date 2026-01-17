/**
 * Semantic Intelligence Persistence Layer
 *
 * Provides Firestore persistence for the learning loop and proactive anticipation
 * modules. Uses an in-memory cache for performance with async writes to Firestore.
 *
 * Collections stored under: bogle_users/{userId}/semantic_intelligence/
 *   - execution_records: ExecutionRecord[] (limited to recent 100)
 *   - patterns: ToolPattern[]
 *   - timing_patterns: TimingPattern[]
 *
 * @module intelligence/semantic-intelligence/persistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { ExecutionRecord, ToolPattern } from './learning-loop.js';

const log = createLogger({ module: 'SemanticIntelligence.Persistence' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Timing pattern for proactive anticipation
 * Used to predict what tools a user might need based on time patterns
 */
export interface TimingPattern {
  /** Tool that's used at this time */
  toolId: string;

  /** Hour of day (0-23) */
  hour: number;

  /** Day of week (0-6, 0=Sunday) - optional */
  dayOfWeek?: number;

  /** How many times this pattern has been observed */
  frequency: number;

  /** Confidence based on consistency (0-1) */
  confidence: number;

  /** Last time this pattern was observed */
  lastObserved: Date;
}

/**
 * Recent execution for sequence detection
 */
export interface RecentExecution {
  toolId: string;
  timestamp: Date;
}

/**
 * Bundle of all semantic intelligence data for a user
 */
interface SemanticIntelligenceBundle {
  userId: string;
  executionRecords: ExecutionRecord[];
  patterns: ToolPattern[];
  timingPatterns: TimingPattern[];
  recentExecutions: RecentExecution[];
  lastUpdated: Date;
}

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreType = any;
let firestoreInstance: FirestoreType | null = null;
let initAttempted = false;

// In-memory cache for performance and fallback
const memoryCache = new Map<string, SemanticIntelligenceBundle>();

// Max records to keep per user (prevent unbounded growth)
const MAX_EXECUTION_RECORDS = 100;
const MAX_RECENT_EXECUTIONS = 20;

/**
 * Get Firestore instance with lazy initialization
 */
async function getFirestore(): Promise<FirestoreType | null> {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  try {
    const admin = await import('firebase-admin');

    if (admin.apps.length === 0) {
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        admin.initializeApp();
      }
    }

    firestoreInstance = admin.firestore();
    log.info('Firestore initialized for semantic intelligence persistence');
    return firestoreInstance;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available - using in-memory storage only');
    return null;
  }
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const USERS_COLLECTION = 'bogle_users';
const SEMANTIC_SUBCOLLECTION = 'semantic_intelligence';
const EXECUTION_RECORDS_DOC = 'execution_records';
const PATTERNS_DOC = 'patterns';
const TIMING_PATTERNS_DOC = 'timing_patterns';

function getSemanticPath(userId: string): string {
  return `${USERS_COLLECTION}/${userId}/${SEMANTIC_SUBCOLLECTION}`;
}

// ============================================================================
// MEMORY CACHE HELPERS
// ============================================================================

function getOrCreateBundle(userId: string): SemanticIntelligenceBundle {
  let bundle = memoryCache.get(userId);
  if (!bundle) {
    bundle = {
      userId,
      executionRecords: [],
      patterns: [],
      timingPatterns: [],
      recentExecutions: [],
      lastUpdated: new Date(),
    };
    memoryCache.set(userId, bundle);
  }
  return bundle;
}

// ============================================================================
// EXECUTION RECORDS
// ============================================================================

/**
 * Save an execution record
 */
export async function saveExecutionRecord(userId: string, record: ExecutionRecord): Promise<void> {
  // Update in-memory cache immediately
  const bundle = getOrCreateBundle(userId);
  bundle.executionRecords.push(record);

  // Trim to max size
  if (bundle.executionRecords.length > MAX_EXECUTION_RECORDS) {
    bundle.executionRecords = bundle.executionRecords.slice(-MAX_EXECUTION_RECORDS);
  }
  bundle.lastUpdated = new Date();

  // Async write to Firestore
  try {
    const db = await getFirestore();
    if (!db) return;

    const docRef = db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SEMANTIC_SUBCOLLECTION)
      .doc(EXECUTION_RECORDS_DOC);

    await docRef.set(
      cleanForFirestore({
        records: bundle.executionRecords.map((r) => ({
          ...r,
          timestamp: r.timestamp.toISOString(),
        })),
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to persist execution record to Firestore');
  }
}

/**
 * Get execution records for a user
 */
export async function getExecutionRecords(userId: string): Promise<ExecutionRecord[]> {
  // Check cache first
  const cached = memoryCache.get(userId);
  if (cached && cached.executionRecords.length > 0) {
    return cached.executionRecords;
  }

  // Try loading from Firestore
  try {
    const db = await getFirestore();
    if (!db) return [];

    const docRef = db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SEMANTIC_SUBCOLLECTION)
      .doc(EXECUTION_RECORDS_DOC);

    const doc = await docRef.get();
    if (!doc.exists) return [];

    const data = doc.data();
    if (!data?.records) return [];

    const records: ExecutionRecord[] = data.records.map((r: Record<string, unknown>) => ({
      ...r,
      timestamp: new Date(r.timestamp as string),
    }));

    // Update cache
    const bundle = getOrCreateBundle(userId);
    bundle.executionRecords = records;

    return records;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load execution records from Firestore');
    return [];
  }
}

// ============================================================================
// TOOL PATTERNS
// ============================================================================

/**
 * Save tool patterns for a user
 */
export async function saveToolPatterns(userId: string, patterns: ToolPattern[]): Promise<void> {
  // Update in-memory cache immediately
  const bundle = getOrCreateBundle(userId);
  bundle.patterns = patterns;
  bundle.lastUpdated = new Date();

  // Async write to Firestore
  try {
    const db = await getFirestore();
    if (!db) return;

    const docRef = db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SEMANTIC_SUBCOLLECTION)
      .doc(PATTERNS_DOC);

    await docRef.set(
      cleanForFirestore({
        patterns: patterns.map((p) => ({
          ...p,
          lastUsed: p.lastUsed.toISOString(),
          firstSeen: p.firstSeen.toISOString(),
        })),
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to persist tool patterns to Firestore');
  }
}

/**
 * Get tool patterns for a user
 */
export async function getToolPatterns(userId: string): Promise<ToolPattern[]> {
  // Check cache first
  const cached = memoryCache.get(userId);
  if (cached && cached.patterns.length > 0) {
    return cached.patterns;
  }

  // Try loading from Firestore
  try {
    const db = await getFirestore();
    if (!db) return [];

    const docRef = db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SEMANTIC_SUBCOLLECTION)
      .doc(PATTERNS_DOC);

    const doc = await docRef.get();
    if (!doc.exists) return [];

    const data = doc.data();
    if (!data?.patterns) return [];

    const patterns: ToolPattern[] = data.patterns.map((p: Record<string, unknown>) => ({
      ...p,
      lastUsed: new Date(p.lastUsed as string),
      firstSeen: new Date(p.firstSeen as string),
    }));

    // Update cache
    const bundle = getOrCreateBundle(userId);
    bundle.patterns = patterns;

    return patterns;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load tool patterns from Firestore');
    return [];
  }
}

// ============================================================================
// TIMING PATTERNS
// ============================================================================

/**
 * Record a tool timing (when the user called a specific tool)
 * Computes confidence based on frequency (capped at 0.9)
 */
export async function recordToolTiming(params: {
  userId: string;
  toolId: string;
  timestamp: Date;
}): Promise<void> {
  const { userId, toolId, timestamp } = params;
  const hour = timestamp.getHours();
  const dayOfWeek = timestamp.getDay();

  const bundle = getOrCreateBundle(userId);

  // Find or create pattern
  let pattern = bundle.timingPatterns.find(
    (p) => p.toolId === toolId && p.hour === hour && p.dayOfWeek === dayOfWeek
  );

  if (pattern) {
    pattern.frequency++;
    pattern.lastObserved = timestamp;
    // Confidence increases with frequency, capped at 0.9
    pattern.confidence = Math.min(0.9, 0.3 + pattern.frequency * 0.1);
  } else {
    pattern = {
      toolId,
      hour,
      dayOfWeek,
      frequency: 1,
      confidence: 0.3,
      lastObserved: timestamp,
    };
    bundle.timingPatterns.push(pattern);
  }

  bundle.lastUpdated = new Date();

  // Also track recent execution
  bundle.recentExecutions.push({ toolId, timestamp });
  if (bundle.recentExecutions.length > MAX_RECENT_EXECUTIONS) {
    bundle.recentExecutions = bundle.recentExecutions.slice(-MAX_RECENT_EXECUTIONS);
  }

  // Prune old patterns to prevent unbounded growth
  pruneTimingPatterns(bundle);

  // Async write to Firestore
  try {
    const db = await getFirestore();
    if (!db) return;

    const docRef = db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SEMANTIC_SUBCOLLECTION)
      .doc(TIMING_PATTERNS_DOC);

    await docRef.set(
      cleanForFirestore({
        patterns: bundle.timingPatterns.map((p) => ({
          ...p,
          lastObserved: p.lastObserved.toISOString(),
        })),
        recentExecutions: bundle.recentExecutions.map((e) => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        })),
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to persist timing patterns to Firestore');
  }
}

/**
 * Prune old timing patterns to prevent unbounded growth
 */
function pruneTimingPatterns(bundle: SemanticIntelligenceBundle): void {
  if (bundle.timingPatterns.length <= 50) {
    return;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  bundle.timingPatterns = bundle.timingPatterns
    .filter((p) => p.lastObserved > thirtyDaysAgo || p.frequency >= 5)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 50);
}

/**
 * Get timing patterns for a user
 */
export async function getTimingPatterns(userId: string): Promise<TimingPattern[]> {
  // Check cache first
  const cached = memoryCache.get(userId);
  if (cached && cached.timingPatterns.length > 0) {
    return cached.timingPatterns;
  }

  // Try loading from Firestore
  try {
    const db = await getFirestore();
    if (!db) return [];

    const docRef = db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SEMANTIC_SUBCOLLECTION)
      .doc(TIMING_PATTERNS_DOC);

    const doc = await docRef.get();
    if (!doc.exists) return [];

    const data = doc.data();
    if (!data?.patterns) return [];

    const patterns: TimingPattern[] = data.patterns.map((p: Record<string, unknown>) => ({
      ...p,
      lastObserved: new Date(p.lastObserved as string),
    }));

    // Update cache
    const bundle = getOrCreateBundle(userId);
    bundle.timingPatterns = patterns;

    // Also load recent executions
    if (data.recentExecutions) {
      bundle.recentExecutions = data.recentExecutions.map((e: Record<string, unknown>) => ({
        toolId: e.toolId as string,
        timestamp: new Date(e.timestamp as string),
      }));
    }

    return patterns;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load timing patterns from Firestore');
    return [];
  }
}

/**
 * Get recent executions for sequence detection
 */
export async function getRecentExecutions(userId: string): Promise<RecentExecution[]> {
  // Check cache first
  const cached = memoryCache.get(userId);
  if (cached) {
    return cached.recentExecutions;
  }

  // Try loading - this also populates the cache
  await getTimingPatterns(userId);

  const bundle = memoryCache.get(userId);
  return bundle?.recentExecutions || [];
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Preload semantic intelligence data for a user
 * Call this at session start for best performance
 */
export async function preloadUserData(userId: string): Promise<void> {
  log.debug({ userId }, 'Preloading semantic intelligence data');

  // Load all data in parallel
  await Promise.all([
    getExecutionRecords(userId),
    getToolPatterns(userId),
    getTimingPatterns(userId),
  ]);
}

/**
 * Clear cache for a user (e.g., on session end)
 */
export function clearUserCache(userId: string): void {
  memoryCache.delete(userId);
  log.debug({ userId }, 'Cleared semantic intelligence cache');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  userCount: number;
  totalRecords: number;
  totalPatterns: number;
} {
  let totalRecords = 0;
  let totalPatterns = 0;

  for (const bundle of memoryCache.values()) {
    totalRecords += bundle.executionRecords.length;
    totalPatterns += bundle.patterns.length + bundle.timingPatterns.length;
  }

  return {
    userCount: memoryCache.size,
    totalRecords,
    totalPatterns,
  };
}

// ============================================================================
// TESTING HELPERS
// ============================================================================

/**
 * Reset persistence for testing
 * Only clears in-memory cache, keeps Firestore instance alive
 * to avoid re-initialization issues with fake timers
 */
export function resetForTesting(): void {
  memoryCache.clear();
  // Don't reset firestoreInstance or initAttempted -
  // Keeps Firestore instance alive to avoid dynamic import issues
  // with Vitest fake timers
}

/**
 * Full reset for testing (use sparingly)
 * Resets everything including Firestore instance
 */
export function fullResetForTesting(): void {
  memoryCache.clear();
  firestoreInstance = null;
  initAttempted = false;
}

/**
 * Pre-initialize Firestore for testing
 * Call this in beforeAll to avoid initialization during fake timers
 */
export async function initializeForTesting(): Promise<void> {
  await getFirestore();
}
