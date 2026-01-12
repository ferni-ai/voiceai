/**
 * Daily Admin Report Service
 *
 * Generates daily reports on visitors and callers for admin review.
 * Sends via email to configured recipients.
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger().child({ module: 'daily-report' });

// ============================================================================
// TYPES
// ============================================================================

export interface DailyReportData {
  date: string;
  visitors: {
    total: number;
    unique: number;
    newUsers: number;
    returningUsers: number;
    avgSessionDuration: number;
    totalSessions: number;
  };
  callers: {
    total: number;
    inbound: number;
    outbound: number;
    avgDuration: number;
    calls: CallerRecord[];
  };
  personas: PersonaUsage[];
  comparison: {
    visitorsChange: number;
    sessionsChange: number;
    callersChange: number;
  };
}

export interface CallerRecord {
  phoneNumber: string; // Masked for privacy
  direction: 'inbound' | 'outbound';
  duration: number; // seconds
  outcome: string;
  timestamp: Date;
}

export interface PersonaUsage {
  personaId: string;
  personaName: string;
  sessions: number;
  percentage: number;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

/**
 * Generate daily report data for a specific date
 */
export async function generateDailyReport(targetDate?: Date): Promise<DailyReportData> {
  const admin = await import('firebase-admin');
  const db = admin.firestore();

  // Default to yesterday
  const reportDate = targetDate || new Date();
  if (!targetDate) {
    reportDate.setDate(reportDate.getDate() - 1);
  }

  const startOfDay = new Date(reportDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(reportDate);
  endOfDay.setHours(23, 59, 59, 999);

  const previousDay = new Date(startOfDay);
  previousDay.setDate(previousDay.getDate() - 1);

  const previousDayEnd = new Date(previousDay);
  previousDayEnd.setHours(23, 59, 59, 999);

  log.info({ date: startOfDay.toISOString().split('T')[0] }, 'Generating daily report');

  // Query sessions for target date
  const [sessionsData, previousSessionsData, callsData, previousCallsData] = await Promise.all([
    querySessionsForDate(db, startOfDay, endOfDay),
    querySessionsForDate(db, previousDay, previousDayEnd),
    queryCallsForDate(db, startOfDay, endOfDay),
    queryCallsForDate(db, previousDay, previousDayEnd),
  ]);

  // Calculate visitor stats
  const uniqueUserIds = new Set(sessionsData.map((s) => s.userId));
  const totalSessions = sessionsData.length;
  const avgDuration =
    totalSessions > 0
      ? sessionsData.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) / totalSessions
      : 0;

  // Calculate persona usage
  const personaCounts = new Map<string, number>();
  for (const session of sessionsData) {
    const persona = session.personaId || 'unknown';
    personaCounts.set(persona, (personaCounts.get(persona) || 0) + 1);
  }

  const personas: PersonaUsage[] = Array.from(personaCounts.entries())
    .map(([personaId, sessions]) => ({
      personaId,
      personaName: getPersonaDisplayName(personaId),
      sessions,
      percentage: totalSessions > 0 ? Math.round((sessions / totalSessions) * 100) : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // Calculate caller stats
  const inboundCalls = callsData.filter((c) => c.direction === 'incoming');
  const outboundCalls = callsData.filter((c) => c.direction === 'outgoing');
  const avgCallDuration =
    callsData.length > 0
      ? callsData.reduce((sum, c) => sum + (c.duration || 0), 0) / callsData.length
      : 0;

  const callerRecords: CallerRecord[] = callsData.map((call) => ({
    phoneNumber: maskPhoneNumber(call.phoneNumber || ''),
    direction: call.direction === 'incoming' ? 'inbound' : 'outbound',
    duration: call.duration || 0,
    outcome: call.outcome || 'unknown',
    timestamp: toDate(call.timestamp),
  }));

  // Calculate comparison
  const previousUnique = new Set(previousSessionsData.map((s) => s.userId)).size;
  const previousSessions = previousSessionsData.length;
  const previousCalls = previousCallsData.length;

  const visitorsChange =
    previousUnique > 0
      ? Math.round(((uniqueUserIds.size - previousUnique) / previousUnique) * 100)
      : 0;
  const sessionsChange =
    previousSessions > 0
      ? Math.round(((totalSessions - previousSessions) / previousSessions) * 100)
      : 0;
  const callersChange =
    previousCalls > 0 ? Math.round(((callsData.length - previousCalls) / previousCalls) * 100) : 0;

  return {
    date: startOfDay.toISOString().split('T')[0] ?? '',
    visitors: {
      total: totalSessions,
      unique: uniqueUserIds.size,
      newUsers: 0, // TODO: Calculate from user creation dates
      returningUsers: 0,
      avgSessionDuration: Math.round(avgDuration * 10) / 10,
      totalSessions,
    },
    callers: {
      total: callsData.length,
      inbound: inboundCalls.length,
      outbound: outboundCalls.length,
      avgDuration: Math.round(avgCallDuration),
      calls: callerRecords,
    },
    personas,
    comparison: {
      visitorsChange,
      sessionsChange,
      callersChange,
    },
  };
}

// ============================================================================
// FIRESTORE QUERIES
// ============================================================================

interface SessionDoc {
  userId: string;
  personaId?: string;
  durationMinutes?: number;
  startedAt?: FirebaseFirestore.Timestamp;
}

interface CallDoc {
  phoneNumber?: string;
  direction?: 'incoming' | 'outgoing';
  duration?: number;
  outcome?: string;
  timestamp?: FirebaseFirestore.Timestamp | Date;
}

async function querySessionsForDate(
  db: FirebaseFirestore.Firestore,
  startOfDay: Date,
  endOfDay: Date
): Promise<SessionDoc[]> {
  try {
    // Try analytics_sessions first
    const snapshot = await db
      .collection('analytics_sessions')
      .where('startedAt', '>=', startOfDay)
      .where('startedAt', '<=', endOfDay)
      .get();

    if (!snapshot.empty) {
      return snapshot.docs.map((doc) => doc.data() as SessionDoc);
    }

    // Fallback: query bogle_users sessions subcollection
    const usersSnapshot = await db.collection('bogle_users').limit(500).get();
    const sessions: SessionDoc[] = [];

    for (const userDoc of usersSnapshot.docs) {
      const userSessions = await userDoc.ref
        .collection('sessions')
        .where('startedAt', '>=', startOfDay)
        .where('startedAt', '<=', endOfDay)
        .get();

      for (const sessionDoc of userSessions.docs) {
        const data = sessionDoc.data();
        sessions.push({
          userId: userDoc.id,
          personaId: data.personaId,
          durationMinutes: data.durationMinutes,
          startedAt: data.startedAt,
        });
      }
    }

    return sessions;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to query sessions');
    return [];
  }
}

async function queryCallsForDate(
  db: FirebaseFirestore.Firestore,
  startOfDay: Date,
  endOfDay: Date
): Promise<CallDoc[]> {
  try {
    const snapshot = await db
      .collection('call_records')
      .where('timestamp', '>=', startOfDay)
      .where('timestamp', '<=', endOfDay)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CallDoc);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to query call records');
    return [];
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert Firestore Timestamp or Date to Date
 */
function toDate(value: FirebaseFirestore.Timestamp | Date | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof (value as FirebaseFirestore.Timestamp).toDate === 'function') {
    return (value as FirebaseFirestore.Timestamp).toDate();
  }
  return new Date();
}

function getPersonaDisplayName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    maya: 'Maya',
    peter: 'Peter',
    alex: 'Alex',
    jordan: 'Jordan',
    nayan: 'Nayan',
  };
  return names[personaId] || personaId;
}

function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return '***';
  // Keep last 4 digits
  const cleaned = phone.replace(/\D/g, '');
  const last4 = cleaned.slice(-4);
  return `+1 (***) ***-${last4}`;
}

/**
 * Format duration in seconds to human readable
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format percentage change with + or - prefix
 */
export function formatChange(change: number): string {
  if (change > 0) return `+${change}%`;
  if (change < 0) return `${change}%`;
  return '0%';
}
