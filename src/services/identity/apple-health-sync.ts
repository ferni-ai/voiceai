/**
 * Apple Health Sync Service
 *
 * Handles incoming sync data from the native iOS app.
 * Unlike OAuth-based integrations, Apple Health data is pushed
 * from the device rather than pulled from a web API.
 *
 * Flow:
 * 1. iOS app reads HealthKit data
 * 2. iOS app posts sync payload to /api/apple-health/sync
 * 3. This service validates and stores the data
 * 4. Frontend can query status and summaries
 */

import crypto from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
import type {
  AppleHealthSyncPayload,
  AppleHealthSleepData,
  AppleHealthSleepSummary,
  AppleHealthDailySummary,
  AppleHealthAuthStatus,
  AppleHealthResult,
  AppleHealthActivityData,
  AppleHealthWorkoutData,
  AppleHealthMindfulnessData,
} from './apple-health-types.js';

const log = createLogger({ module: 'apple-health-sync' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const STATUS_COLLECTION = 'apple_health_status';
const DATA_COLLECTION = 'apple_health_data';
const SYNC_TOKEN_COLLECTION = 'apple_health_tokens';

// In-memory cache for status (avoids frequent Firestore reads)
const statusCache = new Map<string, { status: AppleHealthAuthStatus; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

// ============================================================================
// SYNC TOKEN MANAGEMENT
// ============================================================================

/**
 * Generate a sync token for a device
 * This token is used to authenticate sync requests from the iOS app
 */
export async function generateSyncToken(
  userId: string,
  deviceId: string,
  deviceName: string
): Promise<AppleHealthResult<string>> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await db.collection(SYNC_TOKEN_COLLECTION).doc(userId).set(cleanForFirestore({
      hashedToken,
      deviceId,
      deviceName,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    }));

    log.info({ userId, deviceId }, 'Generated Apple Health sync token');

    return { success: true, data: token };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to generate sync token');
    return { success: false, error: 'Failed to generate token' };
  }
}

/**
 * Validate a sync token
 */
export async function validateSyncToken(
  userId: string,
  token: string
): Promise<{ valid: boolean; deviceId?: string }> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { valid: false };
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const doc = await db.collection(SYNC_TOKEN_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      return { valid: false };
    }

    const data = doc.data();
    if (data?.hashedToken !== hashedToken) {
      return { valid: false };
    }

    // Update last used timestamp
    await doc.ref.update(cleanForFirestore({ lastUsedAt: new Date().toISOString() }));

    return { valid: true, deviceId: data.deviceId };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to validate sync token');
    return { valid: false };
  }
}

/**
 * Revoke sync token (disconnect device)
 */
export async function revokeSyncToken(userId: string): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;

    await db.collection(SYNC_TOKEN_COLLECTION).doc(userId).delete();
    await db.collection(STATUS_COLLECTION).doc(userId).delete();

    // Clear cache
    statusCache.delete(userId);

    log.info({ userId }, 'Revoked Apple Health sync token');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to revoke sync token');
  }
}

// ============================================================================
// SYNC PROCESSING
// ============================================================================

/**
 * Process incoming sync payload from iOS app
 */
export async function processSyncPayload(
  userId: string,
  payload: AppleHealthSyncPayload
): Promise<AppleHealthResult<{ processed: number }>> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    let processedCount = 0;

    // Process sleep data
    if (payload.data.sleep && payload.data.sleep.length > 0) {
      await processSleepData(db, userId, payload.data.sleep);
      processedCount += payload.data.sleep.length;
    }

    // Process activity data
    if (payload.data.activity && payload.data.activity.length > 0) {
      for (const activity of payload.data.activity) {
        await storeDailyActivity(db, userId, activity);
        processedCount++;
      }
    }

    // Process heart rate data
    if (payload.data.heartRate && payload.data.heartRate.length > 0) {
      await storeHeartRateData(db, userId, payload.data.heartRate);
      processedCount += payload.data.heartRate.length;
    }

    // Process HRV data
    if (payload.data.hrv && payload.data.hrv.length > 0) {
      await storeHrvData(db, userId, payload.data.hrv);
      processedCount += payload.data.hrv.length;
    }

    // Process steps data
    if (payload.data.steps && payload.data.steps.length > 0) {
      await storeStepsData(db, userId, payload.data.steps);
      processedCount += payload.data.steps.length;
    }

    // Process workout data
    if (payload.data.workouts && payload.data.workouts.length > 0) {
      for (const workout of payload.data.workouts) {
        await storeWorkout(db, userId, workout);
        processedCount++;
      }
    }

    // Process mindfulness data
    if (payload.data.mindfulness && payload.data.mindfulness.length > 0) {
      for (const session of payload.data.mindfulness) {
        await storeMindfulnessSession(db, userId, session);
        processedCount++;
      }
    }

    // Update connection status
    await updateConnectionStatus(db, userId, payload.deviceId, payload.syncedAt);

    // Clear cache
    statusCache.delete(userId);

    log.info({ userId, processedCount }, 'Processed Apple Health sync');

    return { success: true, data: { processed: processedCount } };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to process sync payload');
    return { success: false, error: 'Sync failed' };
  }
}

// ============================================================================
// DATA PROCESSING HELPERS
// ============================================================================

async function processSleepData(
  db: FirebaseFirestore.Firestore,
  userId: string,
  sleepData: AppleHealthSleepData[]
): Promise<void> {
  // Group by day
  const byDay = new Map<string, AppleHealthSleepData[]>();

  for (const entry of sleepData) {
    const day = entry.endDate.split('T')[0];
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day)!.push(entry);
  }

  // Create summary for each day
  for (const [day, entries] of byDay) {
    const summary = computeSleepSummary(day, entries);
    await db
      .collection(DATA_COLLECTION)
      .doc(userId)
      .collection('daily')
      .doc(day)
      .set(cleanForFirestore({ sleep: summary }), { merge: true });
  }
}

function computeSleepSummary(
  date: string,
  entries: AppleHealthSleepData[]
): AppleHealthSleepSummary {
  let totalSleep = 0;
  let inBed = 0;
  let awake = 0;
  let core = 0;
  let deep = 0;
  let rem = 0;
  const sources = new Set<string>();

  for (const entry of entries) {
    const duration =
      (new Date(entry.endDate).getTime() - new Date(entry.startDate).getTime()) / 60000;
    sources.add(entry.sourceName);

    switch (entry.value) {
      case 'inBed':
        inBed += duration;
        break;
      case 'awake':
        awake += duration;
        break;
      case 'asleepCore':
      case 'asleepUnspecified':
        core += duration;
        totalSleep += duration;
        break;
      case 'asleepDeep':
        deep += duration;
        totalSleep += duration;
        break;
      case 'asleepREM':
        rem += duration;
        totalSleep += duration;
        break;
    }
  }

  const efficiency = inBed > 0 ? (totalSleep / inBed) * 100 : 0;

  return {
    date,
    totalSleep: Math.round(totalSleep),
    inBed: Math.round(inBed),
    awake: Math.round(awake),
    core: Math.round(core),
    deep: Math.round(deep),
    rem: Math.round(rem),
    efficiency: Math.round(efficiency),
    sources: Array.from(sources),
  };
}

async function storeDailyActivity(
  db: FirebaseFirestore.Firestore,
  userId: string,
  activity: AppleHealthActivityData
): Promise<void> {
  if (!activity) return;
  await db
    .collection(DATA_COLLECTION)
    .doc(userId)
    .collection('daily')
    .doc(activity.date)
    .set(cleanForFirestore({ activity }), { merge: true });
}

async function storeHeartRateData(
  db: FirebaseFirestore.Firestore,
  userId: string,
  heartRateData: NonNullable<AppleHealthSyncPayload['data']['heartRate']>
): Promise<void> {
  // Store aggregated heart rate by day
  const byDay = new Map<string, number[]>();

  for (const entry of heartRateData) {
    const day = entry.startDate.split('T')[0];
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day)!.push(entry.value);
  }

  for (const [day, values] of byDay) {
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const resting = values.length > 0 ? Math.min(...values) : null;

    await db
      .collection(DATA_COLLECTION)
      .doc(userId)
      .collection('daily')
      .doc(day)
      .set(
        cleanForFirestore({
          heart: {
            averageHeartRate: Math.round(average),
            restingHeartRate: resting,
            maxHeartRate: Math.max(...values),
          },
        }),
        { merge: true }
      );
  }
}

async function storeHrvData(
  db: FirebaseFirestore.Firestore,
  userId: string,
  hrvData: NonNullable<AppleHealthSyncPayload['data']['hrv']>
): Promise<void> {
  const byDay = new Map<string, number[]>();

  for (const entry of hrvData) {
    const day = entry.startDate.split('T')[0];
    if (!byDay.has(day)) {
      byDay.set(day, []);
    }
    byDay.get(day)!.push(entry.value);
  }

  for (const [day, values] of byDay) {
    const average = values.reduce((a, b) => a + b, 0) / values.length;

    await db
      .collection(DATA_COLLECTION)
      .doc(userId)
      .collection('daily')
      .doc(day)
      .set(cleanForFirestore({ heart: { hrv: Math.round(average) } }), { merge: true });
  }
}

async function storeStepsData(
  db: FirebaseFirestore.Firestore,
  userId: string,
  stepsData: NonNullable<AppleHealthSyncPayload['data']['steps']>
): Promise<void> {
  const byDay = new Map<string, number>();

  for (const entry of stepsData) {
    const day = entry.startDate.split('T')[0];
    byDay.set(day, (byDay.get(day) || 0) + entry.value);
  }

  for (const [day, steps] of byDay) {
    await db
      .collection(DATA_COLLECTION)
      .doc(userId)
      .collection('daily')
      .doc(day)
      .set(cleanForFirestore({ activity: { steps } }), { merge: true });
  }
}

async function storeWorkout(
  db: FirebaseFirestore.Firestore,
  userId: string,
  workout: AppleHealthWorkoutData
): Promise<void> {
  if (!workout) return;
  const day = workout.startDate.split('T')[0];

  await db
    .collection(DATA_COLLECTION)
    .doc(userId)
    .collection('workouts')
    .doc(workout.id)
    .set(cleanForFirestore({
      ...workout,
      day,
      syncedAt: new Date().toISOString(),
    }));
}

async function storeMindfulnessSession(
  db: FirebaseFirestore.Firestore,
  userId: string,
  session: AppleHealthMindfulnessData
): Promise<void> {
  if (!session) return;
  const day = session.startDate.split('T')[0];

  // Aggregate mindfulness by day
  const docRef = db.collection(DATA_COLLECTION).doc(userId).collection('daily').doc(day);
  const doc = await docRef.get();
  const existing = doc.data()?.mindfulness || { totalMinutes: 0, sessions: 0 };

  await docRef.set(
    cleanForFirestore({
      mindfulness: {
        totalMinutes: existing.totalMinutes + session.duration / 60,
        sessions: existing.sessions + 1,
      },
    }),
    { merge: true }
  );
}

async function updateConnectionStatus(
  db: FirebaseFirestore.Firestore,
  userId: string,
  deviceId: string,
  syncedAt: string
): Promise<void> {
  // Get token doc to get device name
  const tokenDoc = await db.collection(SYNC_TOKEN_COLLECTION).doc(userId).get();
  const deviceName = tokenDoc.data()?.deviceName || null;

  await db
    .collection(STATUS_COLLECTION)
    .doc(userId)
    .set(
      cleanForFirestore({
        connected: true,
        lastSyncAt: syncedAt,
        deviceId,
        deviceName,
        authorizedTypes: [
          'sleep',
          'activity',
          'heartRate',
          'hrv',
          'steps',
          'workouts',
          'mindfulness',
        ],
      }),
      { merge: true }
    );
}

// ============================================================================
// STATUS & DATA ACCESS
// ============================================================================

/**
 * Get connection status for a user
 */
export async function getConnectionStatus(userId: string): Promise<AppleHealthAuthStatus> {
  // Check cache
  const cached = statusCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.status;
  }

  try {
    const db = getFirestoreDb();
    if (!db) {
      return { connected: false, lastSyncAt: null, authorizedTypes: [], deviceName: null };
    }

    const doc = await db.collection(STATUS_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      const status: AppleHealthAuthStatus = {
        connected: false,
        lastSyncAt: null,
        authorizedTypes: [],
        deviceName: null,
      };
      statusCache.set(cleanForFirestore(userId), { status, expiresAt: Date.now() + CACHE_TTL_MS });
      return status;
    }

    const data = doc.data()!;
    const status: AppleHealthAuthStatus = {
      connected: data.connected ?? false,
      lastSyncAt: data.lastSyncAt ?? null,
      authorizedTypes: data.authorizedTypes ?? [],
      deviceName: data.deviceName ?? null,
    };

    statusCache.set(cleanForFirestore(userId), { status, expiresAt: Date.now() + CACHE_TTL_MS });
    return status;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get connection status');
    return { connected: false, lastSyncAt: null, authorizedTypes: [], deviceName: null };
  }
}

/**
 * Get daily summary for a specific date
 */
export async function getDailySummary(
  userId: string,
  date?: string
): Promise<AppleHealthResult<AppleHealthDailySummary>> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    const targetDate = date || new Date().toISOString().split('T')[0];
    const doc = await db
      .collection(DATA_COLLECTION)
      .doc(userId)
      .collection('daily')
      .doc(targetDate)
      .get();

    if (!doc.exists) {
      return { success: false, error: 'No data for this date' };
    }

    const data = doc.data()!;
    const summary: AppleHealthDailySummary = {
      date: targetDate,
      sleep: data.sleep || null,
      activity: data.activity || null,
      heart: data.heart || null,
      mindfulness: data.mindfulness || null,
    };

    return { success: true, data: summary };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get daily summary');
    return { success: false, error: 'Failed to get summary' };
  }
}

/**
 * Check if Apple Health is configured (has sync token)
 */
export async function isAppleHealthConfigured(userId: string): Promise<boolean> {
  try {
    const db = getFirestoreDb();
    if (!db) return false;

    const doc = await db.collection(SYNC_TOKEN_COLLECTION).doc(userId).get();
    return doc.exists;
  } catch {
    return false;
  }
}

/**
 * Get recent daily summaries
 */
export async function getRecentSummaries(
  userId: string,
  days: number = 7
): Promise<AppleHealthResult<AppleHealthDailySummary[]>> {
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshot = await db
      .collection(DATA_COLLECTION)
      .doc(userId)
      .collection('daily')
      .where('__name__', '>=', startDate.toISOString().split('T')[0])
      .where('__name__', '<=', endDate.toISOString().split('T')[0])
      .orderBy('__name__', 'desc')
      .get();

    const summaries: AppleHealthDailySummary[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        date: doc.id,
        sleep: data.sleep || null,
        activity: data.activity || null,
        heart: data.heart || null,
        mindfulness: data.mindfulness || null,
      };
    });

    return { success: true, data: summaries };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get recent summaries');
    return { success: false, error: 'Failed to get summaries' };
  }
}
