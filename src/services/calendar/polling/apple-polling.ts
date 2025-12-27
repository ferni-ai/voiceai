/**
 * Apple Calendar Polling Service
 *
 * Since CalDAV doesn't support push notifications, we implement
 * periodic polling for Apple Calendar changes.
 *
 * Strategy:
 * - Poll every 5 minutes for active users
 * - Poll every 30 minutes for inactive users
 * - Use ctag (calendar tag) to detect changes efficiently
 * - Only fetch changed calendars
 *
 * @module calendar/polling/apple-polling
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { appleCalendarProvider } from '../providers/apple-provider.js';
import { importEventsFromProvider } from '../unified-calendar-store.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// CONSTANTS
// ============================================================================

/** How often to poll active users (ms) */
const ACTIVE_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** How often to poll inactive users (ms) */
const INACTIVE_POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes

/** How long before user is considered inactive (ms) */
const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes

/** Maximum concurrent polls */
const MAX_CONCURRENT_POLLS = 5;

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for Apple polling');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface PollingState {
  userId: string;
  lastPoll: Date;
  lastActivity: Date;
  calendars: Array<{
    url: string;
    ctag: string;
    lastChecked: Date;
  }>;
  pollCount: number;
  errorCount: number;
  lastError?: string;
}

export interface PollingResult {
  userId: string;
  success: boolean;
  eventsUpdated: number;
  calendarsChanged: number;
  error?: string;
}

// ============================================================================
// POLLING STATE
// ============================================================================

/** In-memory polling state for quick access */
const pollingStates = new Map<string, PollingState>();

/** Poll timer */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * RACE CONDITION FIX: Use a starting flag to prevent double initialization.
 * The isRunning check alone wasn't atomic - two concurrent calls could both
 * see isRunning=false and create two polling cycles.
 */
let isRunning = false;
let isStarting = false;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start the Apple Calendar polling service
 */
export function startPolling(): void {
  // RACE CONDITION FIX: Check both flags atomically
  if (isRunning || isStarting) {
    log.warn('Apple Calendar polling already running or starting');
    return;
  }

  isStarting = true;

  try {
    isRunning = true;

    // Start immediate poll
    void runPollCycle();

    // Schedule recurring polls
    pollTimer = setInterval(() => {
      void runPollCycle();
    }, ACTIVE_POLL_INTERVAL);

    log.info('🍎 Started Apple Calendar polling service');
  } finally {
    isStarting = false;
  }
}

/**
 * Stop the Apple Calendar polling service
 */
export function stopPolling(): void {
  if (!isRunning) return;

  isRunning = false;
  isStarting = false; // Reset starting flag too

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  log.info('🍎 Stopped Apple Calendar polling service');
}

/**
 * Check if polling is running
 */
export function isPollingRunning(): boolean {
  return isRunning;
}

/**
 * Poll a specific user's Apple Calendar
 */
export async function pollUser(userId: string): Promise<PollingResult> {
  const state = pollingStates.get(userId) || createInitialState(userId);

  try {
    // Check if user is connected
    const connected = await appleCalendarProvider.isConnected(userId);
    if (!connected) {
      return {
        userId,
        success: false,
        eventsUpdated: 0,
        calendarsChanged: 0,
        error: 'Not connected',
      };
    }

    // Fetch events for the next 30 days
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 30);

    const events = await appleCalendarProvider.fetchEvents(userId, now, endDate);

    // Import to unified store
    const imported = await importEventsFromProvider(userId, 'apple', events);

    // Update state
    state.lastPoll = new Date();
    state.pollCount++;
    state.errorCount = 0;
    delete state.lastError;
    pollingStates.set(userId, state);

    // Persist state
    await savePollingState(userId, state);

    log.debug(
      { userId, eventsUpdated: imported, pollCount: state.pollCount },
      '🍎 Polled Apple Calendar'
    );

    return {
      userId,
      success: true,
      eventsUpdated: imported,
      calendarsChanged: events.length > 0 ? 1 : 0,
    };
  } catch (error) {
    state.errorCount++;
    state.lastError = String(error);
    pollingStates.set(userId, state);
    await savePollingState(userId, state);

    log.error({ error: String(error), userId }, 'Error polling Apple Calendar');

    return {
      userId,
      success: false,
      eventsUpdated: 0,
      calendarsChanged: 0,
      error: String(error),
    };
  }
}

/**
 * Register a user for polling
 */
export async function registerUser(userId: string): Promise<void> {
  const state = createInitialState(userId);
  pollingStates.set(userId, state);
  await savePollingState(userId, state);

  log.info({ userId }, '🍎 Registered user for Apple Calendar polling');
}

/**
 * Unregister a user from polling
 */
export async function unregisterUser(userId: string): Promise<void> {
  pollingStates.delete(userId);
  await deletePollingState(userId);

  log.info({ userId }, '🍎 Unregistered user from Apple Calendar polling');
}

/**
 * Update user activity timestamp
 */
export function markUserActive(userId: string): void {
  const state = pollingStates.get(userId);
  if (state) {
    state.lastActivity = new Date();
    pollingStates.set(userId, state);
  }
}

/**
 * Get polling statistics
 */
export function getPollingStats(): {
  isRunning: boolean;
  totalUsers: number;
  activeUsers: number;
  totalPolls: number;
  totalErrors: number;
} {
  const now = Date.now();
  let activeUsers = 0;
  let totalPolls = 0;
  let totalErrors = 0;

  for (const state of pollingStates.values()) {
    if (now - state.lastActivity.getTime() < INACTIVE_THRESHOLD) {
      activeUsers++;
    }
    totalPolls += state.pollCount;
    totalErrors += state.errorCount;
  }

  return {
    isRunning,
    totalUsers: pollingStates.size,
    activeUsers,
    totalPolls,
    totalErrors,
  };
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Run a complete poll cycle
 */
async function runPollCycle(): Promise<void> {
  if (!isRunning) return;

  const now = Date.now();
  const usersToPoll: string[] = [];

  // Determine which users to poll
  for (const [userId, state] of pollingStates) {
    const timeSinceLastPoll = now - state.lastPoll.getTime();
    const isActive = now - state.lastActivity.getTime() < INACTIVE_THRESHOLD;

    // Too many errors? Skip for now
    if (state.errorCount >= 5) {
      continue;
    }

    // Poll based on activity level
    if (isActive && timeSinceLastPoll >= ACTIVE_POLL_INTERVAL) {
      usersToPoll.push(userId);
    } else if (!isActive && timeSinceLastPoll >= INACTIVE_POLL_INTERVAL) {
      usersToPoll.push(userId);
    }
  }

  if (usersToPoll.length === 0) {
    return;
  }

  // Poll users (with concurrency limit)
  const batches = chunk(usersToPoll, MAX_CONCURRENT_POLLS);

  for (const batch of batches) {
    await Promise.all(batch.map((userId) => pollUser(userId)));
  }

  log.debug({ polled: usersToPoll.length }, '🍎 Completed Apple Calendar poll cycle');
}

/**
 * Load users registered for polling from Firestore
 */
export async function loadRegisteredUsers(): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    const snapshot = await firestore.collectionGroup('apple_polling_state').get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const state: PollingState = {
        userId: data.userId,
        lastPoll: new Date(data.lastPoll),
        lastActivity: new Date(data.lastActivity),
        calendars: data.calendars || [],
        pollCount: data.pollCount || 0,
        errorCount: data.errorCount || 0,
        lastError: data.lastError,
      };
      pollingStates.set(state.userId, state);
    }

    log.info({ userCount: pollingStates.size }, '🍎 Loaded Apple Calendar polling users');
  } catch (error) {
    log.error({ error: String(error) }, 'Error loading polling users');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function createInitialState(userId: string): PollingState {
  return {
    userId,
    lastPoll: new Date(0),
    lastActivity: new Date(),
    calendars: [],
    pollCount: 0,
    errorCount: 0,
  };
}

async function savePollingState(userId: string, state: PollingState): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection(`users/${userId}/apple_polling_state`)
      .doc('state')
      .set(cleanForFirestore({
        ...state,
        lastPoll: state.lastPoll.toISOString(),
        lastActivity: state.lastActivity.toISOString(),
      }));
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error saving polling state');
  }
}

async function deletePollingState(userId: string): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore.collection(`users/${userId}/apple_polling_state`).doc('state').delete();
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error deleting polling state');
  }
}

function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export default {
  startPolling,
  stopPolling,
  isPollingRunning,
  pollUser,
  registerUser,
  unregisterUser,
  markUserActive,
  getPollingStats,
  loadRegisteredUsers,
};
