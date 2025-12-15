/**
 * Telemetry Collector Service
 *
 * Collects "Better Than Human" telemetry events from the frontend
 * and batches them for sending to the backend via data channel.
 *
 * Events tracked:
 * - Micro-expressions played
 * - Active listening triggered
 * - Breath sync activated
 * - Concern detected
 * - Anticipation triggered
 *
 * @module TelemetryCollector
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('TelemetryCollector');

// ============================================================================
// TYPES
// ============================================================================

interface TelemetryEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

interface TelemetryBatch {
  sessionId: string;
  events: TelemetryEvent[];
  batchedAt: number;
}

// ============================================================================
// STATE
// ============================================================================

let sessionId: string | null = null;
let events: TelemetryEvent[] = [];
let sendCallback: ((batch: TelemetryBatch) => void) | null = null;
let batchInterval: number | null = null;
const BATCH_INTERVAL_MS = 30000; // Send batch every 30 seconds
const MAX_EVENTS_PER_BATCH = 100;

// ============================================================================
// COLLECTOR
// ============================================================================

/**
 * Initialize the telemetry collector
 */
export function initTelemetryCollector(
  currentSessionId: string,
  onBatchReady?: (batch: TelemetryBatch) => void
): void {
  sessionId = currentSessionId;
  sendCallback = onBatchReady || null;
  events = [];

  // Listen for telemetry events from EQ system
  document.addEventListener('ferni:telemetry', handleTelemetryEvent as EventListener);

  // Set up batch interval
  if (batchInterval) {
    clearInterval(batchInterval);
  }
  batchInterval = window.setInterval(flushBatch, BATCH_INTERVAL_MS);

  log.info('Telemetry collector initialized', { sessionId });
}

/**
 * Handle incoming telemetry event
 */
function handleTelemetryEvent(event: CustomEvent<{ type: string; [key: string]: unknown }>): void {
  const { type, ...data } = event.detail;

  events.push({
    type,
    timestamp: Date.now(),
    data,
  });

  // Flush if we hit max events
  if (events.length >= MAX_EVENTS_PER_BATCH) {
    flushBatch();
  }
}

/**
 * Flush current batch of events
 */
export function flushBatch(): void {
  if (events.length === 0 || !sessionId) {
    return;
  }

  const batch: TelemetryBatch = {
    sessionId,
    events: [...events],
    batchedAt: Date.now(),
  };

  // Clear events
  events = [];

  // Log summary
  const summary = batch.events.reduce(
    (acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  log.debug('Telemetry batch ready', { eventCount: batch.events.length, summary });

  // Send to callback
  if (sendCallback) {
    sendCallback(batch);
  }

  // Also dispatch as event for data channel to pick up
  document.dispatchEvent(
    new CustomEvent('ferni:telemetry-batch', {
      detail: batch,
    })
  );
}

/**
 * Get current telemetry summary
 */
export function getTelemetrySummary(): Record<string, number> {
  return events.reduce(
    (acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

/**
 * Shutdown the collector
 */
export function shutdownTelemetryCollector(): void {
  // Flush remaining events
  flushBatch();

  // Clean up
  document.removeEventListener('ferni:telemetry', handleTelemetryEvent as EventListener);
  if (batchInterval) {
    clearInterval(batchInterval);
    batchInterval = null;
  }

  sessionId = null;
  sendCallback = null;
  events = [];

  log.info('Telemetry collector shutdown');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initTelemetryCollector,
  flushBatch,
  getTelemetrySummary,
  shutdownTelemetryCollector,
};

















