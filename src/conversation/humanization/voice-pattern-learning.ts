/**
 * Voice Pattern Learning
 *
 * Learns and persists user voice preferences across sessions:
 * - Preferred agent speaking pace (WPM)
 * - Comfortable turn gap duration
 * - Interruption style preferences
 * - Time-of-day patterns (morning energy vs late night calm)
 *
 * Uses exponential moving average for smooth adaptation and
 * Bayesian updates for boolean preferences.
 *
 * @module @ferni/humanization/voice-pattern-learning
 */

import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'VoicePatternLearning' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Time of day bucket for pattern analysis
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'lateNight';

/**
 * Voice pattern observation from a single turn
 */
export interface VoiceObservation {
  /** User's words per minute */
  userWpm?: number;
  /** Agent's words per minute that user seemed comfortable with */
  agentWpm?: number;
  /** Gap between user stop and agent start (ms) */
  turnGapMs?: number;
  /** Did user interrupt the agent? */
  userInterrupted?: boolean;
  /** Did user seem to want more time before agent spoke? */
  wantedMoreGap?: boolean;
  /** User's energy level (0-1) */
  userEnergy?: number;
  /** Timestamp of observation */
  timestamp: number;
}

/**
 * Time-of-day specific patterns
 */
export interface TimeOfDayPattern {
  /** Average WPM preference for this time */
  preferredWpm: number;
  /** Average turn gap preference (ms) */
  preferredGapMs: number;
  /** Average energy level */
  avgEnergy: number;
  /** Number of observations */
  sampleCount: number;
}

/**
 * Persisted voice pattern data
 */
export interface VoicePatternData {
  /** User ID */
  userId: string;

  /** Overall preferred agent WPM */
  preferredAgentWpm: number;

  /** Overall preferred turn gap (ms) */
  preferredTurnGapMs: number;

  /** Does user frequently interrupt? (0-1 probability) */
  interruptionProbability: number;

  /** Does user prefer quick responses? */
  prefersQuickResponses: boolean;

  /** Time-of-day specific patterns */
  timeOfDayPatterns: Record<TimeOfDay, TimeOfDayPattern>;

  /** Total number of sessions */
  sessionCount: number;

  /** Total observations across all sessions */
  totalObservations: number;

  /** Confidence level (0-1) */
  confidence: number;

  /** Last updated timestamp */
  updatedAt: string;

  /** Schema version */
  version: number;
}

/**
 * Session-scoped voice pattern engine
 */
export interface VoicePatternEngine {
  sessionId: string;
  userId: string;
  observations: VoiceObservation[];
  sessionStartTime: number;
  persistedData: VoicePatternData | null;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const VOICE_PATTERN_CONFIG = {
  /** Smoothing factor for EMA (higher = more weight on new observations) */
  EMA_ALPHA: 0.15,

  /** Prior strength for Bayesian updates */
  BAYESIAN_PRIOR_STRENGTH: 5,

  /** Minimum observations for reliable pattern */
  MIN_OBSERVATIONS: 10,

  /** Maximum observations to store per session */
  MAX_SESSION_OBSERVATIONS: 100,

  /** Default values */
  DEFAULTS: {
    agentWpm: 150,
    turnGapMs: 800,
    interruptionProbability: 0.1,
  },

  /** Time-of-day hour boundaries */
  TIME_BUCKETS: {
    morning: { start: 5, end: 12 },
    afternoon: { start: 12, end: 17 },
    evening: { start: 17, end: 21 },
    lateNight: { start: 21, end: 5 },
  },
};

// ============================================================================
// SESSION-SCOPED ENGINES
// ============================================================================

const engines = new Map<string, VoicePatternEngine>();

/**
 * Get or create voice pattern engine for a session
 */
export function getVoicePatternEngine(
  sessionId: string,
  userId: string,
  persistedData?: VoicePatternData
): VoicePatternEngine {
  const key = sessionId;

  if (!engines.has(key)) {
    engines.set(cleanForFirestore(key), {
      sessionId,
      userId,
      observations: [],
      sessionStartTime: Date.now(),
      persistedData: persistedData || null,
    });

    if (persistedData) {
      log.info(
        {
          sessionId,
          userId,
          sessionCount: persistedData.sessionCount,
          confidence: persistedData.confidence.toFixed(2),
        },
        '📖 Voice patterns restored from persistence'
      );
    }
  }

  return engines.get(key)!;
}

/**
 * Reset voice pattern engine for a session
 */
export function resetVoicePatternEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    log.debug(
      { sessionId, observationCount: engine.observations.length },
      'Resetting voice pattern engine'
    );
  }
  engines.delete(sessionId);
}

/**
 * Get count of active engines
 */
export function getActiveVoicePatternEngineCount(): number {
  return engines.size;
}

// ============================================================================
// OBSERVATION RECORDING
// ============================================================================

/**
 * Get current time-of-day bucket
 */
export function getCurrentTimeOfDay(timestamp: number = Date.now()): TimeOfDay {
  const hour = new Date(timestamp).getHours();
  const { TIME_BUCKETS } = VOICE_PATTERN_CONFIG;

  if (hour >= TIME_BUCKETS.morning.start && hour < TIME_BUCKETS.morning.end) {
    return 'morning';
  } else if (hour >= TIME_BUCKETS.afternoon.start && hour < TIME_BUCKETS.afternoon.end) {
    return 'afternoon';
  } else if (hour >= TIME_BUCKETS.evening.start && hour < TIME_BUCKETS.evening.end) {
    return 'evening';
  } else {
    return 'lateNight';
  }
}

/**
 * Record a voice observation for the session
 */
export function recordVoiceObservation(sessionId: string, observation: VoiceObservation): void {
  const engine = engines.get(sessionId);
  if (!engine) {
    log.warn({ sessionId }, 'No voice pattern engine found for session');
    return;
  }

  // Add observation
  engine.observations.push({
    ...observation,
    timestamp: observation.timestamp || Date.now(),
  });

  // Trim if too many
  if (engine.observations.length > VOICE_PATTERN_CONFIG.MAX_SESSION_OBSERVATIONS) {
    engine.observations = engine.observations.slice(-VOICE_PATTERN_CONFIG.MAX_SESSION_OBSERVATIONS);
  }

  log.debug(
    {
      sessionId,
      agentWpm: observation.agentWpm,
      turnGapMs: observation.turnGapMs,
      observationCount: engine.observations.length,
    },
    'Recorded voice observation'
  );
}

// ============================================================================
// PATTERN CALCULATION
// ============================================================================

/**
 * Exponential moving average update
 */
function emaUpdate(
  current: number,
  newValue: number,
  alpha: number = VOICE_PATTERN_CONFIG.EMA_ALPHA
): number {
  return alpha * newValue + (1 - alpha) * current;
}

/**
 * Bayesian update for probability estimate
 */
function bayesianUpdate(
  prior: number,
  observed: boolean,
  priorStrength: number = VOICE_PATTERN_CONFIG.BAYESIAN_PRIOR_STRENGTH
): number {
  // Beta distribution update
  const alpha = prior * priorStrength;
  const beta = (1 - prior) * priorStrength;

  const newAlpha = alpha + (observed ? 1 : 0);
  const newBeta = beta + (observed ? 0 : 1);

  return newAlpha / (newAlpha + newBeta);
}

/**
 * Calculate confidence based on session count
 */
function calculateConfidence(sessionCount: number, observations: number): number {
  // Formula: min(0.95, 0.3 + 0.1 * sqrt(sessions) + 0.01 * min(observations, 100))
  const sessionBonus = 0.1 * Math.sqrt(sessionCount);
  const observationBonus = 0.01 * Math.min(observations, 100);
  return Math.min(0.95, 0.3 + sessionBonus + observationBonus);
}

/**
 * Get voice patterns for the current session
 */
export function getVoicePatterns(sessionId: string): VoicePatternData | null {
  const engine = engines.get(sessionId);
  if (!engine) {
    return null;
  }

  // Start with persisted data or defaults
  const base = engine.persistedData || createDefaultPatternData(engine.userId);

  // If no new observations, return base
  if (engine.observations.length === 0) {
    return base;
  }

  // Apply EMA updates from session observations
  let preferredAgentWpm = base.preferredAgentWpm;
  let preferredTurnGapMs = base.preferredTurnGapMs;
  let interruptionProbability = base.interruptionProbability;
  const timeOfDayPatterns = { ...base.timeOfDayPatterns };

  for (const obs of engine.observations) {
    // Update WPM preference
    if (obs.agentWpm !== undefined) {
      preferredAgentWpm = emaUpdate(preferredAgentWpm, obs.agentWpm);
    }

    // Update turn gap preference
    if (obs.turnGapMs !== undefined) {
      preferredTurnGapMs = emaUpdate(preferredTurnGapMs, obs.turnGapMs);
    }

    // Update interruption probability
    if (obs.userInterrupted !== undefined) {
      interruptionProbability = bayesianUpdate(interruptionProbability, obs.userInterrupted);
    }

    // Update time-of-day patterns
    const timeOfDay = getCurrentTimeOfDay(obs.timestamp);
    const todPattern = timeOfDayPatterns[timeOfDay];

    if (obs.agentWpm !== undefined) {
      todPattern.preferredWpm = emaUpdate(todPattern.preferredWpm, obs.agentWpm);
      todPattern.sampleCount++;
    }
    if (obs.turnGapMs !== undefined) {
      todPattern.preferredGapMs = emaUpdate(todPattern.preferredGapMs, obs.turnGapMs);
    }
    if (obs.userEnergy !== undefined) {
      todPattern.avgEnergy = emaUpdate(todPattern.avgEnergy, obs.userEnergy);
    }
  }

  // Calculate confidence
  const totalObservations = base.totalObservations + engine.observations.length;
  const confidence = calculateConfidence(base.sessionCount + 1, totalObservations);

  return {
    userId: engine.userId,
    preferredAgentWpm: Math.round(preferredAgentWpm),
    preferredTurnGapMs: Math.round(preferredTurnGapMs),
    interruptionProbability: Math.round(interruptionProbability * 100) / 100,
    prefersQuickResponses: preferredTurnGapMs < 600,
    timeOfDayPatterns,
    sessionCount: base.sessionCount + 1,
    totalObservations,
    confidence,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Get recommended agent WPM for current context
 */
export function getRecommendedAgentWpm(sessionId: string): number {
  const patterns = getVoicePatterns(sessionId);
  if (!patterns || patterns.confidence < 0.4) {
    return VOICE_PATTERN_CONFIG.DEFAULTS.agentWpm;
  }

  // Check for time-of-day specific pattern
  const timeOfDay = getCurrentTimeOfDay();
  const todPattern = patterns.timeOfDayPatterns[timeOfDay];

  if (todPattern.sampleCount >= 3) {
    // Blend overall preference with time-of-day preference
    return Math.round(patterns.preferredAgentWpm * 0.6 + todPattern.preferredWpm * 0.4);
  }

  return patterns.preferredAgentWpm;
}

/**
 * Get recommended turn gap for current context
 */
export function getRecommendedTurnGap(sessionId: string): number {
  const patterns = getVoicePatterns(sessionId);
  if (!patterns || patterns.confidence < 0.4) {
    return VOICE_PATTERN_CONFIG.DEFAULTS.turnGapMs;
  }

  const timeOfDay = getCurrentTimeOfDay();
  const todPattern = patterns.timeOfDayPatterns[timeOfDay];

  if (todPattern.sampleCount >= 3) {
    return Math.round(patterns.preferredTurnGapMs * 0.6 + todPattern.preferredGapMs * 0.4);
  }

  return patterns.preferredTurnGapMs;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const USERS_COLLECTION = 'bogle_users';
const HUMANIZATION_SUBCOLLECTION = 'humanization';
const VOICE_PATTERN_DOC = 'voice_patterns';

let firestoreInstance: FirebaseFirestore.Firestore | null = null;
let initAttempted = false;
const memoryCache = new Map<string, VoicePatternData>();

/**
 * Get Firestore instance with lazy initialization
 */
async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted) return null;
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
    log.info('Firebase initialized for voice pattern persistence');
    return firestoreInstance;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firebase not available - using in-memory storage');
    return null;
  }
}

/**
 * Create default pattern data for new users
 */
function createDefaultPatternData(userId: string): VoicePatternData {
  const defaultTodPattern: TimeOfDayPattern = {
    preferredWpm: VOICE_PATTERN_CONFIG.DEFAULTS.agentWpm,
    preferredGapMs: VOICE_PATTERN_CONFIG.DEFAULTS.turnGapMs,
    avgEnergy: 0.5,
    sampleCount: 0,
  };

  return {
    userId,
    preferredAgentWpm: VOICE_PATTERN_CONFIG.DEFAULTS.agentWpm,
    preferredTurnGapMs: VOICE_PATTERN_CONFIG.DEFAULTS.turnGapMs,
    interruptionProbability: VOICE_PATTERN_CONFIG.DEFAULTS.interruptionProbability,
    prefersQuickResponses: false,
    timeOfDayPatterns: {
      morning: { ...defaultTodPattern },
      afternoon: { ...defaultTodPattern },
      evening: { ...defaultTodPattern },
      lateNight: { ...defaultTodPattern },
    },
    sessionCount: 0,
    totalObservations: 0,
    confidence: 0.3,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Load voice patterns from Firestore
 */
export async function loadVoicePatterns(userId: string): Promise<VoicePatternData | null> {
  try {
    const db = await getFirestore();

    if (!db) {
      const cached = memoryCache.get(userId);
      return cached || null;
    }

    const path = `${USERS_COLLECTION}/${userId}/${HUMANIZATION_SUBCOLLECTION}/${VOICE_PATTERN_DOC}`;
    const doc = await db.doc(path).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as VoicePatternData;
    log.debug(
      { userId, sessionCount: data.sessionCount, confidence: data.confidence },
      '📖 Voice patterns loaded from Firestore'
    );
    return data;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to load voice patterns');
    return null;
  }
}

/**
 * Save voice patterns to Firestore
 */
export async function saveVoicePatterns(patterns: VoicePatternData): Promise<boolean> {
  try {
    const db = await getFirestore();

    if (!db) {
      memoryCache.set(patterns.userId, patterns);
      log.debug({ userId: patterns.userId }, '💾 Voice patterns saved to memory cache');
      return true;
    }

    const path = `${USERS_COLLECTION}/${patterns.userId}/${HUMANIZATION_SUBCOLLECTION}/${VOICE_PATTERN_DOC}`;
    const { FieldValue } = await import('firebase-admin/firestore');

    await db.doc(path).set(
      removeUndefined({
        ...patterns,
        updatedAt: FieldValue.serverTimestamp(),
      })
    );

    log.info(
      {
        userId: patterns.userId,
        sessionCount: patterns.sessionCount,
        confidence: patterns.confidence.toFixed(2),
      },
      '💾 Voice patterns saved to Firestore'
    );
    return true;
  } catch (error) {
    log.error({ userId: patterns.userId, error: String(error) }, 'Failed to save voice patterns');
    return false;
  }
}

/**
 * Initialize voice patterns at session start
 */
export async function initializeVoicePatterns(
  sessionId: string,
  userId: string
): Promise<VoicePatternData | null> {
  // Load persisted data
  const persisted = await loadVoicePatterns(userId);

  // Create engine with persisted data
  getVoicePatternEngine(sessionId, userId, persisted || undefined);

  return persisted;
}

/**
 * Persist voice patterns at session end
 */
export async function persistVoicePatterns(sessionId: string): Promise<boolean> {
  const patterns = getVoicePatterns(sessionId);
  if (!patterns) {
    log.debug({ sessionId }, 'No voice patterns to persist');
    return false;
  }

  return saveVoicePatterns(patterns);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const voicePatternLearning = {
  // Engine management
  getEngine: getVoicePatternEngine,
  resetEngine: resetVoicePatternEngine,
  getActiveCount: getActiveVoicePatternEngineCount,

  // Observation
  record: recordVoiceObservation,
  getPatterns: getVoicePatterns,

  // Recommendations
  getRecommendedWpm: getRecommendedAgentWpm,
  getRecommendedGap: getRecommendedTurnGap,

  // Persistence
  initialize: initializeVoicePatterns,
  persist: persistVoicePatterns,
  load: loadVoicePatterns,
  save: saveVoicePatterns,

  // Utilities
  getTimeOfDay: getCurrentTimeOfDay,
  config: VOICE_PATTERN_CONFIG,
};
