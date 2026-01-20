/**
 * Focus Session Service for CEO CLI
 *
 * Manages focus sessions with timing and optional calendar blocking.
 * Part of the Personal Productivity commands for the Ferni CLI.
 *
 * Collections: users/{userId}/focus_sessions
 *
 * @module services/ceo/focus
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore, toSafeDate } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'ceo-focus' });

// ============================================================================
// TYPES
// ============================================================================

export interface FocusSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  plannedDuration: number; // minutes
  actualDuration?: number; // minutes
  task?: string;
  interrupted: boolean;
  calendarBlocked: boolean;
  createdAt: Date;
}

export interface FocusStats {
  totalSessions: number;
  totalMinutes: number;
  averageDuration: number;
  completionRate: number; // % completed without interruption
  streakDays: number;
}

export interface StartSessionOptions {
  duration: number; // minutes
  task?: string;
  blockCalendar?: boolean;
}

export interface FocusService {
  startSession: (userId: string, options: StartSessionOptions) => Promise<FocusSession>;
  endSession: (userId: string) => Promise<FocusSession | null>;
  getCurrentSession: (userId: string) => Promise<FocusSession | null>;
  getSessionHistory: (userId: string, limit?: number) => Promise<FocusSession[]>;
  markInterrupted: (userId: string) => Promise<FocusSession | null>;
  getStats: (userId: string, period: 'day' | 'week' | 'month') => Promise<FocusStats>;
}

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

const COLLECTION_NAME = 'focus_sessions';

function getUserFocusCollection(
  userId: string
): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData> | null {
  const db = getFirestoreDb();
  if (db === null) return null;
  return db.collection('users').doc(userId).collection(COLLECTION_NAME);
}

function sessionToFirestore(session: FocusSession): Record<string, unknown> {
  return cleanForFirestore({
    id: session.id,
    userId: session.userId,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime?.toISOString() ?? null,
    plannedDuration: session.plannedDuration,
    actualDuration: session.actualDuration ?? null,
    task: session.task ?? null,
    interrupted: session.interrupted,
    calendarBlocked: session.calendarBlocked,
    createdAt: session.createdAt.toISOString(),
  });
}

function firestoreToSession(data: Record<string, unknown>): FocusSession {
  return {
    id: data.id as string,
    userId: data.userId as string,
    startTime: toSafeDate(data.startTime),
    endTime:
      data.endTime !== null && data.endTime !== undefined ? toSafeDate(data.endTime) : undefined,
    plannedDuration: data.plannedDuration as number,
    actualDuration:
      data.actualDuration !== null && data.actualDuration !== undefined
        ? (data.actualDuration as number)
        : undefined,
    task:
      data.task !== null && data.task !== undefined && typeof data.task === 'string'
        ? data.task
        : undefined,
    interrupted: data.interrupted as boolean,
    calendarBlocked: data.calendarBlocked as boolean,
    createdAt: toSafeDate(data.createdAt),
  };
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Start a new focus session.
 * Only one active session is allowed per user at a time.
 */
async function startSession(userId: string, options: StartSessionOptions): Promise<FocusSession> {
  const collection = getUserFocusCollection(userId);
  if (!collection) {
    throw new Error('Firestore not available');
  }

  // Check for existing active session
  const existing = await getCurrentSession(userId);
  if (existing) {
    throw new Error('A focus session is already active. End it first with `ferni focus stop`.');
  }

  const now = new Date();
  const id = `focus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const session: FocusSession = {
    id,
    userId,
    startTime: now,
    plannedDuration: options.duration,
    task: options.task,
    interrupted: false,
    calendarBlocked: options.blockCalendar ?? false,
    createdAt: now,
  };

  await collection.doc(id).set(sessionToFirestore(session));

  log.info(
    { userId, sessionId: id, duration: options.duration, task: options.task },
    'Focus session started'
  );

  // TODO: If blockCalendar is true, create a "Focus Time" event on the user's calendar
  // This would integrate with the calendar service when available

  return session;
}

/**
 * End the current active focus session.
 * Calculates actual duration and marks as complete.
 */
async function endSession(userId: string): Promise<FocusSession | null> {
  const collection = getUserFocusCollection(userId);
  if (!collection) {
    return null;
  }

  const current = await getCurrentSession(userId);
  if (!current) {
    return null;
  }

  const now = new Date();
  const actualDuration = Math.round((now.getTime() - current.startTime.getTime()) / 60000); // minutes

  const updatedSession: FocusSession = {
    ...current,
    endTime: now,
    actualDuration,
  };

  await collection.doc(current.id).update(
    cleanForFirestore({
      endTime: now.toISOString(),
      actualDuration,
    })
  );

  log.info(
    {
      userId,
      sessionId: current.id,
      plannedDuration: current.plannedDuration,
      actualDuration,
      interrupted: current.interrupted,
    },
    'Focus session ended'
  );

  return updatedSession;
}

/**
 * Get the current active focus session for a user.
 * An active session has no endTime set.
 */
async function getCurrentSession(userId: string): Promise<FocusSession | null> {
  const collection = getUserFocusCollection(userId);
  if (!collection) {
    return null;
  }

  try {
    const snapshot = await collection
      .where('endTime', '==', null)
      .orderBy('startTime', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const data = snapshot.docs[0].data();
    return firestoreToSession(data);
  } catch (error) {
    const errorStr = String(error);
    // Check for index building error - gracefully degrade
    if (errorStr.includes('FAILED_PRECONDITION') && errorStr.includes('index')) {
      log.debug({ userId }, 'Firestore index still building for focus sessions - returning null');
      return null;
    }
    log.error({ error: errorStr, userId }, 'Failed to get current focus session');
    return null;
  }
}

/**
 * Get focus session history for a user.
 */
async function getSessionHistory(userId: string, limit = 20): Promise<FocusSession[]> {
  const collection = getUserFocusCollection(userId);
  if (!collection) {
    return [];
  }

  try {
    const snapshot = await collection.orderBy('startTime', 'desc').limit(limit).get();

    return snapshot.docs.map((doc) => firestoreToSession(doc.data()));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get session history');
    return [];
  }
}

/**
 * Mark the current session as interrupted.
 */
async function markInterrupted(userId: string): Promise<FocusSession | null> {
  const collection = getUserFocusCollection(userId);
  if (!collection) {
    return null;
  }

  const current = await getCurrentSession(userId);
  if (!current) {
    return null;
  }

  await collection.doc(current.id).update({ interrupted: true });

  const updatedSession: FocusSession = {
    ...current,
    interrupted: true,
  };

  log.info({ userId, sessionId: current.id }, 'Focus session marked as interrupted');

  return updatedSession;
}

/**
 * Get focus statistics for a time period.
 */
async function getStats(userId: string, period: 'day' | 'week' | 'month'): Promise<FocusStats> {
  const collection = getUserFocusCollection(userId);
  if (!collection) {
    return {
      totalSessions: 0,
      totalMinutes: 0,
      averageDuration: 0,
      completionRate: 0,
      streakDays: 0,
    };
  }

  // Calculate the start date for the period
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  try {
    const snapshot = await collection
      .where('startTime', '>=', startDate.toISOString())
      .orderBy('startTime', 'desc')
      .get();

    const sessions = snapshot.docs.map((doc) => firestoreToSession(doc.data()));

    // Calculate stats from completed sessions (have endTime)
    const completedSessions = sessions.filter((s) => s.endTime !== undefined);

    const totalSessions = completedSessions.length;
    const totalMinutes = completedSessions.reduce((sum, s) => sum + (s.actualDuration ?? 0), 0);
    const averageDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

    const completedWithoutInterruption = completedSessions.filter((s) => !s.interrupted).length;
    const completionRate =
      totalSessions > 0 ? Math.round((completedWithoutInterruption / totalSessions) * 100) : 0;

    // Calculate streak - consecutive days with at least one completed session
    const streakDays = calculateStreak(completedSessions);

    return {
      totalSessions,
      totalMinutes,
      averageDuration,
      completionRate,
      streakDays,
    };
  } catch (error) {
    const errorStr = String(error);
    if (errorStr.includes('FAILED_PRECONDITION') && errorStr.includes('index')) {
      log.debug({ userId }, 'Firestore index still building for focus stats - returning empty');
      return {
        totalSessions: 0,
        totalMinutes: 0,
        averageDuration: 0,
        completionRate: 0,
        streakDays: 0,
      };
    }
    log.error({ error: errorStr, userId }, 'Failed to get focus stats');
    return {
      totalSessions: 0,
      totalMinutes: 0,
      averageDuration: 0,
      completionRate: 0,
      streakDays: 0,
    };
  }
}

/**
 * Calculate the current streak of consecutive days with focus sessions.
 */
function calculateStreak(sessions: FocusSession[]): number {
  if (sessions.length === 0) return 0;

  // Get unique dates (as YYYY-MM-DD strings)
  const sessionDates = new Set<string>();
  for (const session of sessions) {
    const dateStr = session.startTime.toISOString().split('T')[0];
    sessionDates.add(dateStr);
  }

  // Sort dates descending
  const sortedDates = Array.from(sessionDates).sort().reverse();

  // Count consecutive days starting from today or yesterday
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Start counting if the most recent session is today or yesterday
  if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = new Date(sortedDates[i - 1]);
    const currDate = new Date(sortedDates[i]);
    const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / (24 * 60 * 60 * 1000));

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const focusService: FocusService = {
  startSession,
  endSession,
  getCurrentSession,
  getSessionHistory,
  markInterrupted,
  getStats,
};

// Also export individual functions for convenience
export {
  startSession,
  endSession,
  getCurrentSession,
  getSessionHistory,
  markInterrupted,
  getStats,
};
