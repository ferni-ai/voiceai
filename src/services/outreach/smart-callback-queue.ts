/**
 * Smart Callback Queue
 *
 * "Better Than Human" - When calls fail (no answer, busy, voicemail),
 * automatically schedule retries at optimal times.
 *
 * Features:
 * - Learn best times to reach each contact
 * - Exponential backoff with smart timing
 * - Respect quiet hours
 * - Give up gracefully after multiple attempts
 *
 * @module services/outreach/smart-callback-queue
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'smart-callback-queue' });

// ============================================================================
// TYPES
// ============================================================================

export interface CallbackRequest {
  id: string;
  userId: string;

  // Original call details
  originalCallId: string;
  contactQuery: string;
  contactName?: string;
  contactPhone?: string;
  purpose: string;
  message?: string;

  // Retry tracking
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: string;
  lastAttemptResult: 'no_answer' | 'busy' | 'voicemail' | 'failed';

  // Scheduling
  scheduledFor: string;
  timezone: string;

  // Status
  status: 'pending' | 'scheduled' | 'completed' | 'abandoned';

  createdAt: string;
  updatedAt: string;
}

export interface ContactReachability {
  contactPhone: string;

  // Successful contact times
  successfulCallTimes: Array<{
    dayOfWeek: number;
    hourOfDay: number;
    timestamp: string;
  }>;

  // Failed attempt times
  failedAttemptTimes: Array<{
    dayOfWeek: number;
    hourOfDay: number;
    result: string;
    timestamp: string;
  }>;

  // Computed best times
  bestTimes: Array<{
    dayOfWeek: number;
    hourOfDay: number;
    score: number;
  }>;

  updatedAt: string;
}

// ============================================================================
// RETRY SCHEDULING
// ============================================================================

/**
 * Calculate the next retry time based on attempt history and learned patterns
 */
export function calculateNextRetryTime(
  attemptCount: number,
  lastResult: string,
  reachability?: ContactReachability,
  timezone: string = 'America/New_York'
): Date {
  const now = new Date();

  // Base delay increases with attempts (exponential backoff)
  const baseDelayMinutes = [15, 60, 180, 360, 720][Math.min(attemptCount, 4)];

  // If we have learned best times, try to schedule then
  if (reachability?.bestTimes.length) {
    const nextBestTime = findNextBestTime(reachability.bestTimes, now);
    if (nextBestTime) {
      return nextBestTime;
    }
  }

  // Otherwise use heuristics based on result
  let targetTime = new Date(now.getTime() + baseDelayMinutes * 60 * 1000);

  // Adjust based on result
  if (lastResult === 'busy') {
    // They're available but occupied - try again sooner
    targetTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 min
  } else if (lastResult === 'no_answer') {
    // Not available - try different time of day
    targetTime = shiftToNextWindow(targetTime);
  } else if (lastResult === 'voicemail') {
    // Probably busy or phone off - try much later
    targetTime = new Date(now.getTime() + Math.max(baseDelayMinutes, 240) * 60 * 1000);
  }

  // Ensure within reasonable hours (9am - 8pm)
  targetTime = adjustToReasonableHours(targetTime);

  return targetTime;
}

/**
 * Find the next occurrence of a "best time" window
 */
function findNextBestTime(
  bestTimes: Array<{ dayOfWeek: number; hourOfDay: number; score: number }>,
  after: Date
): Date | null {
  if (bestTimes.length === 0) return null;

  // Sort by score descending
  const sorted = [...bestTimes].sort((a, b) => b.score - a.score);

  // Find next occurrence of top 3 best times
  for (const slot of sorted.slice(0, 3)) {
    const next = findNextOccurrence(slot.dayOfWeek, slot.hourOfDay, after);
    if (next) {
      return next;
    }
  }

  return null;
}

/**
 * Find next occurrence of a specific day/hour
 */
function findNextOccurrence(dayOfWeek: number, hourOfDay: number, after: Date): Date {
  const result = new Date(after);
  result.setHours(hourOfDay, 0, 0, 0);

  const daysUntil = (dayOfWeek - after.getDay() + 7) % 7;
  result.setDate(result.getDate() + daysUntil);

  // If same day but hour already passed, go to next week
  if (daysUntil === 0 && result <= after) {
    result.setDate(result.getDate() + 7);
  }

  return result;
}

/**
 * Shift time to next "window" (morning, afternoon, evening)
 */
function shiftToNextWindow(time: Date): Date {
  const hour = time.getHours();
  const result = new Date(time);

  if (hour < 12) {
    // Morning attempt - try afternoon
    result.setHours(14, 0, 0, 0);
  } else if (hour < 17) {
    // Afternoon attempt - try evening
    result.setHours(18, 30, 0, 0);
  } else {
    // Evening attempt - try next morning
    result.setDate(result.getDate() + 1);
    result.setHours(10, 0, 0, 0);
  }

  return result;
}

/**
 * Adjust time to reasonable calling hours
 */
function adjustToReasonableHours(time: Date): Date {
  const result = new Date(time);
  const hour = result.getHours();

  if (hour < 9) {
    result.setHours(9, 30, 0, 0);
  } else if (hour >= 20) {
    result.setDate(result.getDate() + 1);
    result.setHours(10, 0, 0, 0);
  }

  return result;
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

/**
 * Add a failed call to the retry queue
 */
export async function queueCallbackRetry(
  userId: string,
  originalCallId: string,
  contactQuery: string,
  contactName: string | undefined,
  contactPhone: string | undefined,
  purpose: string,
  message: string | undefined,
  result: 'no_answer' | 'busy' | 'voicemail' | 'failed'
): Promise<CallbackRequest | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.warn('Firestore not available for callback queue');
      return null;
    }

    // Check if there's already a pending retry for this contact
    const existingSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('callback_queue')
      .where('contactPhone', '==', contactPhone)
      .where('status', 'in', ['pending', 'scheduled'])
      .limit(1)
      .get();

    let attemptCount = 1;
    let existingId: string | null = null;

    if (!existingSnapshot.empty) {
      const existing = existingSnapshot.docs[0].data() as CallbackRequest;
      attemptCount = existing.attemptCount + 1;
      existingId = existing.id;

      // Check if we should give up
      if (attemptCount >= existing.maxAttempts) {
        await markCallbackAbandoned(userId, existing.id, 'max_attempts_reached');
        log.info({ userId, contactName, attemptCount }, 'Callback abandoned after max attempts');
        return null;
      }
    }

    // Get contact reachability data
    const reachability = await getContactReachability(userId, contactPhone || '');

    // Calculate next retry time
    const nextRetry = calculateNextRetryTime(attemptCount, result, reachability);

    const callbackRequest: CallbackRequest = {
      id: existingId || `callback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      originalCallId,
      contactQuery,
      contactName,
      contactPhone,
      purpose,
      message,
      attemptCount,
      maxAttempts: 5,
      lastAttemptAt: new Date().toISOString(),
      lastAttemptResult: result,
      scheduledFor: nextRetry.toISOString(),
      timezone: 'America/New_York', // TODO: Get from user profile
      status: 'scheduled',
      createdAt: existingId ? '' : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to queue
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('callback_queue')
      .doc(callbackRequest.id);

    if (existingId) {
      await docRef.update({
        attemptCount: callbackRequest.attemptCount,
        lastAttemptAt: callbackRequest.lastAttemptAt,
        lastAttemptResult: callbackRequest.lastAttemptResult,
        scheduledFor: callbackRequest.scheduledFor,
        status: callbackRequest.status,
        updatedAt: callbackRequest.updatedAt,
      });
    } else {
      await docRef.set(callbackRequest);
    }

    // Record failed attempt for learning
    await recordAttemptResult(userId, contactPhone || '', result);

    log.info(
      {
        userId,
        contactName,
        attemptCount,
        result,
        nextRetry: nextRetry.toISOString(),
      },
      'Queued callback retry'
    );

    return callbackRequest;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to queue callback retry');
    return null;
  }
}

/**
 * Get pending callbacks that are due
 */
export async function getDueCallbacks(userId?: string): Promise<CallbackRequest[]> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return [];

    const now = new Date().toISOString();

    let query = db
      .collectionGroup('callback_queue')
      .where('status', '==', 'scheduled')
      .where('scheduledFor', '<=', now)
      .limit(50);

    // If specific user, filter
    // Note: collectionGroup queries can't filter by parent doc

    const snapshot = await query.get();

    const callbacks: CallbackRequest[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as CallbackRequest;
      if (!userId || data.userId === userId) {
        callbacks.push(data);
      }
    });

    return callbacks;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get due callbacks');
    return [];
  }
}

/**
 * Mark a callback as completed
 */
export async function markCallbackCompleted(userId: string, callbackId: string): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('callback_queue')
      .doc(callbackId)
      .update({
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });

    log.info({ userId, callbackId }, 'Marked callback completed');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to mark callback completed');
  }
}

/**
 * Mark a callback as abandoned
 */
export async function markCallbackAbandoned(
  userId: string,
  callbackId: string,
  reason: string
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('callback_queue')
      .doc(callbackId)
      .update({
        status: 'abandoned',
        abandonReason: reason,
        updatedAt: new Date().toISOString(),
      });

    log.info({ userId, callbackId, reason }, 'Marked callback abandoned');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to mark callback abandoned');
  }
}

// ============================================================================
// REACHABILITY LEARNING
// ============================================================================

/**
 * Get learned reachability patterns for a contact
 */
async function getContactReachability(
  userId: string,
  contactPhone: string
): Promise<ContactReachability | undefined> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db || !contactPhone) return undefined;

    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('contact_reachability')
      .doc(contactPhone.replace(/\D/g, ''))
      .get();

    if (!doc.exists) return undefined;

    return doc.data() as ContactReachability;
  } catch {
    return undefined;
  }
}

/**
 * Record a call attempt result for learning
 */
async function recordAttemptResult(
  userId: string,
  contactPhone: string,
  result: string
): Promise<void> {
  if (!contactPhone) return;

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return;

    const now = new Date();
    const phoneKey = contactPhone.replace(/\D/g, '');
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('contact_reachability')
      .doc(phoneKey);

    const doc = await docRef.get();
    const data = doc.exists
      ? (doc.data() as ContactReachability)
      : {
          contactPhone,
          successfulCallTimes: [],
          failedAttemptTimes: [],
          bestTimes: [],
          updatedAt: now.toISOString(),
        };

    // Add to failed attempts
    data.failedAttemptTimes.push({
      dayOfWeek: now.getDay(),
      hourOfDay: now.getHours(),
      result,
      timestamp: now.toISOString(),
    });

    // Keep only last 20 attempts
    data.failedAttemptTimes = data.failedAttemptTimes.slice(-20);

    // Recompute best times
    data.bestTimes = computeBestTimes(data);
    data.updatedAt = now.toISOString();

    await docRef.set(data);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to record attempt result');
  }
}

/**
 * Record a successful call for learning
 */
export async function recordSuccessfulCall(userId: string, contactPhone: string): Promise<void> {
  if (!contactPhone) return;

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return;

    const now = new Date();
    const phoneKey = contactPhone.replace(/\D/g, '');
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('contact_reachability')
      .doc(phoneKey);

    const doc = await docRef.get();
    const data = doc.exists
      ? (doc.data() as ContactReachability)
      : {
          contactPhone,
          successfulCallTimes: [],
          failedAttemptTimes: [],
          bestTimes: [],
          updatedAt: now.toISOString(),
        };

    // Add to successful calls
    data.successfulCallTimes.push({
      dayOfWeek: now.getDay(),
      hourOfDay: now.getHours(),
      timestamp: now.toISOString(),
    });

    // Keep only last 20 successful calls
    data.successfulCallTimes = data.successfulCallTimes.slice(-20);

    // Recompute best times
    data.bestTimes = computeBestTimes(data);
    data.updatedAt = now.toISOString();

    await docRef.set(data);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to record successful call');
  }
}

/**
 * Compute best times to reach a contact based on history
 */
function computeBestTimes(
  data: ContactReachability
): Array<{ dayOfWeek: number; hourOfDay: number; score: number }> {
  const slots = new Map<string, { successes: number; failures: number }>();

  // Count successes per slot
  for (const call of data.successfulCallTimes) {
    const key = `${call.dayOfWeek}-${call.hourOfDay}`;
    const existing = slots.get(key) || { successes: 0, failures: 0 };
    existing.successes++;
    slots.set(key, existing);
  }

  // Count failures per slot
  for (const attempt of data.failedAttemptTimes) {
    const key = `${attempt.dayOfWeek}-${attempt.hourOfDay}`;
    const existing = slots.get(key) || { successes: 0, failures: 0 };
    existing.failures++;
    slots.set(key, existing);
  }

  // Compute scores
  const bestTimes: Array<{ dayOfWeek: number; hourOfDay: number; score: number }> = [];

  for (const [key, counts] of slots) {
    const [day, hour] = key.split('-').map(Number);
    const total = counts.successes + counts.failures;
    if (total === 0) continue;

    const score = counts.successes / total;
    if (score > 0.3) {
      // Only include slots with >30% success rate
      bestTimes.push({ dayOfWeek: day, hourOfDay: hour, score });
    }
  }

  // Sort by score
  bestTimes.sort((a, b) => b.score - a.score);

  return bestTimes.slice(0, 5); // Top 5 best times
}

export default {
  queueCallbackRetry,
  getDueCallbacks,
  markCallbackCompleted,
  markCallbackAbandoned,
  recordSuccessfulCall,
  calculateNextRetryTime,
};
