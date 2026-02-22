/**
 * BTH Signal Logger
 *
 * Logs Better Than Human (BTH) signals to Firestore for analytics and observability.
 * Writes to: bogle_users/{userId}/bth_signals/{auto-id}
 *
 * Uses fire-and-forget pattern to avoid blocking the voice pipeline.
 * Batches writes within 500ms window. Circuit breaker disables logging
 * for 60 seconds after 3 consecutive Firestore failures.
 *
 * @module analytics/bth-signal-logger
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'BTHSignalLogger' });

// ============================================================================
// TYPES
// ============================================================================

export interface LogBTHSignalParams {
  userId: string;
  sessionId: string;
  personaId: string;
  signalType: string;
  payload: Record<string, unknown>;
}

interface QueuedSignal {
  params: LogBTHSignalParams;
  timestamp: number;
}

interface BTHSignalDocument {
  signalType: string;
  intensity?: number;
  personaId: string;
  sessionId: string;
  timestamp: number;
  [key: string]: unknown;
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

let consecutiveFailures = 0;
let circuitOpenUntil: number | null = null;

function isCircuitOpen(): boolean {
  if (circuitOpenUntil === null) return false;
  if (Date.now() > circuitOpenUntil) {
    circuitOpenUntil = null;
    consecutiveFailures = 0;
    log.info('BTH signal logger circuit breaker reset');
    return false;
  }
  return true;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
    log.warn(
      {
        consecutiveFailures,
        cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS,
      },
      'BTH signal logger circuit breaker opened - logging disabled for 60s'
    );
  }
}

// ============================================================================
// BATCH BUFFER
// ============================================================================

const BATCH_DEBOUNCE_MS = 500;
const MAX_BATCH_SIZE = 100;

const pendingSignals: QueuedSignal[] = [];
let flushTimeoutId: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// FLUSH LOGIC
// ============================================================================

function buildDocument(params: LogBTHSignalParams): BTHSignalDocument {
  const { signalType, personaId, sessionId, payload } = params;
  const intensity = (payload.intensity as number | undefined) ?? 0.5;
  const { intensity: _i, ...restPayload } = payload;

  return cleanForFirestore({
    signalType,
    intensity,
    personaId,
    sessionId,
    timestamp: Date.now(),
    ...restPayload,
  }) as BTHSignalDocument;
}

async function flushToFirestore(): Promise<void> {
  if (pendingSignals.length === 0) return;

  const db = getFirestoreDb();
  if (!db) {
    log.debug('Firestore unavailable, skipping BTH signal flush');
    return;
  }

  const toFlush = pendingSignals.splice(0, MAX_BATCH_SIZE);
  flushTimeoutId = null;

  // Group by userId for batch writes ( Firestore batch is per-collection)
  const byUser = new Map<string, QueuedSignal[]>();
  for (const item of toFlush) {
    const list = byUser.get(item.params.userId) ?? [];
    list.push(item);
    byUser.set(item.params.userId, list);
  }

  try {
    for (const [userId, signals] of byUser) {
      const userRef = db.collection('bogle_users').doc(userId);
      const batch = db.batch();

      for (const { params } of signals) {
        const docRef = userRef.collection('bth_signals').doc();
        const doc = buildDocument(params);
        batch.set(docRef, doc);
      }

      await batch.commit();
    }

    recordSuccess();
    log.debug({ count: toFlush.length }, 'BTH signals written to Firestore');
  } catch (error) {
    recordFailure();
    log.error(
      { error: String(error), count: toFlush.length },
      'BTH signal Firestore write failed'
    );
  }
}

function scheduleFlush(): void {
  if (flushTimeoutId !== null) return;

  flushTimeoutId = setTimeout(() => {
    flushTimeoutId = null;
    flushToFirestore().catch((err) => {
      log.error({ error: String(err) }, 'BTH signal flush failed');
    });
  }, BATCH_DEBOUNCE_MS);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Log a BTH signal to Firestore for analytics and observability.
 *
 * Fire-and-forget: does not block. Batches writes within 500ms.
 * Circuit breaker disables logging for 60s after 3 consecutive failures.
 *
 * @param params - Signal parameters (userId, sessionId, personaId, signalType, payload)
 */
export function logBTHSignal(params: LogBTHSignalParams): void {
  if (!params.userId) {
    log.debug('Skipping BTH signal log - no userId');
    return;
  }

  if (isCircuitOpen()) {
    return;
  }

  pendingSignals.push({
    params,
    timestamp: Date.now(),
  });

  scheduleFlush();
}

/**
 * Flush any pending signals immediately. For testing and shutdown.
 */
export async function flushBTHSignalQueue(): Promise<void> {
  if (flushTimeoutId !== null) {
    clearTimeout(flushTimeoutId);
    flushTimeoutId = null;
  }
  await flushToFirestore();
}

/**
 * Reset circuit breaker and batch state. For testing only.
 */
export function resetBTHSignalLogger(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = null;
  if (flushTimeoutId !== null) {
    clearTimeout(flushTimeoutId);
    flushTimeoutId = null;
  }
  pendingSignals.length = 0;
}
