/**
 * Trust Systems Analytics
 *
 * Tracks usage and effectiveness of trust-building features.
 * Measures what actually works for building connection.
 *
 * Philosophy: We can't improve what we don't measure. But we measure
 * what matters - genuine connection, not just engagement metrics.
 *
 * @module TrustAnalytics
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const log = createLogger({ module: 'TrustAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface TrustEvent {
  id: string;
  userId: string;
  timestamp: Date;

  /** Which trust system generated this */
  system:
    | 'reading_between_lines'
    | 'boundary_memory'
    | 'growth_reflection'
    | 'inside_jokes'
    | 'small_wins'
    | 'thinking_of_you';

  /** What happened */
  eventType:
    | 'detected' // System detected something
    | 'surfaced' // Surfaced to LLM context
    | 'acted_on' // AI actually used it
    | 'user_response' // User responded to it
    | 'positive_outcome'; // Led to positive outcome

  /** Details about the event */
  details: Record<string, unknown>;

  /** Persona involved */
  personaId?: string;
}

export interface TrustMetrics {
  userId: string;
  period: 'day' | 'week' | 'month';
  startDate: Date;

  /** Detection counts */
  detections: Record<string, number>;

  /** Surface counts (how often we showed context to LLM) */
  surfaced: Record<string, number>;

  /** Action counts (how often AI used the context) */
  actedOn: Record<string, number>;

  /** Positive response counts */
  positiveResponses: Record<string, number>;

  /** Calculated effectiveness (actedOn / surfaced) */
  effectiveness: Record<string, number>;

  /** User engagement metrics */
  engagement: {
    returnRate: number;
    averageSessionLength: number;
    conversationDepth: number;
  };
}

export interface ABTestConfig {
  id: string;
  name: string;
  description: string;

  /** Which system is being tested */
  system: TrustEvent['system'];

  /** Control vs treatment split (0-1) */
  treatmentPercentage: number;

  /** What we're measuring */
  primaryMetric: string;

  /** Start/end dates */
  startDate: Date;
  endDate?: Date;

  /** Current results */
  results?: {
    controlCount: number;
    treatmentCount: number;
    controlMetric: number;
    treatmentMetric: number;
    pValue?: number;
    significant?: boolean;
  };
}

// ============================================================================
// IN-MEMORY TRACKING
// ============================================================================

const recentEvents: TrustEvent[] = [];
const MAX_RECENT_EVENTS = 1000;

const dailyMetrics = new Map<string, Record<string, number>>();
const userAssignments = new Map<string, Record<string, 'control' | 'treatment'>>();

// ============================================================================
// EVENT TRACKING
// ============================================================================

/**
 * Track a trust system event
 */
export function trackEvent(
  event: Omit<TrustEvent, 'id' | 'timestamp'>
): TrustEvent {
  const fullEvent: TrustEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date(),
  };

  recentEvents.push(fullEvent);

  // Keep bounded
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.shift();
  }

  // Update daily metrics
  const dateKey = new Date().toISOString().split('T')[0];
  const metricKey = `${event.system}_${event.eventType}`;
  const dayMetrics = dailyMetrics.get(dateKey) || {};
  dayMetrics[metricKey] = (dayMetrics[metricKey] || 0) + 1;
  dailyMetrics.set(dateKey, dayMetrics);

  // Fire and forget persistence
  void persistEvent(fullEvent).catch((e) =>
    log.debug({ error: e }, 'Event persistence failed')
  );

  return fullEvent;
}

/**
 * Persist event to Firestore
 */
async function persistEvent(event: TrustEvent): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection('trust_analytics').add({
      ...event,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch {
    // Swallow - analytics shouldn't break main flow
  }
}

// ============================================================================
// CONVENIENCE TRACKERS
// ============================================================================

/**
 * Track when a signal is detected
 */
export function trackDetection(
  userId: string,
  system: TrustEvent['system'],
  details: Record<string, unknown> = {}
): void {
  trackEvent({
    userId,
    system,
    eventType: 'detected',
    details,
  });
}

/**
 * Track when context is surfaced to LLM
 */
export function trackSurfaced(
  userId: string,
  system: TrustEvent['system'],
  personaId?: string,
  details: Record<string, unknown> = {}
): void {
  trackEvent({
    userId,
    system,
    eventType: 'surfaced',
    personaId,
    details,
  });
}

/**
 * Track when AI acts on the context
 */
export function trackActedOn(
  userId: string,
  system: TrustEvent['system'],
  personaId?: string,
  details: Record<string, unknown> = {}
): void {
  trackEvent({
    userId,
    system,
    eventType: 'acted_on',
    personaId,
    details,
  });
}

/**
 * Track user response to trust action
 */
export function trackUserResponse(
  userId: string,
  system: TrustEvent['system'],
  response: 'positive' | 'neutral' | 'negative',
  details: Record<string, unknown> = {}
): void {
  trackEvent({
    userId,
    system,
    eventType: 'user_response',
    details: { ...details, response },
  });

  if (response === 'positive') {
    trackEvent({
      userId,
      system,
      eventType: 'positive_outcome',
      details,
    });
  }
}

// ============================================================================
// METRICS CALCULATION
// ============================================================================

/**
 * Calculate metrics for a user over a period
 */
export function calculateUserMetrics(
  userId: string,
  startDate: Date,
  endDate: Date = new Date()
): Partial<TrustMetrics> {
  const userEvents = recentEvents.filter(
    (e) =>
      e.userId === userId &&
      e.timestamp >= startDate &&
      e.timestamp <= endDate
  );

  const detections: Record<string, number> = {};
  const surfaced: Record<string, number> = {};
  const actedOn: Record<string, number> = {};
  const positiveResponses: Record<string, number> = {};

  for (const event of userEvents) {
    switch (event.eventType) {
      case 'detected':
        detections[event.system] = (detections[event.system] || 0) + 1;
        break;
      case 'surfaced':
        surfaced[event.system] = (surfaced[event.system] || 0) + 1;
        break;
      case 'acted_on':
        actedOn[event.system] = (actedOn[event.system] || 0) + 1;
        break;
      case 'positive_outcome':
        positiveResponses[event.system] =
          (positiveResponses[event.system] || 0) + 1;
        break;
    }
  }

  // Calculate effectiveness
  const effectiveness: Record<string, number> = {};
  for (const system of Object.keys(surfaced)) {
    const surf = surfaced[system] || 0;
    const acted = actedOn[system] || 0;
    effectiveness[system] = surf > 0 ? acted / surf : 0;
  }

  return {
    userId,
    period: 'day',
    startDate,
    detections,
    surfaced,
    actedOn,
    positiveResponses,
    effectiveness,
  };
}

/**
 * Get aggregate metrics across all users
 */
export function getAggregateMetrics(
  startDate: Date,
  endDate: Date = new Date()
): {
  totalEvents: number;
  bySystem: Record<string, Record<string, number>>;
  topPerformers: Array<{ system: string; effectiveness: number }>;
} {
  const events = recentEvents.filter(
    (e) => e.timestamp >= startDate && e.timestamp <= endDate
  );

  const bySystem: Record<string, Record<string, number>> = {};

  for (const event of events) {
    if (!bySystem[event.system]) {
      bySystem[event.system] = {};
    }
    bySystem[event.system][event.eventType] =
      (bySystem[event.system][event.eventType] || 0) + 1;
  }

  // Calculate effectiveness per system
  const topPerformers: Array<{ system: string; effectiveness: number }> = [];
  for (const [system, counts] of Object.entries(bySystem)) {
    const surf = counts.surfaced || 0;
    const positive = counts.positive_outcome || 0;
    const effectiveness = surf > 0 ? positive / surf : 0;
    topPerformers.push({ system, effectiveness });
  }

  topPerformers.sort((a, b) => b.effectiveness - a.effectiveness);

  return {
    totalEvents: events.length,
    bySystem,
    topPerformers,
  };
}

// ============================================================================
// A/B TESTING
// ============================================================================

const activeTests = new Map<string, ABTestConfig>();

/**
 * Create an A/B test
 */
export function createABTest(config: Omit<ABTestConfig, 'results'>): void {
  activeTests.set(config.id, config as ABTestConfig);
  log.info({ testId: config.id, name: config.name }, '🧪 A/B test created');
}

/**
 * Get user's test assignment
 */
export function getTestAssignment(
  userId: string,
  testId: string
): 'control' | 'treatment' | null {
  const test = activeTests.get(testId);
  if (!test || (test.endDate && test.endDate < new Date())) {
    return null;
  }

  // Check existing assignment
  const userTests = userAssignments.get(userId) || {};
  if (userTests[testId]) {
    return userTests[testId];
  }

  // Assign deterministically based on userId hash
  const hash = simpleHash(userId + testId);
  const assignment =
    hash % 100 < test.treatmentPercentage * 100 ? 'treatment' : 'control';

  userTests[testId] = assignment;
  userAssignments.set(userId, userTests);

  return assignment;
}

/**
 * Check if feature is enabled for user (for A/B tests)
 */
export function isFeatureEnabled(
  userId: string,
  testId: string
): boolean {
  const assignment = getTestAssignment(userId, testId);
  return assignment === 'treatment';
}

/**
 * Simple hash function for deterministic assignment
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ============================================================================
// REPORTING
// ============================================================================

/**
 * Get daily summary for a date
 */
export function getDailySummary(date: Date): Record<string, number> {
  const dateKey = date.toISOString().split('T')[0];
  return dailyMetrics.get(dateKey) || {};
}

/**
 * Get trust system health check
 */
export function getHealthCheck(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  systems: Record<string, { active: boolean; lastEvent?: Date }>;
  recentEventCount: number;
} {
  const systems: Record<string, { active: boolean; lastEvent?: Date }> = {};
  const systemNames: TrustEvent['system'][] = [
    'reading_between_lines',
    'boundary_memory',
    'growth_reflection',
    'inside_jokes',
    'small_wins',
    'thinking_of_you',
  ];

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  for (const system of systemNames) {
    const lastEvent = recentEvents
      .filter((e) => e.system === system)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

    systems[system] = {
      active: lastEvent ? lastEvent.timestamp > oneHourAgo : false,
      lastEvent: lastEvent?.timestamp,
    };
  }

  const activeCount = Object.values(systems).filter((s) => s.active).length;
  const status =
    activeCount === systemNames.length
      ? 'healthy'
      : activeCount >= systemNames.length / 2
        ? 'degraded'
        : 'unhealthy';

  return {
    status,
    systems,
    recentEventCount: recentEvents.length,
  };
}

/**
 * Export analytics data for external analysis
 */
export function exportAnalytics(
  startDate: Date,
  endDate: Date = new Date()
): {
  events: TrustEvent[];
  metrics: ReturnType<typeof getAggregateMetrics>;
  health: ReturnType<typeof getHealthCheck>;
} {
  const events = recentEvents.filter(
    (e) => e.timestamp >= startDate && e.timestamp <= endDate
  );

  return {
    events,
    metrics: getAggregateMetrics(startDate, endDate),
    health: getHealthCheck(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  trackEvent,
  trackDetection,
  trackSurfaced,
  trackActedOn,
  trackUserResponse,
  calculateUserMetrics,
  getAggregateMetrics,
  createABTest,
  getTestAssignment,
  isFeatureEnabled,
  getDailySummary,
  getHealthCheck,
  exportAnalytics,
};

