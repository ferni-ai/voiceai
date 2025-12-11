/**
 * User Analytics Service
 *
 * Tracks daily/weekly/monthly active users and session metrics.
 * Persists to Firestore for durability.
 *
 * Collections:
 * - analytics_daily/{YYYY-MM-DD} - Daily aggregates
 * - analytics_sessions/{sessionId} - Individual sessions
 * - analytics_users/{userId} - Per-user stats
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'user-analytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface DailyAnalytics {
  date: string; // YYYY-MM-DD
  uniqueUsers: number;
  totalSessions: number;
  totalMinutes: number;
  avgSessionMinutes: number;
  peakConcurrent: number;
  byPersona: Record<string, number>;
  byHour: number[]; // 24 elements
  newUsers: number;
  returningUsers: number;
  subscriberSessions: number;
  freeTierSessions: number;
  updatedAt: Date;
}

export interface SessionRecord {
  sessionId: string;
  odId: string;
  personaId: string;
  startedAt: Date;
  endedAt?: Date;
  durationMinutes?: number;
  isSubscriber: boolean;
  turnCount: number;
  toolsUsed: string[];
}

export interface UserStats {
  visitorId: string;
  totalSessions: number;
  totalMinutes: number;
  firstSeen: Date;
  lastSeen: Date;
  favoritePersona: string;
  isSubscriber: boolean;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
}

export interface AnalyticsSummary {
  today: DailyAnalytics;
  yesterday: DailyAnalytics;
  thisWeek: {
    uniqueUsers: number;
    totalSessions: number;
    totalMinutes: number;
  };
  thisMonth: {
    uniqueUsers: number;
    totalSessions: number;
    totalMinutes: number;
  };
  trends: {
    usersVsYesterday: number; // percentage change
    sessionsVsYesterday: number;
    usersVsLastWeek: number;
  };
  topPersonas: Array<{ personaId: string; sessions: number }>;
  peakHours: number[]; // top 3 hours
  currentConcurrent: number;
}

// ============================================================================
// FIRESTORE CLIENT
// ============================================================================

let firestoreClient: FirebaseFirestore.Firestore | null = null;
let firestoreAvailable = false;

// In-memory fallback for when Firestore isn't available
const inMemoryDaily = new Map<string, DailyAnalytics>();
const inMemorySessions = new Map<string, SessionRecord>();
const inMemoryUsers = new Map<string, UserStats>();
let currentConcurrent = 0;

const COLLECTIONS = {
  DAILY: 'analytics_daily',
  SESSIONS: 'analytics_sessions',
  USERS: 'analytics_users',
} as const;

/**
 * Initialize Firestore for analytics
 */
export async function initializeAnalytics(): Promise<boolean> {
  try {
    const admin = await import('firebase-admin');

    if (admin.apps.length === 0) {
      try {
        admin.initializeApp({
          projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        });
      } catch {
        log.warn('Firebase not configured - using in-memory analytics');
        return false;
      }
    }

    firestoreClient = admin.firestore();
    firestoreAvailable = true;
    log.info('✅ Analytics initialized with Firestore');
    return true;
  } catch (error) {
    log.warn({ error }, 'Firestore not available - using in-memory analytics');
    firestoreAvailable = false;
    return false;
  }
}

function getDateKey(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

function getMonthStart(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

/**
 * Record session start - call when a user connects
 */
export async function recordSessionStart(
  sessionId: string,
  visitorId: string,
  personaId: string,
  isSubscriber = false
): Promise<void> {
  const now = new Date();
  const dateKey = getDateKey(now);
  const hour = now.getHours();

  currentConcurrent++;

  const session: SessionRecord = {
    sessionId,
    odId: visitorId,
    personaId,
    startedAt: now,
    isSubscriber,
    turnCount: 0,
    toolsUsed: [],
  };

  // Update daily analytics
  let daily = await getDailyAnalytics(dateKey);
  if (!daily) {
    daily = createEmptyDaily(dateKey);
  }

  daily.totalSessions++;
  daily.byHour[hour]++;
  daily.byPersona[personaId] = (daily.byPersona[personaId] || 0) + 1;

  if (isSubscriber) {
    daily.subscriberSessions++;
  } else {
    daily.freeTierSessions++;
  }

  if (currentConcurrent > daily.peakConcurrent) {
    daily.peakConcurrent = currentConcurrent;
  }

  // Check if new or returning user
  const existingUser = await getUserStats(visitorId);
  if (existingUser) {
    daily.returningUsers++;
  } else {
    daily.uniqueUsers++;
    daily.newUsers++;
  }

  daily.updatedAt = now;

  // Persist
  if (firestoreAvailable && firestoreClient) {
    try {
      await firestoreClient.collection(COLLECTIONS.DAILY).doc(dateKey).set(daily);
      await firestoreClient.collection(COLLECTIONS.SESSIONS).doc(sessionId).set(session);
    } catch (error) {
      log.error({ error }, 'Failed to persist session start');
    }
  } else {
    inMemoryDaily.set(dateKey, daily);
    inMemorySessions.set(sessionId, session);
  }

  log.debug({ sessionId, visitorId, personaId, currentConcurrent }, 'Session started');
}

/**
 * Record session end - call when a user disconnects
 */
export async function recordSessionEnd(
  sessionId: string,
  turnCount = 0,
  toolsUsed: string[] = []
): Promise<void> {
  const now = new Date();
  currentConcurrent = Math.max(0, currentConcurrent - 1);

  // Get session record
  let session: SessionRecord | null = null;
  if (firestoreAvailable && firestoreClient) {
    try {
      const doc = await firestoreClient.collection(COLLECTIONS.SESSIONS).doc(sessionId).get();
      if (doc.exists) {
        session = doc.data() as SessionRecord;
      }
    } catch (error) {
      log.error({ error }, 'Failed to get session');
    }
  } else {
    session = inMemorySessions.get(sessionId) || null;
  }

  if (!session) {
    log.warn({ sessionId }, 'Session not found for end');
    return;
  }

  // Calculate duration
  const startedAt =
    session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt);
  const durationMs = now.getTime() - startedAt.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  session.endedAt = now;
  session.durationMinutes = durationMinutes;
  session.turnCount = turnCount;
  session.toolsUsed = toolsUsed;

  // Update daily analytics
  const dateKey = getDateKey(startedAt);
  const daily = await getDailyAnalytics(dateKey);
  if (daily) {
    daily.totalMinutes += durationMinutes;
    daily.avgSessionMinutes = daily.totalMinutes / daily.totalSessions;
    daily.updatedAt = now;

    if (firestoreAvailable && firestoreClient) {
      try {
        await firestoreClient.collection(COLLECTIONS.DAILY).doc(dateKey).set(daily);
      } catch (error) {
        log.error({ error }, 'Failed to update daily analytics');
      }
    } else {
      inMemoryDaily.set(dateKey, daily);
    }
  }

  // Update user stats
  await updateUserStats(session.odId, durationMinutes, session.personaId, session.isSubscriber);

  // Persist session
  if (firestoreAvailable && firestoreClient) {
    try {
      await firestoreClient.collection(COLLECTIONS.SESSIONS).doc(sessionId).set(session);
    } catch (error) {
      log.error({ error }, 'Failed to persist session end');
    }
  } else {
    inMemorySessions.set(sessionId, session);
  }

  log.debug({ sessionId, durationMinutes, turnCount, currentConcurrent }, 'Session ended');
}

// ============================================================================
// USER STATS
// ============================================================================

async function getUserStats(visitorId: string): Promise<UserStats | null> {
  if (firestoreAvailable && firestoreClient) {
    try {
      const doc = await firestoreClient.collection(COLLECTIONS.USERS).doc(visitorId).get();
      if (doc.exists) {
        return doc.data() as UserStats;
      }
    } catch (error) {
      log.error({ error }, 'Failed to get user stats');
    }
  } else {
    return inMemoryUsers.get(visitorId) || null;
  }
  return null;
}

async function updateUserStats(
  visitorId: string,
  durationMinutes: number,
  personaId: string,
  isSubscriber: boolean
): Promise<void> {
  const now = new Date();
  let stats = await getUserStats(visitorId);

  if (!stats) {
    stats = {
      visitorId,
      totalSessions: 0,
      totalMinutes: 0,
      firstSeen: now,
      lastSeen: now,
      favoritePersona: personaId,
      isSubscriber,
      sessionsThisWeek: 0,
      sessionsThisMonth: 0,
    };
  }

  stats.totalSessions++;
  stats.totalMinutes += durationMinutes;
  stats.lastSeen = now;
  stats.isSubscriber = isSubscriber;
  stats.sessionsThisWeek++;
  stats.sessionsThisMonth++;

  if (firestoreAvailable && firestoreClient) {
    try {
      await firestoreClient.collection(COLLECTIONS.USERS).doc(visitorId).set(stats);
    } catch (error) {
      log.error({ error }, 'Failed to update user stats');
    }
  } else {
    inMemoryUsers.set(visitorId, stats);
  }
}

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

function createEmptyDaily(dateKey: string): DailyAnalytics {
  return {
    date: dateKey,
    uniqueUsers: 0,
    totalSessions: 0,
    totalMinutes: 0,
    avgSessionMinutes: 0,
    peakConcurrent: 0,
    byPersona: {},
    byHour: new Array(24).fill(0),
    newUsers: 0,
    returningUsers: 0,
    subscriberSessions: 0,
    freeTierSessions: 0,
    updatedAt: new Date(),
  };
}

async function getDailyAnalytics(dateKey: string): Promise<DailyAnalytics | null> {
  if (firestoreAvailable && firestoreClient) {
    try {
      const doc = await firestoreClient.collection(COLLECTIONS.DAILY).doc(dateKey).get();
      if (doc.exists) {
        return doc.data() as DailyAnalytics;
      }
    } catch (error) {
      log.error({ error }, 'Failed to get daily analytics');
    }
  } else {
    return inMemoryDaily.get(dateKey) || null;
  }
  return null;
}

/**
 * Get analytics summary for dashboard
 */
export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const now = new Date();
  const todayKey = getDateKey(now);
  const yesterdayKey = getDateKey(new Date(now.getTime() - 86400000));

  const today = (await getDailyAnalytics(todayKey)) || createEmptyDaily(todayKey);
  const yesterday = (await getDailyAnalytics(yesterdayKey)) || createEmptyDaily(yesterdayKey);

  // Calculate week and month totals
  const weekStart = getWeekStart(now);
  const monthStart = getMonthStart(now);

  let weekUsers = 0,
    weekSessions = 0,
    weekMinutes = 0;
  let monthUsers = 0,
    monthSessions = 0,
    monthMinutes = 0;

  // Aggregate from daily records
  for (let d = new Date(monthStart); d <= now; d.setDate(d.getDate() + 1)) {
    const daily = await getDailyAnalytics(getDateKey(d));
    if (daily) {
      monthUsers += daily.uniqueUsers;
      monthSessions += daily.totalSessions;
      monthMinutes += daily.totalMinutes;

      if (d >= weekStart) {
        weekUsers += daily.uniqueUsers;
        weekSessions += daily.totalSessions;
        weekMinutes += daily.totalMinutes;
      }
    }
  }

  // Calculate trends
  const usersVsYesterday =
    yesterday.uniqueUsers > 0
      ? Math.round(((today.uniqueUsers - yesterday.uniqueUsers) / yesterday.uniqueUsers) * 100)
      : 0;
  const sessionsVsYesterday =
    yesterday.totalSessions > 0
      ? Math.round(
          ((today.totalSessions - yesterday.totalSessions) / yesterday.totalSessions) * 100
        )
      : 0;

  // Top personas
  const personaEntries = Object.entries(today.byPersona)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([personaId, sessions]) => ({ personaId, sessions }));

  // Peak hours
  const hourEntries = today.byHour
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((e) => e.hour);

  return {
    today,
    yesterday,
    thisWeek: {
      uniqueUsers: weekUsers,
      totalSessions: weekSessions,
      totalMinutes: weekMinutes,
    },
    thisMonth: {
      uniqueUsers: monthUsers,
      totalSessions: monthSessions,
      totalMinutes: monthMinutes,
    },
    trends: {
      usersVsYesterday,
      sessionsVsYesterday,
      usersVsLastWeek: 0, // TODO: calculate
    },
    topPersonas: personaEntries,
    peakHours: hourEntries,
    currentConcurrent,
  };
}

/**
 * Get current concurrent users
 */
export function getCurrentConcurrent(): number {
  return currentConcurrent;
}

/**
 * Reset weekly/monthly counters (call from scheduled job)
 */
export async function resetPeriodCounters(): Promise<void> {
  const now = new Date();
  const isWeekStart = now.getDay() === 0;
  const isMonthStart = now.getDate() === 1;

  if (firestoreAvailable && firestoreClient) {
    try {
      const usersRef = firestoreClient.collection(COLLECTIONS.USERS);
      const snapshot = await usersRef.get();

      const batch = firestoreClient.batch();
      snapshot.docs.forEach((doc) => {
        const updates: Partial<UserStats> = {};
        if (isWeekStart) updates.sessionsThisWeek = 0;
        if (isMonthStart) updates.sessionsThisMonth = 0;
        if (Object.keys(updates).length > 0) {
          batch.update(doc.ref, updates);
        }
      });

      await batch.commit();
      log.info({ isWeekStart, isMonthStart }, 'Period counters reset');
    } catch (error) {
      log.error({ error }, 'Failed to reset period counters');
    }
  }
}
