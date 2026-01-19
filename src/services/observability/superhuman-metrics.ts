/**
 * Superhuman Metrics Service
 *
 * Records and retrieves superhuman capability activation metrics.
 * This belongs in the SERVICES layer to be accessible by both:
 * - intelligence layer (writes metrics)
 * - api layer (reads metrics)
 *
 * Architecture Pattern:
 * Intelligence → Services (record) → API (read)
 * NOT: Intelligence → API (violates layer boundaries)
 *
 * @module services/observability/superhuman-metrics
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SuperhumanActivationEvent {
  /** User ID for the activation */
  userId: string;
  /** Persona that activated superhuman capabilities */
  persona: string;
  /** List of activated capabilities */
  capabilities: string[];
  /** Whether the context was served from cache */
  cacheHit: boolean;
  /** Duration to build/retrieve the context in ms */
  durationMs: number;
  /** ISO timestamp of the activation */
  timestamp: string;
}

// ============================================================================
// STATE
// ============================================================================

/** In-memory buffer of recent activation events (kept small for performance) */
const activationEvents: SuperhumanActivationEvent[] = [];
const MAX_EVENTS = 100;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Records a superhuman capability activation.
 * Called by intelligence layer when superhuman context is built.
 *
 * @param event - The activation event (without timestamp)
 */
export function recordSuperhumanActivation(
  event: Omit<SuperhumanActivationEvent, 'timestamp'>
): void {
  const fullEvent: SuperhumanActivationEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  activationEvents.push(fullEvent);

  // Keep only the last MAX_EVENTS to prevent memory growth
  if (activationEvents.length > MAX_EVENTS) {
    activationEvents.shift();
  }
}

/**
 * Retrieves recent superhuman activation events.
 * Called by API layer for observability endpoints.
 *
 * @returns Copy of recent activation events
 */
export function getSuperhumanActivationEvents(): SuperhumanActivationEvent[] {
  return [...activationEvents];
}

/**
 * Clears all recorded events.
 * Useful for testing or explicit reset.
 */
export function clearSuperhumanActivationEvents(): void {
  activationEvents.length = 0;
}

/**
 * Gets summary statistics for superhuman activations.
 *
 * @returns Aggregate stats about superhuman usage
 */
export function getSuperhumanActivationStats(): {
  totalActivations: number;
  cacheHitRate: number;
  avgDurationMs: number;
  uniqueUsers: number;
  byPersona: Record<string, number>;
  topCapabilities: Array<{ capability: string; count: number }>;
} {
  if (activationEvents.length === 0) {
    return {
      totalActivations: 0,
      cacheHitRate: 0,
      avgDurationMs: 0,
      uniqueUsers: 0,
      byPersona: {},
      topCapabilities: [],
    };
  }

  const cacheHits = activationEvents.filter((e) => e.cacheHit).length;
  const totalDuration = activationEvents.reduce((sum, e) => sum + e.durationMs, 0);
  const uniqueUserIds = new Set(activationEvents.map((e) => e.userId));

  // Count by persona
  const byPersona: Record<string, number> = {};
  for (const event of activationEvents) {
    byPersona[event.persona] = (byPersona[event.persona] || 0) + 1;
  }

  // Count capability frequencies
  const capabilityCounts = new Map<string, number>();
  for (const event of activationEvents) {
    for (const cap of event.capabilities) {
      capabilityCounts.set(cap, (capabilityCounts.get(cap) || 0) + 1);
    }
  }

  // Sort by count descending, take top 10
  const topCapabilities = Array.from(capabilityCounts.entries())
    .map(([capability, count]) => ({ capability, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalActivations: activationEvents.length,
    cacheHitRate: Math.round((cacheHits / activationEvents.length) * 100) / 100,
    avgDurationMs: Math.round(totalDuration / activationEvents.length),
    uniqueUsers: uniqueUserIds.size,
    byPersona,
    topCapabilities,
  };
}
