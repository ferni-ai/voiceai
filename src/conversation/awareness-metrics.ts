/**
 * Awareness System Observability Metrics
 *
 * Tracks performance and usage of the awareness components:
 * - Momentum tracking (state transitions, velocity)
 * - Thinking time (pauses, speech rate adjustments)
 * - Tangent decisions (triggers, acceptance rate)
 * - Self-awareness (landing rate, miss detection)
 *
 * Use these metrics to:
 * - Debug conversation flow issues
 * - Tune awareness sensitivity per persona
 * - Understand what makes conversations feel natural
 *
 * @module conversation/awareness-metrics
 */

import { createLogger } from '../utils/safe-logger.js';
import type { MomentumState, ConversationPhase } from './momentum-tracker.js';

const log = createLogger({ module: 'awareness-metrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface MomentumMetrics {
  /** Session ID */
  sessionId: string;
  /** Persona ID */
  personaId: string;
  /** State transitions recorded */
  stateTransitions: Array<{
    from: MomentumState;
    to: MomentumState;
    turn: number;
    timestamp: Date;
  }>;
  /** Time spent in each state (turns) */
  stateDistribution: Record<MomentumState, number>;
  /** Peak moments detected */
  peaksDetected: number;
  /** Stalls detected */
  stallsDetected: number;
  /** Average velocity */
  avgVelocity: number;
  /** Topic depth reached */
  maxTopicDepth: number;
}

export interface ThinkingTimeMetrics {
  /** Total thinking calculations */
  totalCalculations: number;
  /** Average opening pause (ms) */
  avgOpeningPauseMs: number;
  /** Average speech rate multiplier */
  avgSpeechRate: number;
  /** Thinking sounds used */
  thinkingSoundsUsed: Record<string, number>;
  /** Mid-pauses injected */
  midPausesInjected: number;
  /** Slow speech rate triggers */
  slowSpeechTriggers: number;
}

export interface TangentMetrics {
  /** Total tangent decisions */
  totalDecisions: number;
  /** Tangents suggested */
  tangentsSuggested: number;
  /** Tangents taken (would be tracked if we had feedback) */
  tangentsTaken: number;
  /** Tangents by theme */
  tangentsByTheme: Record<string, number>;
  /** Cooldown blocks */
  cooldownBlocks: number;
  /** Momentum blocks (wrong state) */
  momentumBlocks: number;
  /** Relationship depth blocks */
  relationshipBlocks: number;
}

export interface SelfAwarenessMetrics {
  /** Total assessments */
  totalAssessments: number;
  /** Landing rate (responses that landed) */
  landingRate: number;
  /** Miss count */
  missCount: number;
  /** Consecutive misses (max) */
  maxConsecutiveMisses: number;
  /** Response types used */
  responseTypeDistribution: Record<string, number>;
  /** Self-aware prompts generated */
  selfAwarePromptsGenerated: number;
}

export interface AwarenessSessionMetrics {
  sessionId: string;
  personaId: string;
  startTime: Date;
  turnCount: number;
  momentum: MomentumMetrics;
  thinkingTime: ThinkingTimeMetrics;
  tangents: TangentMetrics;
  selfAwareness: SelfAwarenessMetrics;
}

// ============================================================================
// METRICS STORAGE
// ============================================================================

const sessionMetrics = new Map<string, AwarenessSessionMetrics>();
const MAX_SESSIONS = 50;

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeMetrics(sessionId: string, personaId: string): AwarenessSessionMetrics {
  return {
    sessionId,
    personaId,
    startTime: new Date(),
    turnCount: 0,
    momentum: {
      sessionId,
      personaId,
      stateTransitions: [],
      stateDistribution: {
        building: 0,
        cruising: 0,
        peaking: 0,
        winding_down: 0,
        stalled: 0,
        intimate: 0,
      },
      peaksDetected: 0,
      stallsDetected: 0,
      avgVelocity: 0,
      maxTopicDepth: 0,
    },
    thinkingTime: {
      totalCalculations: 0,
      avgOpeningPauseMs: 0,
      avgSpeechRate: 1.0,
      thinkingSoundsUsed: {},
      midPausesInjected: 0,
      slowSpeechTriggers: 0,
    },
    tangents: {
      totalDecisions: 0,
      tangentsSuggested: 0,
      tangentsTaken: 0,
      tangentsByTheme: {},
      cooldownBlocks: 0,
      momentumBlocks: 0,
      relationshipBlocks: 0,
    },
    selfAwareness: {
      totalAssessments: 0,
      landingRate: 0,
      missCount: 0,
      maxConsecutiveMisses: 0,
      responseTypeDistribution: {},
      selfAwarePromptsGenerated: 0,
    },
  };
}

function getOrCreateMetrics(sessionId: string, personaId: string): AwarenessSessionMetrics {
  let metrics = sessionMetrics.get(sessionId);
  if (!metrics) {
    metrics = initializeMetrics(sessionId, personaId);
    sessionMetrics.set(sessionId, metrics);

    // Cleanup old sessions
    if (sessionMetrics.size > MAX_SESSIONS) {
      const oldest = Array.from(sessionMetrics.entries()).sort(
        (a, b) => a[1].startTime.getTime() - b[1].startTime.getTime()
      )[0];
      if (oldest) {
        sessionMetrics.delete(oldest[0]);
      }
    }
  }
  return metrics;
}

// ============================================================================
// MOMENTUM TRACKING
// ============================================================================

/**
 * Record a momentum state transition
 */
export function recordMomentumTransition(
  sessionId: string,
  personaId: string,
  from: MomentumState,
  to: MomentumState,
  turn: number
): void {
  const metrics = getOrCreateMetrics(sessionId, personaId);

  metrics.momentum.stateTransitions.push({
    from,
    to,
    turn,
    timestamp: new Date(),
  });

  // Update state distribution
  metrics.momentum.stateDistribution[to]++;

  // Track peaks and stalls
  if (to === 'peaking') {
    metrics.momentum.peaksDetected++;
  } else if (to === 'stalled') {
    metrics.momentum.stallsDetected++;
  }

  log.debug(
    { sessionId, from, to, turn, peaks: metrics.momentum.peaksDetected },
    'Momentum transition recorded'
  );
}

/**
 * Record momentum velocity
 */
export function recordMomentumVelocity(
  sessionId: string,
  personaId: string,
  velocity: number,
  topicDepth: number
): void {
  const metrics = getOrCreateMetrics(sessionId, personaId);

  // Running average
  const count = metrics.turnCount + 1;
  metrics.momentum.avgVelocity =
    (metrics.momentum.avgVelocity * metrics.turnCount + velocity) / count;

  // Track max topic depth
  if (topicDepth > metrics.momentum.maxTopicDepth) {
    metrics.momentum.maxTopicDepth = topicDepth;
  }

  metrics.turnCount = count;
}

// ============================================================================
// THINKING TIME TRACKING
// ============================================================================

/**
 * Record thinking time calculation
 */
export function recordThinkingTime(
  sessionId: string,
  personaId: string,
  openingPauseMs: number,
  speechRate: number,
  thinkingSound: string | undefined,
  midPausesCount: number
): void {
  const metrics = getOrCreateMetrics(sessionId, personaId);
  const tt = metrics.thinkingTime;

  // Running averages
  const count = tt.totalCalculations + 1;
  tt.avgOpeningPauseMs = (tt.avgOpeningPauseMs * tt.totalCalculations + openingPauseMs) / count;
  tt.avgSpeechRate = (tt.avgSpeechRate * tt.totalCalculations + speechRate) / count;

  tt.totalCalculations = count;
  tt.midPausesInjected += midPausesCount;

  if (speechRate < 0.95) {
    tt.slowSpeechTriggers++;
  }

  if (thinkingSound) {
    tt.thinkingSoundsUsed[thinkingSound] = (tt.thinkingSoundsUsed[thinkingSound] || 0) + 1;
  }

  log.debug({ sessionId, openingPauseMs, speechRate, thinkingSound }, 'Thinking time recorded');
}

// ============================================================================
// TANGENT TRACKING
// ============================================================================

/**
 * Record tangent decision
 */
export function recordTangentDecision(
  sessionId: string,
  personaId: string,
  shouldTangent: boolean,
  theme: string | undefined,
  blockReason: 'cooldown' | 'momentum' | 'relationship' | 'none'
): void {
  const metrics = getOrCreateMetrics(sessionId, personaId);
  const tg = metrics.tangents;

  tg.totalDecisions++;

  if (shouldTangent && theme) {
    tg.tangentsSuggested++;
    tg.tangentsByTheme[theme] = (tg.tangentsByTheme[theme] || 0) + 1;
  }

  switch (blockReason) {
    case 'cooldown':
      tg.cooldownBlocks++;
      break;
    case 'momentum':
      tg.momentumBlocks++;
      break;
    case 'relationship':
      tg.relationshipBlocks++;
      break;
  }

  log.debug({ sessionId, shouldTangent, theme, blockReason }, 'Tangent decision recorded');
}

// ============================================================================
// SELF-AWARENESS TRACKING
// ============================================================================

/**
 * Record self-awareness assessment
 */
export function recordSelfAwarenessAssessment(
  sessionId: string,
  personaId: string,
  result: 'landed' | 'partial' | 'missed' | 'unknown',
  responseType: string,
  consecutiveMisses: number
): void {
  const metrics = getOrCreateMetrics(sessionId, personaId);
  const sa = metrics.selfAwareness;

  sa.totalAssessments++;

  // Update landing rate
  const landed = result === 'landed' ? 1 : 0;
  sa.landingRate = (sa.landingRate * (sa.totalAssessments - 1) + landed) / sa.totalAssessments;

  if (result === 'missed') {
    sa.missCount++;
  }

  if (consecutiveMisses > sa.maxConsecutiveMisses) {
    sa.maxConsecutiveMisses = consecutiveMisses;
  }

  // Track response types
  sa.responseTypeDistribution[responseType] = (sa.responseTypeDistribution[responseType] || 0) + 1;

  log.debug(
    { sessionId, result, responseType, landingRate: sa.landingRate.toFixed(2) },
    'Self-awareness assessment recorded'
  );
}

/**
 * Record self-aware prompt generation
 */
export function recordSelfAwarePrompt(sessionId: string, personaId: string): void {
  const metrics = getOrCreateMetrics(sessionId, personaId);
  metrics.selfAwareness.selfAwarePromptsGenerated++;
}

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Get metrics for a session
 */
export function getAwarenessMetrics(sessionId: string): AwarenessSessionMetrics | undefined {
  return sessionMetrics.get(sessionId);
}

/**
 * Get summary across all sessions
 */
export function getAwarenessSummary(): {
  totalSessions: number;
  avgLandingRate: number;
  avgPeaksPerSession: number;
  avgStallsPerSession: number;
  mostCommonTangentThemes: Array<{ theme: string; count: number }>;
  avgOpeningPauseMs: number;
  mostUsedThinkingSounds: Array<{ sound: string; count: number }>;
} {
  const sessions = Array.from(sessionMetrics.values());

  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      avgLandingRate: 0,
      avgPeaksPerSession: 0,
      avgStallsPerSession: 0,
      mostCommonTangentThemes: [],
      avgOpeningPauseMs: 0,
      mostUsedThinkingSounds: [],
    };
  }

  // Aggregate metrics
  const totalLanding = sessions.reduce((sum, s) => sum + s.selfAwareness.landingRate, 0);
  const totalPeaks = sessions.reduce((sum, s) => sum + s.momentum.peaksDetected, 0);
  const totalStalls = sessions.reduce((sum, s) => sum + s.momentum.stallsDetected, 0);
  const totalOpeningPause = sessions.reduce((sum, s) => sum + s.thinkingTime.avgOpeningPauseMs, 0);

  // Aggregate tangent themes
  const themeAggregation: Record<string, number> = {};
  for (const session of sessions) {
    for (const [theme, count] of Object.entries(session.tangents.tangentsByTheme)) {
      themeAggregation[theme] = (themeAggregation[theme] || 0) + count;
    }
  }
  const mostCommonTangentThemes = Object.entries(themeAggregation)
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Aggregate thinking sounds
  const soundAggregation: Record<string, number> = {};
  for (const session of sessions) {
    for (const [sound, count] of Object.entries(session.thinkingTime.thinkingSoundsUsed)) {
      soundAggregation[sound] = (soundAggregation[sound] || 0) + count;
    }
  }
  const mostUsedThinkingSounds = Object.entries(soundAggregation)
    .map(([sound, count]) => ({ sound, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalSessions: sessions.length,
    avgLandingRate: totalLanding / sessions.length,
    avgPeaksPerSession: totalPeaks / sessions.length,
    avgStallsPerSession: totalStalls / sessions.length,
    mostCommonTangentThemes,
    avgOpeningPauseMs: totalOpeningPause / sessions.length,
    mostUsedThinkingSounds,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Reset metrics for a session
 */
export function resetAwarenessMetrics(sessionId: string): void {
  sessionMetrics.delete(sessionId);
}

/**
 * Reset all metrics
 */
export function resetAllAwarenessMetrics(): void {
  sessionMetrics.clear();
}

