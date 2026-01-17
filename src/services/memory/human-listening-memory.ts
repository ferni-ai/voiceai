/**
 * Human Listening Memory
 *
 * Cross-session learning for personalized listening baselines.
 * Instead of comparing to population averages, we learn each user's
 * natural patterns and detect deviations from THEIR normal.
 *
 * This enables "better than human" insights like:
 * - "You usually speak fluently, but today you're hesitating a lot"
 * - "You don't normally use self-soothing phrases"
 * - "Your filler rate is 3x higher than usual"
 *
 * PERSISTENCE: Uses Firestore for cross-session baselines with in-memory caching.
 *
 * @module HumanListeningMemory
 */

import admin from 'firebase-admin';
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = getLogger().child({ module: 'HumanListeningMemory' });

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const BASELINES_COLLECTION = 'user_listening_baselines';
let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

/**
 * Get Firestore instance with lazy initialization
 */
function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted) return null;

  initAttempted = true;

  try {
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
    log.info('✅ Firestore initialized for human listening memory');
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for human listening memory, using in-memory only');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface UserListeningBaseline {
  /** User ID */
  userId: string;

  /** Last update timestamp */
  updatedAt: number;

  /** Number of sessions used to build baseline */
  sessionCount: number;

  /** Filler word patterns */
  fillers: {
    /** Normal filler rate per 100 words */
    normalRate: number;
    /** Most common filler type */
    preferredFiller: string;
    /** Variance in filler rate */
    variance: number;
  };

  /** Cognitive load patterns */
  cognitiveLoad: {
    /** Baseline speech rate (WPM) */
    normalSpeechRate: number;
    /** Normal pause frequency */
    normalPauseRate: number;
    /** Normal repetition rate */
    normalRepetitionRate: number;
  };

  /** Hedging patterns */
  hedging: {
    /** Baseline hedging density */
    normalDensity: number;
    /** Typical categories they use */
    typicalCategories: string[];
  };

  /** Self-soothing patterns */
  selfSoothing: {
    /** How often they use self-soothing language (rare = more significant when detected) */
    frequency: 'rare' | 'occasional' | 'frequent';
    /** Typical phrases they use */
    typicalPhrases: string[];
  };

  /** Engagement patterns */
  engagement: {
    /** Normal response latency (ms) */
    normalLatency: number;
    /** Normal response length (chars) */
    normalLength: number;
    /** Question rate per conversation */
    questionRate: number;
  };

  /** Voice characteristics (if audio available) */
  voice?: {
    /** Baseline energy level */
    normalEnergy: number;
    /** Typical pitch variance */
    pitchVariance: number;
    /** Baseline speaking rate (syllables/sec) */
    speakingRate: number;
  };
}

export interface SessionObservations {
  /** Observations from current session */
  fillerRate: number;
  fillerTypes: Record<string, number>;
  speechRate: number;
  pauseRate: number;
  hedgingDensity: number;
  hedgingCategories: string[];
  selfSoothingCount: number;
  selfSoothingPhrases: string[];
  responseLatencies: number[];
  responseLengths: number[];
  questionCount: number;
  turnCount: number;
}

export interface DeviationReport {
  /** Is there a significant deviation from baseline? */
  hasDeviation: boolean;

  /** Confidence in the deviation detection (0-1) */
  confidence: number;

  /** Specific deviations found */
  deviations: Array<{
    aspect: string;
    description: string;
    severity: 'notable' | 'significant' | 'major';
    baselineValue: number | string;
    currentValue: number | string;
    percentChange?: number;
  }>;

  /** Suggested agent response */
  guidance: string;
}

// ============================================================================
// IN-MEMORY CACHE (with Firestore persistence)
// ============================================================================

const userBaselines = new Map<string, UserListeningBaseline>();
const sessionObservations = new Map<string, SessionObservations>();

// ============================================================================
// BASELINE MANAGEMENT
// ============================================================================

/**
 * Get a user's listening baseline (from cache)
 */
export function getUserBaseline(userId: string): UserListeningBaseline | null {
  return userBaselines.get(userId) ?? null;
}

/**
 * Load baseline from Firestore with in-memory caching
 */
export async function loadUserBaseline(userId: string): Promise<UserListeningBaseline | null> {
  // Check in-memory cache first
  const cached = userBaselines.get(userId);
  if (cached) return cached;

  // Load from Firestore
  const db = getFirestore();
  if (!db) return null;

  try {
    const doc = await db.collection(BASELINES_COLLECTION).doc(userId).get();
    if (!doc.exists) {
      log.debug({ userId }, 'No baseline found in Firestore');
      return null;
    }

    const data = doc.data() as UserListeningBaseline;
    userBaselines.set(userId, data);
    log.debug({ userId, sessionCount: data.sessionCount }, 'Loaded baseline from Firestore');
    return data;
  } catch (error) {
    log.error({ error, userId }, 'Failed to load baseline from Firestore');
    return null;
  }
}

/**
 * Save baseline to Firestore with in-memory cache update
 */
export async function saveUserBaseline(baseline: UserListeningBaseline): Promise<void> {
  // Always update in-memory cache
  userBaselines.set(baseline.userId, baseline);

  // Persist to Firestore
  const db = getFirestore();
  if (!db) {
    log.debug(
      { userId: baseline.userId },
      'Firestore unavailable - baseline cached in memory only'
    );
    return;
  }

  try {
    await db.collection(BASELINES_COLLECTION).doc(baseline.userId).set(cleanForFirestore(baseline));
    log.debug(
      { userId: baseline.userId, sessionCount: baseline.sessionCount },
      'Baseline saved to Firestore'
    );
  } catch (error) {
    log.error({ error, userId: baseline.userId }, 'Failed to save baseline to Firestore');
  }
}

/**
 * Create initial baseline with defaults
 */
export function createInitialBaseline(userId: string): UserListeningBaseline {
  return {
    userId,
    updatedAt: Date.now(),
    sessionCount: 0,
    fillers: {
      normalRate: 3.0, // Population average
      preferredFiller: 'um',
      variance: 2.0,
    },
    cognitiveLoad: {
      normalSpeechRate: 150, // WPM
      normalPauseRate: 4, // pauses per minute
      normalRepetitionRate: 0.5, // per minute
    },
    hedging: {
      normalDensity: 5.0, // per 100 words
      typicalCategories: [],
    },
    selfSoothing: {
      frequency: 'rare',
      typicalPhrases: [],
    },
    engagement: {
      normalLatency: 2000, // ms
      normalLength: 50, // chars
      questionRate: 2, // per conversation
    },
  };
}

// ============================================================================
// SESSION OBSERVATION TRACKING
// ============================================================================

/**
 * Initialize session observation tracking
 */
export function initSessionObservations(sessionId: string): void {
  sessionObservations.set(sessionId, {
    fillerRate: 0,
    fillerTypes: {},
    speechRate: 0,
    pauseRate: 0,
    hedgingDensity: 0,
    hedgingCategories: [],
    selfSoothingCount: 0,
    selfSoothingPhrases: [],
    responseLatencies: [],
    responseLengths: [],
    questionCount: 0,
    turnCount: 0,
  });
}

/**
 * Record observations from a single turn
 */
export function recordTurnObservations(
  sessionId: string,
  observations: Partial<{
    fillerRate: number;
    fillerTypes: Record<string, number>;
    speechRate: number;
    hedgingDensity: number;
    hedgingCategories: string[];
    selfSoothingDetected: boolean;
    selfSoothingPhrases: string[];
    responseLatency: number;
    responseLength: number;
    askedQuestion: boolean;
  }>
): void {
  const session = sessionObservations.get(sessionId);
  if (!session) return;

  session.turnCount++;

  // Update running averages
  if (observations.fillerRate !== undefined) {
    session.fillerRate =
      (session.fillerRate * (session.turnCount - 1) + observations.fillerRate) / session.turnCount;
  }

  if (observations.fillerTypes) {
    for (const [type, count] of Object.entries(observations.fillerTypes)) {
      session.fillerTypes[type] = (session.fillerTypes[type] ?? 0) + count;
    }
  }

  if (observations.speechRate !== undefined && observations.speechRate > 0) {
    session.speechRate =
      session.speechRate === 0
        ? observations.speechRate
        : (session.speechRate + observations.speechRate) / 2;
  }

  if (observations.hedgingDensity !== undefined) {
    session.hedgingDensity =
      (session.hedgingDensity * (session.turnCount - 1) + observations.hedgingDensity) /
      session.turnCount;
  }

  if (observations.hedgingCategories) {
    for (const cat of observations.hedgingCategories) {
      if (!session.hedgingCategories.includes(cat)) {
        session.hedgingCategories.push(cat);
      }
    }
  }

  if (observations.selfSoothingDetected) {
    session.selfSoothingCount++;
  }

  if (observations.selfSoothingPhrases) {
    session.selfSoothingPhrases.push(...observations.selfSoothingPhrases);
  }

  if (observations.responseLatency !== undefined) {
    session.responseLatencies.push(observations.responseLatency);
  }

  if (observations.responseLength !== undefined) {
    session.responseLengths.push(observations.responseLength);
  }

  if (observations.askedQuestion) {
    session.questionCount++;
  }
}

/**
 * Get current session observations
 */
export function getSessionObservations(sessionId: string): SessionObservations | null {
  return sessionObservations.get(sessionId) ?? null;
}

// ============================================================================
// DEVIATION DETECTION
// ============================================================================

/**
 * Compare current session to user's baseline and detect deviations
 */
export function detectDeviations(userId: string, sessionId: string): DeviationReport {
  const baseline = userBaselines.get(userId);
  const session = sessionObservations.get(sessionId);

  if (!baseline || !session || session.turnCount < 3) {
    return {
      hasDeviation: false,
      confidence: 0,
      deviations: [],
      guidance: '',
    };
  }

  const deviations: DeviationReport['deviations'] = [];

  // Check filler rate
  if (baseline.fillers.normalRate > 0) {
    const fillerChange = session.fillerRate / baseline.fillers.normalRate;
    if (fillerChange > 2.0) {
      deviations.push({
        aspect: 'fillers',
        description: 'Using significantly more filler words than usual',
        severity: fillerChange > 3.0 ? 'major' : 'significant',
        baselineValue: baseline.fillers.normalRate.toFixed(1),
        currentValue: session.fillerRate.toFixed(1),
        percentChange: (fillerChange - 1) * 100,
      });
    }
  }

  // Check hedging density
  if (baseline.hedging.normalDensity > 0) {
    const hedgingChange = session.hedgingDensity / baseline.hedging.normalDensity;
    if (hedgingChange > 2.0) {
      deviations.push({
        aspect: 'hedging',
        description: 'Using more uncertain language than usual',
        severity: hedgingChange > 3.0 ? 'major' : 'significant',
        baselineValue: baseline.hedging.normalDensity.toFixed(1),
        currentValue: session.hedgingDensity.toFixed(1),
        percentChange: (hedgingChange - 1) * 100,
      });
    }
  }

  // Check self-soothing (especially notable if they rarely do it)
  if (baseline.selfSoothing.frequency === 'rare' && session.selfSoothingCount > 0) {
    deviations.push({
      aspect: 'self_soothing',
      description: "Using self-soothing phrases when they normally don't",
      severity: session.selfSoothingCount > 2 ? 'major' : 'significant',
      baselineValue: 'rare',
      currentValue: `${session.selfSoothingCount} instances`,
    });
  }

  // Check speech rate decline (cognitive load indicator)
  if (baseline.cognitiveLoad.normalSpeechRate > 0 && session.speechRate > 0) {
    const speechRateRatio = session.speechRate / baseline.cognitiveLoad.normalSpeechRate;
    if (speechRateRatio < 0.7) {
      deviations.push({
        aspect: 'speech_rate',
        description: 'Speaking slower than usual',
        severity: speechRateRatio < 0.5 ? 'major' : 'notable',
        baselineValue: `${baseline.cognitiveLoad.normalSpeechRate} WPM`,
        currentValue: `${Math.round(session.speechRate)} WPM`,
        percentChange: (1 - speechRateRatio) * -100,
      });
    }
  }

  // Generate guidance
  let guidance = '';
  if (deviations.length > 0) {
    const hasMajor = deviations.some((d) => d.severity === 'major');
    const aspects = deviations.map((d) => d.aspect);

    if (hasMajor) {
      guidance =
        "Something seems different about how they're communicating today. " +
        'Consider gently checking in: "You seem a bit different today - how are you really doing?"';
    } else if (aspects.includes('self_soothing')) {
      guidance =
        "They're using phrases they don't normally use. " +
        "Create space for them to share what's on their mind.";
    } else if (aspects.includes('fillers') || aspects.includes('speech_rate')) {
      guidance =
        'They may be processing something or feeling overwhelmed. ' +
        'Keep responses simple and give them time.';
    }
  }

  return {
    hasDeviation: deviations.length > 0,
    confidence: Math.min(0.9, 0.5 + session.turnCount * 0.05), // Confidence grows with more data
    deviations,
    guidance,
  };
}

// ============================================================================
// BASELINE UPDATES
// ============================================================================

/**
 * Update user's baseline with session observations
 * Called at end of session to evolve the baseline
 */
export async function updateBaselineFromSession(userId: string, sessionId: string): Promise<void> {
  const session = sessionObservations.get(sessionId);
  if (!session || session.turnCount < 5) {
    log.debug(
      { userId, sessionId, turns: session?.turnCount },
      'Insufficient data for baseline update'
    );
    return;
  }

  const baseline = userBaselines.get(userId) ?? createInitialBaseline(userId);

  // Exponential moving average weight (newer data weighted more)
  const alpha = baseline.sessionCount === 0 ? 1.0 : 0.3;

  // Update filler baseline
  if (session.fillerRate > 0) {
    baseline.fillers.normalRate =
      baseline.fillers.normalRate * (1 - alpha) + session.fillerRate * alpha;
  }

  // Update preferred filler
  const mostUsedFiller = Object.entries(session.fillerTypes).sort(([, a], [, b]) => b - a)[0];
  if (mostUsedFiller) {
    baseline.fillers.preferredFiller = mostUsedFiller[0];
  }

  // Update cognitive load baseline
  if (session.speechRate > 0) {
    baseline.cognitiveLoad.normalSpeechRate =
      baseline.cognitiveLoad.normalSpeechRate * (1 - alpha) + session.speechRate * alpha;
  }

  // Update hedging baseline
  baseline.hedging.normalDensity =
    baseline.hedging.normalDensity * (1 - alpha) + session.hedgingDensity * alpha;

  // Update typical hedging categories
  for (const cat of session.hedgingCategories) {
    if (!baseline.hedging.typicalCategories.includes(cat)) {
      baseline.hedging.typicalCategories.push(cat);
    }
  }

  // Update self-soothing frequency
  if (session.selfSoothingCount > 2) {
    baseline.selfSoothing.frequency =
      baseline.selfSoothing.frequency === 'rare' ? 'occasional' : 'frequent';
  }

  // Update engagement baseline
  if (session.responseLatencies.length > 0) {
    const avgLatency =
      session.responseLatencies.reduce((a, b) => a + b, 0) / session.responseLatencies.length;
    baseline.engagement.normalLatency =
      baseline.engagement.normalLatency * (1 - alpha) + avgLatency * alpha;
  }

  if (session.responseLengths.length > 0) {
    const avgLength =
      session.responseLengths.reduce((a, b) => a + b, 0) / session.responseLengths.length;
    baseline.engagement.normalLength =
      baseline.engagement.normalLength * (1 - alpha) + avgLength * alpha;
  }

  baseline.engagement.questionRate =
    baseline.engagement.questionRate * (1 - alpha) + session.questionCount * alpha;

  // Update metadata
  baseline.sessionCount++;
  baseline.updatedAt = Date.now();

  await saveUserBaseline(baseline);

  log.info(
    {
      userId,
      sessionCount: baseline.sessionCount,
      fillerRate: baseline.fillers.normalRate.toFixed(2),
      speechRate: baseline.cognitiveLoad.normalSpeechRate.toFixed(0),
    },
    '🎧 User listening baseline updated'
  );
}

/**
 * Clean up session observations
 */
export function cleanupSessionObservations(sessionId: string): void {
  sessionObservations.delete(sessionId);
}

// ============================================================================
// ADDITIONAL FIRESTORE OPERATIONS
// ============================================================================

/**
 * Delete user baseline (for GDPR compliance)
 */
export async function deleteUserBaseline(userId: string): Promise<void> {
  // Remove from cache
  userBaselines.delete(userId);

  // Remove from Firestore
  const db = getFirestore();
  if (!db) return;

  try {
    await db.collection(BASELINES_COLLECTION).doc(userId).delete();
    log.info({ userId }, 'Deleted user listening baseline');
  } catch (error) {
    log.error({ error, userId }, 'Failed to delete user baseline');
  }
}

/**
 * Load baselines for multiple users (for batch operations)
 */
export async function loadBaselinesForUsers(
  userIds: string[]
): Promise<Map<string, UserListeningBaseline>> {
  const results = new Map<string, UserListeningBaseline>();

  if (userIds.length === 0) return results;

  // First check cache
  const uncachedIds: string[] = [];
  for (const userId of userIds) {
    const cached = userBaselines.get(userId);
    if (cached) {
      results.set(userId, cached);
    } else {
      uncachedIds.push(userId);
    }
  }

  if (uncachedIds.length === 0) return results;

  // Load uncached from Firestore
  const db = getFirestore();
  if (!db) return results;

  try {
    // Firestore limits to 10 items per 'in' query
    const chunks: string[][] = [];
    for (let i = 0; i < uncachedIds.length; i += 10) {
      chunks.push(uncachedIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const snapshot = await db
        .collection(BASELINES_COLLECTION)
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data() as UserListeningBaseline;
        userBaselines.set(data.userId, data);
        results.set(data.userId, data);
      }
    }

    log.debug({ requested: userIds.length, found: results.size }, 'Loaded baselines batch');
  } catch (error) {
    log.error({ error }, 'Failed to load baselines batch');
  }

  return results;
}

/**
 * Get all users with baselines (for analytics/admin)
 */
export async function getAllBaselineUserIds(limit = 1000): Promise<string[]> {
  const db = getFirestore();
  if (!db) return Array.from(userBaselines.keys());

  try {
    const snapshot = await db
      .collection(BASELINES_COLLECTION)
      .select() // Only get document IDs, not data
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    log.error({ error }, 'Failed to get baseline user IDs');
    return Array.from(userBaselines.keys());
  }
}

/**
 * Clear in-memory cache (useful for testing)
 */
export function clearCache(): void {
  userBaselines.clear();
  sessionObservations.clear();
  log.debug('Cleared human listening memory cache');
}

// ============================================================================
// SINGLETON EXPORTS
// ============================================================================

export default {
  getUserBaseline,
  loadUserBaseline,
  saveUserBaseline,
  createInitialBaseline,
  initSessionObservations,
  recordTurnObservations,
  getSessionObservations,
  detectDeviations,
  updateBaselineFromSession,
  cleanupSessionObservations,
  deleteUserBaseline,
  loadBaselinesForUsers,
  getAllBaselineUserIds,
  clearCache,
};
