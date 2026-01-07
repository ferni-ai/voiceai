/**
 * Firestore utilities for Superhuman services
 *
 * Provides a shared Firestore instance and type-safe helpers for
 * storing and retrieving superhuman service data.
 *
 * HEALTH MONITORING:
 * - Tracks connection status and degradation events
 * - Provides health info for /health/superhuman endpoint
 * - Logs when services fall back to empty results
 */

import { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';

// Re-export cleanForFirestore for convenience
export {
  cleanForFirestore,
  removeUndefined,
  deepRemoveUndefined,
} from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'superhuman-firestore' });

let db: Firestore | null = null;
let initialized = false;

// Health tracking for observability
interface DegradationEvent {
  service: string;
  timestamp: string;
  reason: string;
}

interface SuperhumanHealthStatus {
  dbAvailable: boolean;
  initialized: boolean;
  initializationError: string | null;
  degradationCount: number;
  recentDegradations: DegradationEvent[];
  lastDegradationAt: string | null;
}

let initializationError: string | null = null;
let degradationCount = 0;
const recentDegradations: DegradationEvent[] = [];
const MAX_DEGRADATION_HISTORY = 20;
let lastDegradationAt: string | null = null;

/**
 * Get or initialize the Firestore database instance.
 * Returns null if Firestore is not available.
 */
export function getFirestoreDb(): Firestore | null {
  if (initialized) {
    return db;
  }

  try {
    db = new Firestore();
    initialized = true;
    initializationError = null;
    log.debug('Superhuman Firestore initialized');
    return db;
  } catch (error) {
    const errorMsg = String(error);
    log.warn({ error: errorMsg }, 'Firestore not available for superhuman services');
    initialized = true; // Don't retry
    initializationError = errorMsg;
    return null;
  }
}

/**
 * Record when a superhuman service degrades (falls back to empty results).
 * Call this from services when they detect !db and return early.
 *
 * @param serviceName - Name of the service that degraded
 * @param reason - Why it degraded (typically 'db_unavailable')
 */
export function recordDegradation(serviceName: string, reason: string = 'db_unavailable'): void {
  degradationCount++;
  const timestamp = new Date().toISOString();
  lastDegradationAt = timestamp;

  const event: DegradationEvent = { service: serviceName, timestamp, reason };
  recentDegradations.unshift(event);

  // Keep history bounded
  if (recentDegradations.length > MAX_DEGRADATION_HISTORY) {
    recentDegradations.pop();
  }

  // Log at warn level for visibility (Task 2: degradation logging)
  log.warn(
    { service: serviceName, reason, totalDegradations: degradationCount },
    `Superhuman service degraded: ${serviceName} falling back to empty results`
  );
}

/**
 * Get health status for the superhuman services Firestore connection.
 * Used by /health/superhuman endpoint.
 */
export function getSuperhmanHealth(): SuperhumanHealthStatus {
  return {
    dbAvailable: db !== null,
    initialized,
    initializationError,
    degradationCount,
    recentDegradations: [...recentDegradations],
    lastDegradationAt,
  };
}

/**
 * List of all superhuman services that depend on Firestore.
 * Used for health endpoint reporting.
 */
export const SUPERHUMAN_SERVICES = [
  'anticipatory-planning',
  'calendar-prep-coaching',
  'capacity-guardian',
  'celebration-balance',
  'commitment-keeper',
  'conflict-resolution-memory',
  'dream-keeper',
  'life-narrative',
  'milestone-tracker',
  'planning-coordination',
  'predictive-coaching',
  'relationship-network',
  'seasonal-awareness',
  'values-alignment',
  'relationship-milestones',
  'emotional-first-aid',
  'relationship-network-graph',
  'social-graph',
  'cross-persona-insights',
] as const;

export type SuperhumanServiceName = (typeof SUPERHUMAN_SERVICES)[number];

/**
 * Reset the Firestore instance (for testing).
 */
export function resetFirestoreInstance(): void {
  db = null;
  initialized = false;
}
