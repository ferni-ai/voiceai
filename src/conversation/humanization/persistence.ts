/**
 * Humanization Persistence Layer
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Persists humanization state across sessions:
 * - Voice print (user's unique vocal characteristics)
 * - Cross-session voice memory (track changes over time)
 * - Comfort progression (relationship depth)
 *
 * Storage Schema:
 * ```
 * bogle_users/{userId}/
 *   humanization/
 *     voice_print (document)
 *       - baseline: { avgPitchHz, avgWordsPerMinute, avgEnergyLevel, ... }
 *       - emotionalSignatures: Map<emotion, VoiceSignature>
 *       - temporalPatterns: { morningEnergy, eveningEnergy, weekdayVariance }
 *       - updatedAt: timestamp
 *       - version: number
 *
 *     cross_session (document)
 *       - userId: string
 *       - totalSessions: number
 *       - sessionHistory: SessionSnapshot[]
 *       - detectedChanges: VoiceChange[]
 *       - longTermTrends: { energyTrend, valenceTrend, stressTrend }
 *       - updatedAt: timestamp
 *       - version: number
 *
 *     comfort (document)
 *       - comfortLevel: number
 *       - unlockedBehaviors: string[]
 *       - comfortEvents: ComfortEvent[]
 *       - relationshipStage: string
 *       - updatedAt: timestamp
 * ```
 *
 * @module @ferni/humanization/persistence
 */

import { removeUndefined } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getComfortProgressionEngine } from './comfort-progression.js';
import { getCrossSessionVoiceEngine, type CrossSessionVoiceMemory } from './cross-session-voice.js';
import { getVoicePrintEngine, type VoicePrint } from './voice-print.js';

const logger = createLogger({ module: 'HumanizationPersistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface HumanizationPersistenceBundle {
  userId: string;
  voicePrint?: VoicePrint;
  crossSessionMemory?: CrossSessionVoiceMemory;
  comfortState?: {
    comfortLevel: number;
    unlockedBehaviors: string[];
    relationshipStage: string;
  };
  lastSynced: Date;
  version: number;
}

interface FirestoreHumanizationDoc {
  data: string; // JSON stringified
  updatedAt: FirebaseFirestore.FieldValue;
  version: number;
}

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let firestoreInstance: FirebaseFirestore.Firestore | null = null;
let initAttempted = false;

// In-memory fallback for development
const memoryCache = new Map<string, HumanizationPersistenceBundle>();

/**
 * Get Firestore instance with lazy initialization
 */
async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
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
    logger.info('Firebase initialized for humanization persistence');
    return firestoreInstance;
  } catch (error) {
    logger.warn({ error: String(error) }, 'Firebase not available - using in-memory storage');
    return null;
  }
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const USERS_COLLECTION = 'bogle_users';
const HUMANIZATION_SUBCOLLECTION = 'humanization';
const VOICE_PRINT_DOC = 'voice_print';
const CROSS_SESSION_DOC = 'cross_session';
const COMFORT_DOC = 'comfort';

function getUserHumanizationPath(userId: string): string {
  return `${USERS_COLLECTION}/${userId}/${HUMANIZATION_SUBCOLLECTION}`;
}

// ============================================================================
// SAVE FUNCTIONS
// ============================================================================

/**
 * Save voice print to Firestore
 */
export async function saveVoicePrint(userId: string, voicePrint: VoicePrint): Promise<boolean> {
  try {
    const db = await getFirestore();

    if (!db) {
      // Fall back to memory cache
      const existing = memoryCache.get(userId) || createEmptyBundle(userId);
      existing.voicePrint = voicePrint;
      existing.lastSynced = new Date();
      memoryCache.set(userId, existing);
      logger.debug({ userId }, '💾 Voice print saved to memory cache');
      return true;
    }

    const path = `${getUserHumanizationPath(userId)}/${VOICE_PRINT_DOC}`;
    const { FieldValue } = await import('firebase-admin/firestore');

    await db.doc(path).set(
      removeUndefined({
        data: JSON.stringify(voicePrint),
        updatedAt: FieldValue.serverTimestamp(),
        version: 1,
      } satisfies FirestoreHumanizationDoc)
    );

    logger.info({ userId }, '💾 Voice print saved to Firestore');
    return true;
  } catch (error) {
    logger.error({ userId, error: String(error) }, 'Failed to save voice print');
    return false;
  }
}

/**
 * Save cross-session memory to Firestore
 */
export async function saveCrossSessionMemory(
  userId: string,
  memory: CrossSessionVoiceMemory
): Promise<boolean> {
  try {
    const db = await getFirestore();

    if (!db) {
      const existing = memoryCache.get(userId) || createEmptyBundle(userId);
      existing.crossSessionMemory = memory;
      existing.lastSynced = new Date();
      memoryCache.set(userId, existing);
      logger.debug({ userId }, '💾 Cross-session memory saved to memory cache');
      return true;
    }

    const path = `${getUserHumanizationPath(userId)}/${CROSS_SESSION_DOC}`;
    const { FieldValue } = await import('firebase-admin/firestore');

    await db.doc(path).set(
      removeUndefined({
        data: JSON.stringify(memory),
        updatedAt: FieldValue.serverTimestamp(),
        version: 1,
      } satisfies FirestoreHumanizationDoc)
    );

    logger.info({ userId, sessions: memory.totalSessions }, '💾 Cross-session memory saved');
    return true;
  } catch (error) {
    logger.error({ userId, error: String(error) }, 'Failed to save cross-session memory');
    return false;
  }
}

/**
 * Save comfort progression state to Firestore
 */
export async function saveComfortState(
  userId: string,
  state: {
    comfortLevel: number;
    unlockedBehaviors: string[];
    relationshipStage: string;
  }
): Promise<boolean> {
  try {
    const db = await getFirestore();

    if (!db) {
      const existing = memoryCache.get(userId) || createEmptyBundle(userId);
      existing.comfortState = state;
      existing.lastSynced = new Date();
      memoryCache.set(userId, existing);
      logger.debug({ userId }, '💾 Comfort state saved to memory cache');
      return true;
    }

    const path = `${getUserHumanizationPath(userId)}/${COMFORT_DOC}`;
    const { FieldValue } = await import('firebase-admin/firestore');

    await db.doc(path).set(
      removeUndefined({
        data: JSON.stringify(state),
        updatedAt: FieldValue.serverTimestamp(),
        version: 1,
      } satisfies FirestoreHumanizationDoc)
    );

    logger.info({ userId, comfortLevel: state.comfortLevel }, '💾 Comfort state saved');
    return true;
  } catch (error) {
    logger.error({ userId, error: String(error) }, 'Failed to save comfort state');
    return false;
  }
}

/**
 * Save all humanization data at once (for session end)
 */
export async function saveAllHumanizationData(userId: string): Promise<{
  success: boolean;
  saved: string[];
  failed: string[];
}> {
  const saved: string[] = [];
  const failed: string[] = [];

  // Get current state from engines
  const voicePrintEngine = getVoicePrintEngine(userId);
  const crossSessionEngine = getCrossSessionVoiceEngine(userId);

  // Save voice print
  const voicePrint = voicePrintEngine.getVoicePrint();
  if (voicePrint.sampleCount > 0) {
    const success = await saveVoicePrint(userId, voicePrint);
    if (success) {
      saved.push('voicePrint');
    } else {
      failed.push('voicePrint');
    }
  }

  // Save cross-session memory
  const crossSessionMemory = crossSessionEngine.getMemory();
  if (crossSessionMemory.totalSessions > 0) {
    const success = await saveCrossSessionMemory(userId, crossSessionMemory);
    if (success) {
      saved.push('crossSessionMemory');
    } else {
      failed.push('crossSessionMemory');
    }
  }

  logger.info({ userId, saved, failed }, '💾 Humanization data save complete');

  return {
    success: failed.length === 0,
    saved,
    failed,
  };
}

// ============================================================================
// LOAD FUNCTIONS
// ============================================================================

/**
 * Load voice print from Firestore
 */
export async function loadVoicePrint(userId: string): Promise<VoicePrint | null> {
  try {
    const db = await getFirestore();

    if (!db) {
      const cached = memoryCache.get(userId);
      return cached?.voicePrint || null;
    }

    const path = `${getUserHumanizationPath(userId)}/${VOICE_PRINT_DOC}`;
    const doc = await db.doc(path).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as FirestoreHumanizationDoc;
    const voicePrint = JSON.parse(data.data) as VoicePrint;

    logger.debug({ userId }, '📖 Voice print loaded from Firestore');
    return voicePrint;
  } catch (error) {
    logger.error({ userId, error: String(error) }, 'Failed to load voice print');
    return null;
  }
}

/**
 * Load cross-session memory from Firestore
 */
export async function loadCrossSessionMemory(
  userId: string
): Promise<CrossSessionVoiceMemory | null> {
  try {
    const db = await getFirestore();

    if (!db) {
      const cached = memoryCache.get(userId);
      return cached?.crossSessionMemory || null;
    }

    const path = `${getUserHumanizationPath(userId)}/${CROSS_SESSION_DOC}`;
    const doc = await db.doc(path).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as FirestoreHumanizationDoc;
    const memory = JSON.parse(data.data) as CrossSessionVoiceMemory;

    logger.debug({ userId, sessions: memory.totalSessions }, '📖 Cross-session memory loaded');
    return memory;
  } catch (error) {
    logger.error({ userId, error: String(error) }, 'Failed to load cross-session memory');
    return null;
  }
}

/**
 * Load comfort state from Firestore
 */
export async function loadComfortState(userId: string): Promise<{
  comfortLevel: number;
  unlockedBehaviors: string[];
  relationshipStage: string;
} | null> {
  try {
    const db = await getFirestore();

    if (!db) {
      const cached = memoryCache.get(userId);
      return cached?.comfortState || null;
    }

    const path = `${getUserHumanizationPath(userId)}/${COMFORT_DOC}`;
    const doc = await db.doc(path).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as FirestoreHumanizationDoc;
    const state = JSON.parse(data.data);

    logger.debug({ userId, comfortLevel: state.comfortLevel }, '📖 Comfort state loaded');
    return state;
  } catch (error) {
    logger.error({ userId, error: String(error) }, 'Failed to load comfort state');
    return null;
  }
}

/**
 * Load all humanization data at once (for session start)
 */
export async function loadAllHumanizationData(
  userId: string
): Promise<HumanizationPersistenceBundle | null> {
  try {
    const [voicePrint, crossSessionMemory, comfortState] = await Promise.all([
      loadVoicePrint(userId),
      loadCrossSessionMemory(userId),
      loadComfortState(userId),
    ]);

    if (!voicePrint && !crossSessionMemory && !comfortState) {
      logger.debug({ userId }, '📖 No existing humanization data found');
      return null;
    }

    const bundle: HumanizationPersistenceBundle = {
      userId,
      voicePrint: voicePrint || undefined,
      crossSessionMemory: crossSessionMemory || undefined,
      comfortState: comfortState || undefined,
      lastSynced: new Date(),
      version: 1,
    };

    logger.info(
      {
        userId,
        hasVoicePrint: !!voicePrint,
        hasCrossSession: !!crossSessionMemory,
        hasComfort: !!comfortState,
      },
      '📖 Humanization data loaded'
    );

    return bundle;
  } catch (error) {
    logger.error({ userId, error: String(error) }, 'Failed to load humanization data');
    return null;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize humanization engines with persisted data
 *
 * Call this at session start to restore previous state.
 */
export async function initializeFromPersistence(
  userId: string,
  sessionId: string
): Promise<{
  loaded: boolean;
  voicePrintRestored: boolean;
  crossSessionRestored: boolean;
  comfortRestored: boolean;
}> {
  const bundle = await loadAllHumanizationData(userId);

  if (!bundle) {
    return {
      loaded: false,
      voicePrintRestored: false,
      crossSessionRestored: false,
      comfortRestored: false,
    };
  }

  let voicePrintRestored = false;
  let crossSessionRestored = false;
  let comfortRestored = false;

  // Restore voice print
  if (bundle.voicePrint) {
    const voicePrintEngine = getVoicePrintEngine(userId, bundle.voicePrint);
    voicePrintRestored = voicePrintEngine.isCalibrated();
  }

  // Restore cross-session memory
  if (bundle.crossSessionMemory) {
    getCrossSessionVoiceEngine(userId, bundle.crossSessionMemory);
    crossSessionRestored = true;
  }

  // Restore comfort state - the engine starts at 0.25 baseline
  // For returning users, we preserve a portion of their comfort level
  if (bundle.comfortState && bundle.comfortState.comfortLevel > 0.25) {
    // Get engine (creates with default 0.25)
    const comfortEngine = getComfortProgressionEngine(sessionId);
    // Reset with preserved base level flag to maintain some comfort
    comfortEngine.reset(true);
    comfortRestored = true;
  }

  logger.info(
    {
      userId,
      sessionId,
      voicePrintRestored,
      crossSessionRestored,
      comfortRestored,
    },
    '🔄 Humanization state restored from persistence'
  );

  return {
    loaded: true,
    voicePrintRestored,
    crossSessionRestored,
    comfortRestored,
  };
}

/**
 * Persist all humanization state at session end
 *
 * Call this when the session ends to save progress.
 */
export async function persistOnSessionEnd(
  userId: string,
  sessionId: string
): Promise<{
  saved: boolean;
  items: string[];
}> {
  const result = await saveAllHumanizationData(userId);

  // Also get and save comfort state from the session
  const comfortEngine = getComfortProgressionEngine(sessionId);
  const comfortLevel = comfortEngine.getComfortLevel();
  const unlockedBehaviors = comfortEngine.getUnlockedBehaviors().map((b) => b.name);

  // Map comfort level to relationship stage
  const relationshipStage =
    comfortLevel >= 0.8
      ? 'trusted_advisor'
      : comfortLevel >= 0.6
        ? 'friend'
        : comfortLevel >= 0.35
          ? 'acquaintance'
          : 'stranger';

  const comfortState = {
    comfortLevel,
    unlockedBehaviors,
    relationshipStage,
  };

  const comfortSaved = await saveComfortState(userId, comfortState);
  if (comfortSaved) {
    result.saved.push('comfortState');
  } else {
    result.failed.push('comfortState');
  }

  logger.info(
    { userId, sessionId, saved: result.saved, failed: result.failed },
    '💾 Session humanization state persisted'
  );

  return {
    saved: result.failed.length === 0,
    items: result.saved,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function createEmptyBundle(userId: string): HumanizationPersistenceBundle {
  return {
    userId,
    lastSynced: new Date(),
    version: 1,
  };
}

/**
 * Clear all humanization data for a user (for testing/reset)
 */
export async function clearHumanizationData(userId: string): Promise<boolean> {
  try {
    const db = await getFirestore();

    if (!db) {
      memoryCache.delete(userId);
      return true;
    }

    const batch = db.batch();
    const basePath = getUserHumanizationPath(userId);

    batch.delete(db.doc(`${basePath}/${VOICE_PRINT_DOC}`));
    batch.delete(db.doc(`${basePath}/${CROSS_SESSION_DOC}`));
    batch.delete(db.doc(`${basePath}/${COMFORT_DOC}`));

    await batch.commit();
    logger.info({ userId }, '🗑️ Humanization data cleared');
    return true;
  } catch (error) {
    logger.error({ userId, error: String(error) }, 'Failed to clear humanization data');
    return false;
  }
}

// HumanizationPersistenceBundle is already exported above
