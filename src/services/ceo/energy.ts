/**
 * Energy Service - Energy Level Tracking
 *
 * Track energy levels throughout the day for pattern recognition.
 * Stored in Firestore under users/{userId}/energy/{logId}
 *
 * @module services/ceo/energy
 */

import { Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getFirestoreDb,
  cleanForFirestore,
  recordDegradation,
  toSafeDate,
} from '../../utils/firestore-utils.js';
import { generateId } from '../../utils/id-generator.js';

const log = createLogger({ module: 'ceo-energy' });

// ============================================================================
// TYPES
// ============================================================================

export interface EnergyLog {
  id: string;
  userId: string;
  level: number; // 1-10
  notes?: string;
  createdAt: Date;
}

interface FirestoreEnergyLog {
  id: string;
  userId: string;
  level: number;
  notes?: string;
  createdAt: Timestamp;
}

export interface EnergyTrend {
  logs: EnergyLog[];
  average: number;
  trend: 'improving' | 'stable' | 'declining';
  peakTime?: string;
  lowTime?: string;
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const ENERGY_COLLECTION = 'energy';

function getEnergyPath(userId: string): string {
  return `users/${userId}/${ENERGY_COLLECTION}`;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Log an energy level (1-10 scale).
 */
export async function logEnergy(userId: string, level: number, notes?: string): Promise<EnergyLog> {
  // Validate and clamp level to 1-10
  const clampedLevel = Math.max(1, Math.min(10, Math.round(level)));

  const db = getFirestoreDb();

  const energyLog: EnergyLog = {
    id: generateId('nrg'),
    userId,
    level: clampedLevel,
    notes,
    createdAt: new Date(),
  };

  if (!db) {
    recordDegradation('ceo-energy', 'logEnergy');
    log.warn({ userId }, 'Firestore unavailable, energy log not persisted');
    return energyLog;
  }

  try {
    const firestoreLog: FirestoreEnergyLog = {
      ...energyLog,
      createdAt: Timestamp.fromDate(energyLog.createdAt),
    };

    const docRef = db.collection(getEnergyPath(userId)).doc(energyLog.id);
    await docRef.set(cleanForFirestore(firestoreLog));

    log.info({ userId, level: clampedLevel, logId: energyLog.id }, 'Energy level logged');
    return energyLog;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to log energy level');
    return energyLog;
  }
}

/**
 * Get today's energy logs.
 */
export async function getToday(userId: string): Promise<EnergyLog[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-energy', 'getToday');
    return [];
  }

  try {
    const energyRef = db.collection(getEnergyPath(userId));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = energyRef
      .where('createdAt', '>=', Timestamp.fromDate(today))
      .orderBy('createdAt', 'asc');

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToEnergyLog(doc.data() as FirestoreEnergyLog));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get today energy logs');
    return [];
  }
}

/**
 * Get weekly average energy level.
 */
export async function getWeeklyAverage(userId: string): Promise<number> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-energy', 'getWeeklyAverage');
    return 0;
  }

  try {
    const logs = await getTrend(userId, 7);

    if (logs.length === 0) {
      return 0;
    }

    const sum = logs.reduce((acc, log) => acc + log.level, 0);
    return Math.round((sum / logs.length) * 10) / 10; // Round to 1 decimal
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to calculate weekly average');
    return 0;
  }
}

/**
 * Get energy trend for the specified number of days.
 */
export async function getTrend(userId: string, days: number): Promise<EnergyLog[]> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-energy', 'getTrend');
    return [];
  }

  try {
    const energyRef = db.collection(getEnergyPath(userId));

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);

    const query = energyRef
      .where('createdAt', '>=', Timestamp.fromDate(cutoff))
      .orderBy('createdAt', 'asc');

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => firestoreToEnergyLog(doc.data() as FirestoreEnergyLog));
  } catch (error) {
    log.error({ error: String(error), userId, days }, 'Failed to get energy trend');
    return [];
  }
}

/**
 * Get detailed energy analysis for the week.
 */
export async function getWeeklyAnalysis(userId: string): Promise<EnergyTrend> {
  const logs = await getTrend(userId, 7);

  if (logs.length === 0) {
    return {
      logs: [],
      average: 0,
      trend: 'stable',
    };
  }

  // Calculate average
  const sum = logs.reduce((acc, log) => acc + log.level, 0);
  const average = Math.round((sum / logs.length) * 10) / 10;

  // Determine trend by comparing first half to second half
  const midpoint = Math.floor(logs.length / 2);
  const firstHalf = logs.slice(0, midpoint);
  const secondHalf = logs.slice(midpoint);

  const firstHalfAvg =
    firstHalf.length > 0 ? firstHalf.reduce((acc, l) => acc + l.level, 0) / firstHalf.length : 0;
  const secondHalfAvg =
    secondHalf.length > 0 ? secondHalf.reduce((acc, l) => acc + l.level, 0) / secondHalf.length : 0;

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (secondHalfAvg - firstHalfAvg > 0.5) {
    trend = 'improving';
  } else if (firstHalfAvg - secondHalfAvg > 0.5) {
    trend = 'declining';
  }

  // Find peak and low times
  const hourlyLevels = new Map<number, { sum: number; count: number }>();
  for (const log of logs) {
    const hour = log.createdAt.getHours();
    const existing = hourlyLevels.get(hour) || { sum: 0, count: 0 };
    hourlyLevels.set(hour, { sum: existing.sum + log.level, count: existing.count + 1 });
  }

  let peakHour = -1;
  let peakAvg = 0;
  let lowHour = -1;
  let lowAvg = 11;

  Array.from(hourlyLevels.entries()).forEach(([hour, data]) => {
    const avg = data.sum / data.count;
    if (avg > peakAvg) {
      peakAvg = avg;
      peakHour = hour;
    }
    if (avg < lowAvg) {
      lowAvg = avg;
      lowHour = hour;
    }
  });

  return {
    logs,
    average,
    trend,
    peakTime: peakHour >= 0 ? formatHour(peakHour) : undefined,
    lowTime: lowHour >= 0 ? formatHour(lowHour) : undefined,
  };
}

/**
 * Get the most recent energy log.
 */
export async function getLatestLog(userId: string): Promise<EnergyLog | null> {
  const db = getFirestoreDb();
  if (!db) {
    recordDegradation('ceo-energy', 'getLatestLog');
    return null;
  }

  try {
    const energyRef = db.collection(getEnergyPath(userId));
    const query = energyRef.orderBy('createdAt', 'desc').limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    return firestoreToEnergyLog(snapshot.docs[0].data() as FirestoreEnergyLog);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get latest energy log');
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function firestoreToEnergyLog(data: FirestoreEnergyLog): EnergyLog {
  return {
    id: data.id,
    userId: data.userId,
    level: data.level,
    notes: data.notes,
    createdAt: toSafeDate(data.createdAt),
  };
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}${period}`;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const energyService = {
  logEnergy,
  getToday,
  getWeeklyAverage,
  getTrend,
  getWeeklyAnalysis,
  getLatestLog,
};
