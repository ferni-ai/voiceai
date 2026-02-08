/**
 * Real-time Data Persistence Service
 *
 * Persists user learnings to Firestore AS THEY HAPPEN, not just at session end.
 * This ensures Ferni remembers everything even if sessions crash or end abruptly.
 *
 * "Better than Human" - We never forget because we save immediately.
 *
 * What gets persisted in real-time:
 * - Social graph (people mentioned)
 * - Extracted details (names, places, pets)
 * - Contact information
 * - Key moments
 * - Commitments
 *
 * @module services/realtime-persistence
 */

import { createLogger } from '../utils/safe-logger.js';
import { runBackground } from '../utils/background-task.js';
import { MAX_RETRIES, RETRY_DELAY_MS } from '../config/resilience-config.js';

const log = createLogger({ module: 'RealtimePersistence' });

// ============================================================================
// RETRY LOGIC (uses centralized resilience-config)
// ============================================================================

/**
 * Execute a function with retry logic for transient failures
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<T | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is retryable (transient network/Firestore issues)
      const isRetryable =
        lastError.message.includes('UNAVAILABLE') ||
        lastError.message.includes('DEADLINE_EXCEEDED') ||
        lastError.message.includes('INTERNAL') ||
        lastError.message.includes('network');

      if (!isRetryable || attempt === maxRetries) {
        log.error(
          { context, attempt, maxRetries, error: lastError.message },
          `${context} failed after ${attempt} attempts`
        );
        return null;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      log.warn({ context, attempt, delay }, `${context} failed, retrying in ${delay}ms`);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  return null;
}

// Track last save timestamps to avoid over-saving
const lastSaveTimestamps = new Map<string, { details: number; socialGraph: number }>();
const MIN_SAVE_INTERVAL_MS = 30_000; // Don't save more often than every 30 seconds

// ============================================================================
// EXTRACTED DETAILS PERSISTENCE
// ============================================================================

/**
 * Persist extracted details (names, places, pets, etc.) to Firestore
 * These are stored in the user profile for long-term recall
 */
export async function persistExtractedDetails(
  userId: string,
  details: Array<{ type: string; value: string }>
): Promise<void> {
  if (!userId || userId === 'anonymous' || details.length === 0) {
    return;
  }

  // Rate limit saves
  const timestamps = lastSaveTimestamps.get(userId) || { details: 0, socialGraph: 0 };
  const now = Date.now();
  if (now - timestamps.details < MIN_SAVE_INTERVAL_MS) {
    log.debug({ userId, detailCount: details.length }, 'Skipping detail save (rate limited)');
    return;
  }

  const result = await withRetry(async () => {
    const { getFirestoreStore } = await import('../memory/firestore-store.js');
    const store = getFirestoreStore();

    // Get current profile
    const profile = await store.getProfile(userId);
    if (!profile) {
      log.warn({ userId }, 'Cannot persist details - no profile found');
      return { skipped: true };
    }

    // Merge new details with existing (dedupe by type+value)
    const existingDetails = profile.extractedDetails || [];
    const detailKey = (d: { type: string; value: string }) => `${d.type}:${d.value.toLowerCase()}`;
    const existingKeys = new Set(existingDetails.map(detailKey));

    const newDetails = details.filter((d) => !existingKeys.has(detailKey(d)));
    if (newDetails.length === 0) {
      return { skipped: true }; // Nothing new to save
    }

    const mergedDetails = [...existingDetails, ...newDetails].slice(-50); // Keep last 50

    // CRITICAL FIX: If we extracted a user_name, also update profile.name!
    // This ensures the primary name field gets set, not just extractedDetails
    const userNameDetail = newDetails.find((d) => d.type === 'user_name');

    // Atomic update using a profile transformer
    // Type assertion needed because input type is more general than UserProfile's specific union
    type ProfileDetailType = NonNullable<
      Awaited<ReturnType<typeof store.getProfile>>
    >['extractedDetails'];
    await store.atomicProfileUpdate(userId, (currentProfile) => {
      const updates: Partial<typeof currentProfile> = {
        extractedDetails: mergedDetails as ProfileDetailType,
      };

      // If we found user's name and profile doesn't have one, set it!
      if (userNameDetail && !currentProfile.name) {
        updates.name = userNameDetail.value;
        log.info(
          { userId, name: userNameDetail.value },
          '🎉 Learned user name from conversation - updating profile!'
        );
      }

      return { ...currentProfile, ...updates };
    });

    return { newCount: newDetails.length, totalCount: mergedDetails.length };
  }, 'persistExtractedDetails');

  if (result && !('skipped' in result)) {
    timestamps.details = now;
    lastSaveTimestamps.set(userId, timestamps);
    log.info(
      { userId, newCount: result.newCount, totalCount: result.totalCount },
      '💾 Persisted extracted details to Firestore'
    );
  }
}

// ============================================================================
// SOCIAL GRAPH PERSISTENCE
// ============================================================================

/**
 * Persist social graph (people mentioned) to Firestore
 */
export async function persistSocialGraph(userId: string): Promise<void> {
  if (!userId || userId === 'anonymous') {
    return;
  }

  // Rate limit saves
  const timestamps = lastSaveTimestamps.get(userId) || { details: 0, socialGraph: 0 };
  const now = Date.now();
  if (now - timestamps.socialGraph < MIN_SAVE_INTERVAL_MS) {
    log.debug({ userId }, 'Skipping social graph save (rate limited)');
    return;
  }

  const result = await withRetry(async () => {
    const { getUserGraph, persistGraphToFirestore } = await import('./social-graph/index.js');
    const graph = getUserGraph(userId);
    if (!graph || graph.people.size === 0) {
      return { skipped: true };
    }

    // Persist to Firestore
    await persistGraphToFirestore(userId, graph);

    return { peopleCount: graph.people.size };
  }, 'persistSocialGraph');

  if (result && !('skipped' in result)) {
    timestamps.socialGraph = now;
    lastSaveTimestamps.set(userId, timestamps);
    log.info({ userId, peopleCount: result.peopleCount }, '💾 Persisted social graph to Firestore');
  }
}

// ============================================================================
// COMBINED REAL-TIME SAVE (called periodically)
// ============================================================================

/**
 * Save all pending real-time data for a user
 * Called every N turns or on important events
 */
export async function saveRealtimeData(
  userId: string,
  extractedDetails?: Array<{ type: string; value: string }>
): Promise<void> {
  if (!userId || userId === 'anonymous') {
    return;
  }

  // Run saves in parallel (fire and forget)
  const promises: Array<Promise<void>> = [];

  if (extractedDetails && extractedDetails.length > 0) {
    promises.push(persistExtractedDetails(userId, extractedDetails));
  }

  promises.push(persistSocialGraph(userId));

  await Promise.allSettled(promises);
}

// ============================================================================
// PERIODIC AUTO-SAVE (called from turn processor)
// ============================================================================

const SAVE_EVERY_N_TURNS = 3;

/**
 * Check if we should auto-save based on turn count
 */
export function shouldAutoSave(turnCount: number): boolean {
  return turnCount > 0 && turnCount % SAVE_EVERY_N_TURNS === 0;
}

/**
 * Trigger auto-save in background (non-blocking)
 */
export function triggerAutoSave(
  userId: string,
  turnCount: number,
  extractedDetails?: Array<{ type: string; value: string }>
): void {
  if (!shouldAutoSave(turnCount)) {
    return;
  }

  runBackground(saveRealtimeData(userId, extractedDetails), {
    task: 'realtime-auto-save',
    userId,
  });

  log.debug({ userId, turnCount }, '🔄 Triggered auto-save');
}

// ============================================================================
// SESSION END CLEANUP
// ============================================================================

/**
 * Clear rate limit tracking for a user (call on session end)
 */
export function clearRateLimits(userId: string): void {
  lastSaveTimestamps.delete(userId);
}
