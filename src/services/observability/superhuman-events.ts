/**
 * Superhuman Activation Events
 *
 * Tracks when superhuman capabilities are activated during conversations.
 * This is in services/ layer so it can be imported by intelligence/ layer.
 *
 * @module services/observability/superhuman-events
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'superhuman-events' });

// ============================================================================
// TYPES
// ============================================================================

export interface SuperhumanActivationEvent {
  userId: string;
  persona: string;
  capabilities: string[];
  cacheHit: boolean;
  durationMs: number;
  timestamp: string;
}

// ============================================================================
// EVENT BUFFER
// ============================================================================

const superhumanActivationEvents: SuperhumanActivationEvent[] = [];
const MAX_SUPERHUMAN_EVENTS = 100;

/**
 * Emit a superhuman activation event for monitoring/debugging
 * Used by superhuman-integration.ts when capabilities are loaded
 *
 * @param event Event data including which capabilities were activated
 */
export function emitSuperhumanActivation(
  event: Omit<SuperhumanActivationEvent, 'timestamp'>
): void {
  const fullEvent: SuperhumanActivationEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Add to buffer (ring buffer behavior)
  superhumanActivationEvents.push(fullEvent);
  if (superhumanActivationEvents.length > MAX_SUPERHUMAN_EVENTS) {
    superhumanActivationEvents.shift();
  }

  // Log at debug level for immediate observability
  log.debug(
    { persona: event.persona, capabilities: event.capabilities.length, cacheHit: event.cacheHit },
    `🦸 Superhuman activated: ${event.capabilities.length} capabilities for ${event.persona}`
  );
}

/**
 * Get recent superhuman activation events
 * @param limit Max number of events to return (default: 50)
 */
export function getSuperhumanActivationEvents(limit = 50): SuperhumanActivationEvent[] {
  return superhumanActivationEvents.slice(-limit);
}

/**
 * Clear all superhuman activation events (for testing/admin)
 */
export function clearSuperhumanActivationEvents(): void {
  superhumanActivationEvents.length = 0;
}

/**
 * Get superhuman activation statistics
 */
export function getSuperhumanActivationStats(): {
  totalActivations: number;
  cacheHitRate: number;
  avgDurationMs: number;
  byPersona: Record<string, number>;
  topCapabilities: Array<{ capability: string; count: number }>;
} {
  if (superhumanActivationEvents.length === 0) {
    return {
      totalActivations: 0,
      cacheHitRate: 0,
      avgDurationMs: 0,
      byPersona: {},
      topCapabilities: [],
    };
  }

  const totalActivations = superhumanActivationEvents.length;
  const cacheHits = superhumanActivationEvents.filter((e) => e.cacheHit).length;
  const totalDuration = superhumanActivationEvents.reduce((sum, e) => sum + e.durationMs, 0);

  // Count by persona
  const byPersona: Record<string, number> = {};
  for (const event of superhumanActivationEvents) {
    byPersona[event.persona] = (byPersona[event.persona] || 0) + 1;
  }

  // Count capabilities
  const capabilityCounts: Record<string, number> = {};
  for (const event of superhumanActivationEvents) {
    for (const cap of event.capabilities) {
      capabilityCounts[cap] = (capabilityCounts[cap] || 0) + 1;
    }
  }

  // Sort capabilities by count
  const topCapabilities = Object.entries(capabilityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([capability, count]) => ({ capability, count }));

  return {
    totalActivations,
    cacheHitRate: Math.round((cacheHits / totalActivations) * 100) / 100,
    avgDurationMs: Math.round(totalDuration / totalActivations),
    byPersona,
    topCapabilities,
  };
}
