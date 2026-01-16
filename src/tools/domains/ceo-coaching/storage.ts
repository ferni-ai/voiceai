/**
 * CEO Coaching Storage Layer
 *
 * Firestore persistence for CEO coaching data.
 * All data stored under: bogle_users/{userId}/ceo_{collection}
 *
 * Collections:
 * - ceo_wins: Achievement tracking
 * - ceo_energy: Energy level logs
 * - ceo_gratitude: Gratitude entries
 * - ceo_journal: Journal entries
 * - ceo_decisions: Decision tracking
 * - ceo_priorities: Priority stack
 * - ceo_blockers: Active/resolved blockers
 * - ceo_ideas: Captured ideas
 * - ceo_focus_sessions: Focus session history
 * - ceo_reflections: Daily reflections
 * - ceo_weekly_reviews: Weekly reviews
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type {
  CEOWin,
  CEOEnergy,
  CEOGratitude,
  CEOJournalEntry,
  CEODecision,
  CEOPriority,
  CEOBlocker,
  CEOIdea,
  CEOFocusSession,
  CEOReflection,
  CEOWeeklyReview,
  CEOCoachingState,
} from './types.js';

const log = createLogger({ module: 'ceo-coaching-storage' });

// ============================================================================
// TTL CONFIGURATION (days until automatic expiration)
// ============================================================================

/**
 * TTL values for CEO coaching data.
 * High-value reflective data: 2 years
 * Operational/transient data: 1 year
 */
export const CEO_TTL_DAYS = {
  WIN: 730,           // 2 years - achievements worth keeping
  ENERGY: 365,        // 1 year - transient health data
  GRATITUDE: 730,     // 2 years - emotional content
  JOURNAL: 730,       // 2 years - personal reflections
  DECISION: 730,      // 2 years - important decisions
  PRIORITY: 365,      // 1 year - operational
  BLOCKER: 365,       // 1 year - operational
  IDEA: 730,          // 2 years - worth keeping
  FOCUS_SESSION: 365, // 1 year - operational
  REFLECTION: 730,    // 2 years - valuable insights
  WEEKLY_REVIEW: 730, // 2 years - valuable summaries
} as const;

/**
 * Calculate expiration date for TTL-enabled documents
 */
function calculateExpiresAt(ttlDays: number): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);
  return expiresAt.toISOString();
}

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

async function getDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');
    return getFirestoreDb();
  } catch {
    log.debug('Firestore not available');
    return null;
  }
}

function getUserCollection(
  db: FirebaseFirestore.Firestore,
  userId: string,
  collection: string
): FirebaseFirestore.CollectionReference {
  return db.collection('bogle_users').doc(userId).collection(collection);
}

// ============================================================================
// CACHE
// ============================================================================

const stateCache = new Map<string, { state: CEOCoachingState; loadedAt: number }>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function invalidateCache(userId: string): void {
  stateCache.delete(userId);
}

// ============================================================================
// ID GENERATION
// ============================================================================

function generateId(): string {
  return `ceo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================================================
// WINS
// ============================================================================

export async function saveWin(userId: string, win: Omit<CEOWin, 'id' | 'createdAt'>): Promise<CEOWin> {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = generateId();

  const fullWin: CEOWin = {
    id,
    ...win,
    createdAt: now,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...fullWin,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.WIN),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_wins')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, winId: id }, 'Saved CEO win');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save CEO win');
    }
  }

  invalidateCache(userId);
  return fullWin;
}

export async function getRecentWins(userId: string, days = 7): Promise<CEOWin[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const snapshot = await getUserCollection(db, userId, 'ceo_wins')
      .where('date', '>=', cutoffStr)
      .orderBy('date', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CEOWin);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get recent wins');
    return [];
  }
}

// ============================================================================
// ENERGY
// ============================================================================

export async function logEnergy(
  userId: string,
  level: number,
  note?: string
): Promise<CEOEnergy> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const entry: CEOEnergy = {
    id,
    level: Math.min(10, Math.max(1, level)), // Clamp 1-10
    timestamp: now,
    note,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...entry,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.ENERGY),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_energy')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, level }, 'Logged CEO energy');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to log energy');
    }
  }

  invalidateCache(userId);
  return entry;
}

export async function getEnergyTrend(
  userId: string,
  days = 7
): Promise<{ current?: number; weekAverage?: number; trend: 'up' | 'down' | 'stable' }> {
  const db = await getDb();
  if (!db) return { trend: 'stable' };

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const snapshot = await getUserCollection(db, userId, 'ceo_energy')
      .where('timestamp', '>=', cutoff.toISOString())
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    const entries = snapshot.docs.map((doc) => doc.data() as CEOEnergy);
    if (entries.length === 0) return { trend: 'stable' };

    const current = entries[0].level;
    const weekAverage = entries.reduce((sum, e) => sum + e.level, 0) / entries.length;

    // Compare first half vs second half for trend
    const mid = Math.floor(entries.length / 2);
    const recentHalf = entries.slice(0, mid);
    const olderHalf = entries.slice(mid);

    const recentAvg = recentHalf.length > 0
      ? recentHalf.reduce((sum, e) => sum + e.level, 0) / recentHalf.length
      : weekAverage;
    const olderAvg = olderHalf.length > 0
      ? olderHalf.reduce((sum, e) => sum + e.level, 0) / olderHalf.length
      : weekAverage;

    const diff = recentAvg - olderAvg;
    const trend = diff > 0.5 ? 'up' : diff < -0.5 ? 'down' : 'stable';

    return { current, weekAverage: Math.round(weekAverage * 10) / 10, trend };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get energy trend');
    return { trend: 'stable' };
  }
}

/**
 * Get raw energy entries for streak detection
 */
export async function getRecentEnergyEntries(userId: string, days = 7): Promise<CEOEnergy[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const snapshot = await getUserCollection(db, userId, 'ceo_energy')
      .where('timestamp', '>=', cutoff.toISOString())
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CEOEnergy);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get energy entries');
    return [];
  }
}

// ============================================================================
// GRATITUDE
// ============================================================================

export async function logGratitude(
  userId: string,
  text: string
): Promise<CEOGratitude> {
  const db = await getDb();
  const id = generateId();
  const now = new Date();

  const entry: CEOGratitude = {
    id,
    text,
    date: now.toISOString().split('T')[0],
    createdAt: now.toISOString(),
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...entry,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.GRATITUDE),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_gratitude')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId }, 'Logged gratitude');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to log gratitude');
    }
  }

  invalidateCache(userId);
  return entry;
}

export async function getRecentGratitude(userId: string, limit = 10): Promise<CEOGratitude[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const snapshot = await getUserCollection(db, userId, 'ceo_gratitude')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CEOGratitude);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get recent gratitude');
    return [];
  }
}

// ============================================================================
// JOURNAL
// ============================================================================

export async function saveJournalEntry(
  userId: string,
  text: string,
  mood?: CEOJournalEntry['mood']
): Promise<CEOJournalEntry> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const entry: CEOJournalEntry = {
    id,
    text,
    timestamp: now,
    mood,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...entry,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.JOURNAL),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_journal')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId }, 'Saved journal entry');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save journal entry');
    }
  }

  invalidateCache(userId);
  return entry;
}

// ============================================================================
// DECISIONS
// ============================================================================

export async function trackDecision(
  userId: string,
  description: string,
  context?: string
): Promise<CEODecision> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const decision: CEODecision = {
    id,
    description,
    status: 'pending',
    context,
    createdAt: now,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...decision,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.DECISION),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_decisions')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, decisionId: id }, 'Tracked decision');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to track decision');
    }
  }

  invalidateCache(userId);
  return decision;
}

export async function updateDecision(
  userId: string,
  decisionId: string,
  updates: Partial<Pick<CEODecision, 'status' | 'outcome'>>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const updateData: Record<string, unknown> = { ...updates };
    if (updates.status === 'made') {
      updateData.decidedAt = new Date().toISOString();
    }

    await getUserCollection(db, userId, 'ceo_decisions')
      .doc(decisionId)
      .update(cleanForFirestore(updateData));

    invalidateCache(userId);
    log.debug({ userId, decisionId }, 'Updated decision');
  } catch (error) {
    log.error({ error: String(error), userId, decisionId }, 'Failed to update decision');
  }
}

export async function getPendingDecisions(userId: string): Promise<CEODecision[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const snapshot = await getUserCollection(db, userId, 'ceo_decisions')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CEODecision);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get pending decisions');
    return [];
  }
}

// ============================================================================
// PRIORITIES
// ============================================================================

export async function addPriority(userId: string, text: string): Promise<CEOPriority> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  // Get current max order
  const existing = await getPriorities(userId);
  const maxOrder = existing.reduce((max, p) => Math.max(max, p.order), 0);

  const priority: CEOPriority = {
    id,
    text,
    order: maxOrder + 1,
    status: 'active',
    createdAt: now,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...priority,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.PRIORITY),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_priorities')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, priorityId: id }, 'Added priority');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to add priority');
    }
  }

  invalidateCache(userId);
  return priority;
}

export async function getPriorities(userId: string): Promise<CEOPriority[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const snapshot = await getUserCollection(db, userId, 'ceo_priorities')
      .where('status', '==', 'active')
      .orderBy('order', 'asc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CEOPriority);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get priorities');
    return [];
  }
}

export async function completePriority(userId: string, priorityId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await getUserCollection(db, userId, 'ceo_priorities')
      .doc(priorityId)
      .update({
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

    invalidateCache(userId);
    log.debug({ userId, priorityId }, 'Completed priority');
  } catch (error) {
    log.error({ error: String(error), userId, priorityId }, 'Failed to complete priority');
  }
}

export async function reorderPriorities(userId: string, orderedIds: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const batch = db.batch();
    orderedIds.forEach((id, index) => {
      const ref = getUserCollection(db, userId, 'ceo_priorities').doc(id);
      batch.update(ref, { order: index + 1 });
    });
    await batch.commit();

    invalidateCache(userId);
    log.debug({ userId, count: orderedIds.length }, 'Reordered priorities');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to reorder priorities');
  }
}

// ============================================================================
// BLOCKERS
// ============================================================================

export async function addBlocker(userId: string, text: string): Promise<CEOBlocker> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const blocker: CEOBlocker = {
    id,
    text,
    status: 'active',
    createdAt: now,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...blocker,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.BLOCKER),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_blockers')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, blockerId: id }, 'Added blocker');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to add blocker');
    }
  }

  invalidateCache(userId);
  return blocker;
}

export async function resolveBlocker(
  userId: string,
  blockerId: string,
  resolution?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await getUserCollection(db, userId, 'ceo_blockers')
      .doc(blockerId)
      .update(cleanForFirestore({
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolution,
      }));

    invalidateCache(userId);
    log.debug({ userId, blockerId }, 'Resolved blocker');
  } catch (error) {
    log.error({ error: String(error), userId, blockerId }, 'Failed to resolve blocker');
  }
}

export async function getActiveBlockers(userId: string): Promise<CEOBlocker[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const snapshot = await getUserCollection(db, userId, 'ceo_blockers')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CEOBlocker);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get active blockers');
    return [];
  }
}

// ============================================================================
// IDEAS
// ============================================================================

export async function captureIdea(
  userId: string,
  text: string,
  tags: string[] = []
): Promise<CEOIdea> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const idea: CEOIdea = {
    id,
    text,
    tags,
    createdAt: now,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...idea,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.IDEA),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_ideas')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, ideaId: id }, 'Captured idea');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to capture idea');
    }
  }

  invalidateCache(userId);
  return idea;
}

export async function getRecentIdeas(userId: string, limit = 20): Promise<CEOIdea[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const snapshot = await getUserCollection(db, userId, 'ceo_ideas')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CEOIdea);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get recent ideas');
    return [];
  }
}

// ============================================================================
// FOCUS SESSIONS
// ============================================================================

export async function startFocusSession(
  userId: string,
  durationMinutes: number,
  task?: string
): Promise<CEOFocusSession> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const session: CEOFocusSession = {
    id,
    task,
    durationMinutes,
    startedAt: now,
    status: 'active',
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...session,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.FOCUS_SESSION),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_focus_sessions')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, sessionId: id, durationMinutes }, 'Started focus session');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to start focus session');
    }
  }

  invalidateCache(userId);
  return session;
}

export async function endFocusSession(
  userId: string,
  sessionId: string,
  status: 'completed' | 'interrupted' = 'completed'
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await getUserCollection(db, userId, 'ceo_focus_sessions')
      .doc(sessionId)
      .update({
        status,
        endedAt: new Date().toISOString(),
      });

    invalidateCache(userId);
    log.debug({ userId, sessionId, status }, 'Ended focus session');
  } catch (error) {
    log.error({ error: String(error), userId, sessionId }, 'Failed to end focus session');
  }
}

export async function getActiveFocusSession(userId: string): Promise<CEOFocusSession | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const snapshot = await getUserCollection(db, userId, 'ceo_focus_sessions')
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as CEOFocusSession;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get active focus session');
    return null;
  }
}

// ============================================================================
// REFLECTIONS
// ============================================================================

export async function saveDailyReflection(
  userId: string,
  reflection: Omit<CEOReflection, 'id' | 'createdAt'>
): Promise<CEOReflection> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const fullReflection: CEOReflection = {
    id,
    ...reflection,
    createdAt: now,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...fullReflection,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.REFLECTION),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_reflections')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, date: reflection.date }, 'Saved daily reflection');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save reflection');
    }
  }

  invalidateCache(userId);
  return fullReflection;
}

// ============================================================================
// WEEKLY REVIEWS
// ============================================================================

export async function saveWeeklyReview(
  userId: string,
  review: Omit<CEOWeeklyReview, 'id' | 'createdAt'>
): Promise<CEOWeeklyReview> {
  const db = await getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const fullReview: CEOWeeklyReview = {
    id,
    ...review,
    createdAt: now,
  };

  // TTL-enabled document for automatic cleanup
  const docWithTTL = {
    ...fullReview,
    expiresAt: calculateExpiresAt(CEO_TTL_DAYS.WEEKLY_REVIEW),
  };

  if (db) {
    try {
      await getUserCollection(db, userId, 'ceo_weekly_reviews')
        .doc(id)
        .set(cleanForFirestore(docWithTTL));
      log.debug({ userId, weekStart: review.weekStart }, 'Saved weekly review');
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to save weekly review');
    }
  }

  invalidateCache(userId);
  return fullReview;
}

// ============================================================================
// AGGREGATED STATE (for context builder)
// ============================================================================

/**
 * Get aggregated CEO coaching state for context injection.
 * Cached for 2 minutes to reduce Firestore reads.
 */
export async function getCEOCoachingState(userId: string): Promise<CEOCoachingState> {
  // Check cache
  const cached = stateCache.get(userId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.state;
  }

  // Load fresh data in parallel
  const [
    recentWins,
    currentPriorities,
    activeBlockers,
    pendingDecisions,
    energyTrend,
    recentGratitude,
    activeFocusSession,
  ] = await Promise.all([
    getRecentWins(userId, 7),
    getPriorities(userId),
    getActiveBlockers(userId),
    getPendingDecisions(userId),
    getEnergyTrend(userId, 7),
    getRecentGratitude(userId, 5),
    getActiveFocusSession(userId),
  ]);

  const state: CEOCoachingState = {
    recentWins,
    currentPriorities,
    activeBlockers,
    pendingDecisions,
    energyTrend,
    recentGratitude,
    activeFocusSession: activeFocusSession ?? undefined,
  };

  // Update cache
  stateCache.set(userId, { state, loadedAt: Date.now() });

  return state;
}
