/**
 * Life Coaching Domain Analytics
 *
 * Tracks life coaching-specific metrics for:
 * - Domain effectiveness (which domains help most)
 * - User journey patterns (boundaries → social-skills → dating)
 * - Emotional state improvements
 * - Safety interventions
 * - Cross-persona coordination
 *
 * INTEGRATES WITH: src/services/analytics/tool-usage-analytics.ts
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { EmotionalState, FourTendency } from './types.js';

const log = createLogger({ module: 'LifeCoachingAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

export interface LifeCoachingEvent {
  eventType:
    | 'domain_entry' // User enters a life coaching domain
    | 'domain_completion' // User completes a domain flow
    | 'safety_triggered' // Safety guard activated
    | 'cross_persona_handoff' // Handoff to another persona
    | 'emotional_shift' // User's emotional state changed
    | 'tendency_identified' // Four Tendencies identified
    | 'progress_milestone' // User hit a progress milestone
    | 'boundary_attempt' // User attempted to set boundary
    | 'tool_chain_complete'; // User completed a tool chain

  domain: string;
  toolId: string;
  userId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface LifeCoachingMetrics {
  domainUsage: Record<string, number>;
  emotionalShifts: {
    positive: number;
    negative: number;
    neutral: number;
  };
  safetyInterventions: number;
  tendencyDistribution: Record<FourTendency, number>;
  avgToolChainLength: number;
  crossPersonaHandoffs: number;
}

// ============================================================================
// IN-MEMORY STORE (with Firestore sync)
// ============================================================================

const eventStore: LifeCoachingEvent[] = [];
const MAX_STORE_SIZE = 5000;
const metricsCache: LifeCoachingMetrics = {
  domainUsage: {},
  emotionalShifts: { positive: 0, negative: 0, neutral: 0 },
  safetyInterventions: 0,
  tendencyDistribution: { upholder: 0, questioner: 0, obliger: 0, rebel: 0 },
  avgToolChainLength: 0,
  crossPersonaHandoffs: 0,
};

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Track when user enters a life coaching domain
 */
export function trackDomainEntry(
  domain: string,
  toolId: string,
  userId: string,
  metadata?: Record<string, unknown>
): void {
  const event: LifeCoachingEvent = {
    eventType: 'domain_entry',
    domain,
    toolId,
    userId,
    timestamp: new Date(),
    metadata,
  };

  storeEvent(event);
  metricsCache.domainUsage[domain] = (metricsCache.domainUsage[domain] || 0) + 1;

  log.debug({ domain, toolId, userId }, 'Life coaching domain entry');
}

/**
 * Track safety intervention
 */
export function trackSafetyIntervention(
  domain: string,
  toolId: string,
  userId: string,
  safetyLevel: 'crisis' | 'urgent' | 'concerning',
  metadata?: Record<string, unknown>
): void {
  const event: LifeCoachingEvent = {
    eventType: 'safety_triggered',
    domain,
    toolId,
    userId,
    timestamp: new Date(),
    metadata: { safetyLevel, ...metadata },
  };

  storeEvent(event);
  metricsCache.safetyInterventions++;

  log.info({ domain, toolId, safetyLevel, userId }, 'Safety intervention triggered');
}

/**
 * Track emotional state shift
 */
export function trackEmotionalShift(
  userId: string,
  fromState: EmotionalState | undefined,
  toState: EmotionalState,
  domain: string,
  toolId: string
): void {
  const positiveStates: EmotionalState[] = ['calm', 'hopeful'];
  const negativeStates: EmotionalState[] = ['anxious', 'sad', 'angry', 'overwhelmed', 'distressed'];

  let shiftDirection: 'positive' | 'negative' | 'neutral' = 'neutral';

  if (fromState) {
    const wasNegative = negativeStates.includes(fromState);
    const isNowPositive = positiveStates.includes(toState);
    const isNowNegative = negativeStates.includes(toState);

    if (wasNegative && isNowPositive) {
      shiftDirection = 'positive';
    } else if (!wasNegative && isNowNegative) {
      shiftDirection = 'negative';
    }
  }

  const event: LifeCoachingEvent = {
    eventType: 'emotional_shift',
    domain,
    toolId,
    userId,
    timestamp: new Date(),
    metadata: { fromState, toState, shiftDirection },
  };

  storeEvent(event);
  metricsCache.emotionalShifts[shiftDirection]++;

  log.debug({ userId, fromState, toState, shiftDirection }, 'Emotional shift tracked');
}

/**
 * Track Four Tendencies identification
 */
export function trackTendencyIdentified(
  userId: string,
  tendency: FourTendency,
  confidence: number,
  domain: string
): void {
  const event: LifeCoachingEvent = {
    eventType: 'tendency_identified',
    domain,
    toolId: 'tendency_detection',
    userId,
    timestamp: new Date(),
    metadata: { tendency, confidence },
  };

  storeEvent(event);
  metricsCache.tendencyDistribution[tendency]++;

  log.debug({ userId, tendency, confidence }, 'Four Tendencies identified');
}

/**
 * Track cross-persona handoff
 */
export function trackCrossPersonaHandoff(
  userId: string,
  fromDomain: string,
  toPersona: string,
  reason: string
): void {
  const event: LifeCoachingEvent = {
    eventType: 'cross_persona_handoff',
    domain: fromDomain,
    toolId: 'handoff',
    userId,
    timestamp: new Date(),
    metadata: { toPersona, reason },
  };

  storeEvent(event);
  metricsCache.crossPersonaHandoffs++;

  log.debug({ userId, fromDomain, toPersona, reason }, 'Cross-persona handoff');
}

/**
 * Track boundary attempt
 */
export function trackBoundaryAttempt(
  userId: string,
  boundaryType: string,
  personType: string,
  outcome: 'maintained' | 'partial' | 'abandoned' | 'in_progress'
): void {
  const event: LifeCoachingEvent = {
    eventType: 'boundary_attempt',
    domain: 'boundaries',
    toolId: 'setBoundary',
    userId,
    timestamp: new Date(),
    metadata: { boundaryType, personType, outcome },
  };

  storeEvent(event);
  log.debug({ userId, boundaryType, personType, outcome }, 'Boundary attempt tracked');
}

/**
 * Track progress milestone
 */
export function trackProgressMilestone(
  userId: string,
  domain: string,
  milestone: string,
  value: number
): void {
  const event: LifeCoachingEvent = {
    eventType: 'progress_milestone',
    domain,
    toolId: 'milestone',
    userId,
    timestamp: new Date(),
    metadata: { milestone, value },
  };

  storeEvent(event);
  log.info({ userId, domain, milestone, value }, 'Progress milestone achieved');
}

// ============================================================================
// METRICS ACCESS
// ============================================================================

/**
 * Get current metrics snapshot
 */
export function getLifeCoachingMetrics(): LifeCoachingMetrics {
  return { ...metricsCache };
}

/**
 * Get domain-specific usage stats
 */
export function getDomainUsageStats(domain: string): {
  totalEntries: number;
  safetyInterventions: number;
  emotionalImpact: { positive: number; negative: number };
} {
  const domainEvents = eventStore.filter((e) => e.domain === domain);

  return {
    totalEntries: domainEvents.filter((e) => e.eventType === 'domain_entry').length,
    safetyInterventions: domainEvents.filter((e) => e.eventType === 'safety_triggered').length,
    emotionalImpact: {
      positive: domainEvents.filter(
        (e) => e.eventType === 'emotional_shift' && e.metadata?.shiftDirection === 'positive'
      ).length,
      negative: domainEvents.filter(
        (e) => e.eventType === 'emotional_shift' && e.metadata?.shiftDirection === 'negative'
      ).length,
    },
  };
}

/**
 * Get user journey through life coaching domains
 */
export function getUserDomainJourney(userId: string): string[] {
  return eventStore
    .filter((e) => e.userId === userId && e.eventType === 'domain_entry')
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((e) => e.domain);
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function storeEvent(event: LifeCoachingEvent): void {
  eventStore.push(event);

  // Trim if too large
  if (eventStore.length > MAX_STORE_SIZE) {
    eventStore.splice(0, eventStore.length - MAX_STORE_SIZE);
  }

  // TODO: Persist to Firestore asynchronously
}

// Types are already exported with their interface definitions above
