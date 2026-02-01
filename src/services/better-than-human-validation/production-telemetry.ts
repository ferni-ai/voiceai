/**
 * Better Than Human - Production Telemetry
 *
 * Tracks superhuman capability usage in production to measure
 * real-world effectiveness and user response.
 *
 * @module services/better-than-human-validation/production-telemetry
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import type {
  BTHProductionEvent,
  CapabilityTelemetry,
  BTHValidationConfig,
  DEFAULT_BTH_CONFIG,
} from './types.js';

const log = createLogger({ module: 'BTHProductionTelemetry' });

// ============================================================================
// IN-MEMORY BUFFER FOR BATCHING
// ============================================================================

const eventBuffer: BTHProductionEvent[] = [];
const BUFFER_FLUSH_SIZE = 50;
const BUFFER_FLUSH_INTERVAL_MS = 30000; // 30 seconds
const BTH_TELEMETRY_FLUSH_INTERVAL = 'bth-telemetry-flush';

let config: BTHValidationConfig = {
  minEvaluationsPerScenario: 10,
  minPreferenceRate: 0.6,
  minF1Score: 0.75,
  regressionThreshold: 0.05,
  telemetrySamplingRate: 1.0,
  enabledCapabilities: [
    'commitment_detection',
    'crisis_detection',
    'reading_between_lines',
    'pattern_surfacing',
    'emotional_vocabulary',
    'silence_interpretation',
    'voice_biomarkers',
    'contradiction_comfort',
    'capacity_guardian',
    'perfect_timing',
  ],
};

// Session-level tracking for user response detection
const sessionCapabilityTriggers = new Map<
  string,
  Array<{
    eventId: string;
    capability: string;
    triggeredAt: number;
    content: string;
  }>
>();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the BTH telemetry system.
 */
export function initBTHTelemetry(customConfig?: Partial<BTHValidationConfig>): void {
  if (customConfig) {
    config = { ...config, ...customConfig };
  }

  // Start periodic flush using managed interval
  registerInterval(
    BTH_TELEMETRY_FLUSH_INTERVAL,
    () => {
      flushEventBuffer().catch((err) => {
        log.error({ error: String(err) }, 'Failed to flush BTH event buffer');
      });
    },
    BUFFER_FLUSH_INTERVAL_MS
  );

  log.info(
    {
      samplingRate: config.telemetrySamplingRate,
      enabledCapabilities: config.enabledCapabilities.length,
    },
    'BTH telemetry initialized'
  );
}

/**
 * Shutdown telemetry gracefully.
 */
export async function shutdownBTHTelemetry(): Promise<void> {
  clearNamedInterval(BTH_TELEMETRY_FLUSH_INTERVAL);

  await flushEventBuffer();
  log.info('BTH telemetry shutdown complete');
}

// ============================================================================
// EVENT TRACKING
// ============================================================================

/**
 * Track when a superhuman capability is triggered.
 *
 * Call this from the capability implementations (commitment-keeper, etc.)
 * when they detect something and inject context or take action.
 */
export function trackBTHCapabilityTriggered(params: {
  userId: string;
  sessionId: string;
  capability: string;
  trigger: {
    type: 'user_message' | 'voice_signal' | 'context_detection' | 'proactive';
    content: string;
    confidence: number;
  };
  action: {
    type:
      | 'injected_context'
      | 'surfaced_pattern'
      | 'sent_notification'
      | 'modified_response'
      | 'none';
    description: string;
    contextInjected?: string;
  };
}): string {
  // Check if capability is enabled
  if (!config.enabledCapabilities.includes(params.capability)) {
    return '';
  }

  // Apply sampling rate
  if (Math.random() > config.telemetrySamplingRate) {
    return '';
  }

  const eventId = `bth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const event: BTHProductionEvent = {
    eventId,
    timestamp: new Date(),
    userId: params.userId,
    sessionId: params.sessionId,
    capability: params.capability,
    trigger: params.trigger,
    action: params.action,
  };

  // Add to buffer
  eventBuffer.push(event);

  // Track for user response correlation
  const sessionKey = params.sessionId;
  if (!sessionCapabilityTriggers.has(sessionKey)) {
    sessionCapabilityTriggers.set(sessionKey, []);
  }
  sessionCapabilityTriggers.get(sessionKey)!.push({
    eventId,
    capability: params.capability,
    triggeredAt: Date.now(),
    content: params.trigger.content,
  });

  // Flush if buffer is full
  if (eventBuffer.length >= BUFFER_FLUSH_SIZE) {
    flushEventBuffer().catch((err) => {
      log.error({ error: String(err) }, 'Failed to flush BTH event buffer');
    });
  }

  log.debug(
    {
      eventId,
      capability: params.capability,
      actionType: params.action.type,
      confidence: params.trigger.confidence,
    },
    'BTH capability triggered'
  );

  return eventId;
}

/**
 * Track user response to a previously triggered capability.
 *
 * Call this when user responds to something we surfaced.
 */
export function trackBTHUserResponse(params: {
  sessionId: string;
  userMessage: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}): void {
  const triggers = sessionCapabilityTriggers.get(params.sessionId);
  if (!triggers || triggers.length === 0) {
    return;
  }

  // Find recent triggers (within 2 minutes)
  const recentTriggers = triggers.filter((t) => Date.now() - t.triggeredAt < 120000);

  if (recentTriggers.length === 0) {
    return;
  }

  // Analyze user response
  const response = analyzeUserResponse(params.userMessage, params.sentiment);

  // Update events in buffer
  for (const trigger of recentTriggers) {
    const event = eventBuffer.find((e) => e.eventId === trigger.eventId);
    if (event) {
      event.userResponse = {
        acknowledged: response.acknowledged,
        dismissed: response.dismissed,
        engaged: response.engaged,
        sentiment: params.sentiment,
        responseTimeMs: Date.now() - trigger.triggeredAt,
      };
    }
  }

  // Clear processed triggers
  sessionCapabilityTriggers.set(
    params.sessionId,
    triggers.filter((t) => Date.now() - t.triggeredAt < 120000)
  );
}

/**
 * Track outcome of a capability (called later when we can measure).
 */
export function trackBTHOutcome(params: {
  eventId: string;
  outcome: {
    commitmentKept?: boolean;
    crisisEscalated?: boolean;
    returnedToTopic?: boolean;
    deeperVulnerability?: boolean;
  };
}): void {
  const event = eventBuffer.find((e) => e.eventId === params.eventId);
  if (event) {
    event.outcome = params.outcome;
  }

  log.debug({ eventId: params.eventId, outcome: params.outcome }, 'BTH outcome tracked');
}

// ============================================================================
// USER RESPONSE ANALYSIS
// ============================================================================

/**
 * Analyze user response to determine acknowledgment/dismissal/engagement.
 */
function analyzeUserResponse(
  message: string,
  sentiment: 'positive' | 'negative' | 'neutral'
): {
  acknowledged: boolean;
  dismissed: boolean;
  engaged: boolean;
} {
  const lowerMessage = message.toLowerCase();

  // Acknowledgment patterns
  const acknowledgmentPatterns = [
    /you('re| are) right/i,
    /that's true/i,
    /i (hadn't|haven't) (thought|noticed)/i,
    /good point/i,
    /yeah,? (i|you)/i,
    /true/i,
    /exactly/i,
    /i (do|did) (say|mention|promise)/i,
  ];

  // Dismissal patterns
  const dismissalPatterns = [
    /anyway/i,
    /let's talk about/i,
    /never ?mind/i,
    /whatever/i,
    /it's fine/i,
    /don't worry about/i,
    /can we/i,
    /change the subject/i,
  ];

  // Engagement patterns (deeper exploration)
  const engagementPatterns = [
    /tell me more/i,
    /what do you (mean|think)/i,
    /why do you (say|think)/i,
    /i('ve| have) been (thinking|wondering)/i,
    /that reminds me/i,
    /speaking of/i,
    /actually,? (yes|yeah)/i,
    /you know what/i,
  ];

  const acknowledged =
    acknowledgmentPatterns.some((p) => p.test(lowerMessage)) || sentiment === 'positive';
  const dismissed = dismissalPatterns.some((p) => p.test(lowerMessage));
  const engaged = engagementPatterns.some((p) => p.test(lowerMessage));

  return { acknowledged, dismissed, engaged };
}

// ============================================================================
// BUFFER MANAGEMENT
// ============================================================================

/**
 * Flush event buffer to storage.
 */
async function flushEventBuffer(): Promise<void> {
  if (eventBuffer.length === 0) {
    return;
  }

  const eventsToFlush = [...eventBuffer];
  eventBuffer.length = 0;

  try {
    // Import Firestore lazily to avoid circular deps
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.warn('Firestore not available, BTH events not persisted');
      return;
    }

    // Batch write
    const batch = db.batch();
    for (const event of eventsToFlush) {
      const ref = db.collection('bth_production_events').doc(event.eventId);
      batch.set(ref, {
        ...event,
        timestamp: event.timestamp.toISOString(),
      });
    }

    await batch.commit();

    log.info({ eventCount: eventsToFlush.length }, 'BTH events flushed to Firestore');
  } catch (error) {
    log.error(
      { error: String(error), eventCount: eventsToFlush.length },
      'Failed to flush BTH events'
    );

    // Put events back in buffer (with limit to prevent memory issues)
    if (eventBuffer.length < 500) {
      eventBuffer.push(...eventsToFlush);
    }
  }
}

// ============================================================================
// TELEMETRY AGGREGATION
// ============================================================================

/**
 * Get aggregated telemetry for a capability over a time period.
 */
export async function getCapabilityTelemetry(
  capability: string,
  periodDays: number = 7
): Promise<CapabilityTelemetry | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return null;
    }

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    const snapshot = await db
      .collection('bth_production_events')
      .where('capability', '==', capability)
      .where('timestamp', '>=', periodStart.toISOString())
      .get();

    if (snapshot.empty) {
      return null;
    }

    const events = snapshot.docs.map((doc) => doc.data() as BTHProductionEvent);

    // Calculate metrics
    const uniqueUsers = new Set(events.map((e) => e.userId)).size;
    const uniqueSessions = new Set(events.map((e) => e.sessionId)).size;

    const withResponse = events.filter((e) => e.userResponse);
    const acknowledged = withResponse.filter((e) => e.userResponse?.acknowledged).length;
    const dismissed = withResponse.filter((e) => e.userResponse?.dismissed).length;
    const engaged = withResponse.filter((e) => e.userResponse?.engaged).length;

    const confidences = events.map((e) => e.trigger.confidence).sort((a, b) => a - b);
    const p25Index = Math.floor(confidences.length * 0.25);
    const p75Index = Math.floor(confidences.length * 0.75);

    return {
      capability,
      periodStart,
      periodEnd: new Date(),
      totalTriggers: events.length,
      uniqueUsers,
      uniqueSessions,
      acknowledged,
      dismissed,
      engaged,
      acknowledgmentRate: withResponse.length > 0 ? acknowledged / withResponse.length : 0,
      dismissalRate: withResponse.length > 0 ? dismissed / withResponse.length : 0,
      engagementRate: withResponse.length > 0 ? engaged / withResponse.length : 0,
      averageConfidence:
        confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      confidenceP25: confidences[p25Index] ?? 0,
      confidenceP75: confidences[p75Index] ?? 0,
    };
  } catch (error) {
    log.error({ error: String(error), capability }, 'Failed to get capability telemetry');
    return null;
  }
}

/**
 * Get telemetry for all enabled capabilities.
 */
export async function getAllCapabilityTelemetry(
  periodDays: number = 7
): Promise<CapabilityTelemetry[]> {
  const results: CapabilityTelemetry[] = [];

  for (const capability of config.enabledCapabilities) {
    const telemetry = await getCapabilityTelemetry(capability, periodDays);
    if (telemetry) {
      results.push(telemetry);
    }
  }

  return results;
}

// ============================================================================
// QUICK STATS (IN-MEMORY)
// ============================================================================

/**
 * Get quick stats from in-memory buffer (for dashboards).
 */
export function getBufferStats(): {
  bufferedEvents: number;
  capabilityBreakdown: Record<string, number>;
  recentTriggers: number;
} {
  const capabilityBreakdown: Record<string, number> = {};

  for (const event of eventBuffer) {
    capabilityBreakdown[event.capability] = (capabilityBreakdown[event.capability] || 0) + 1;
  }

  // Count triggers in last 5 minutes
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const recentTriggers = eventBuffer.filter((e) => e.timestamp.getTime() > fiveMinutesAgo).length;

  return {
    bufferedEvents: eventBuffer.length,
    capabilityBreakdown,
    recentTriggers,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up session tracking data for ended sessions.
 */
export function cleanupSessionTracking(sessionId: string): void {
  sessionCapabilityTriggers.delete(sessionId);
}

/**
 * Clean up old session tracking data (call periodically).
 */
export function cleanupStaleSessionTracking(maxAgeMs: number = 3600000): void {
  const cutoff = Date.now() - maxAgeMs;

  for (const [sessionId, triggers] of sessionCapabilityTriggers.entries()) {
    // Remove stale triggers
    const activeTriggers = triggers.filter((t) => t.triggeredAt > cutoff);

    if (activeTriggers.length === 0) {
      sessionCapabilityTriggers.delete(sessionId);
    } else {
      sessionCapabilityTriggers.set(sessionId, activeTriggers);
    }
  }
}
