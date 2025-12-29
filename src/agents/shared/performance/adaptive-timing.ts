/**
 * Adaptive Timing System
 *
 * "Better than Human" response latency through dynamic timing adjustments.
 *
 * Instead of hardcoded timeouts, this system:
 * 1. Measures actual processing latency per session
 * 2. Adapts filler timing based on real performance
 * 3. Targets sub-second response times when possible
 * 4. Falls back gracefully under load
 *
 * @module agents/shared/performance/adaptive-timing
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'AdaptiveTiming' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Target latencies for "Better than Human" performance
 * Research shows human turn-taking gaps are 200-500ms
 *
 * UPDATED Dec 2024: Lowered thresholds for more conversational feel
 */
export const LATENCY_TARGETS = {
  /** Ideal response time - feels instant */
  INSTANT: 400, // Was 500 - aim higher

  /** Good response time - feels natural */
  NATURAL: 800, // Was 1000 - tighter target

  /** Acceptable response time - user notices but tolerates */
  ACCEPTABLE: 1500, // Was 2000 - lower tolerance

  /** Slow response time - needs filler */
  NEEDS_FILLER: 1800, // Was 2500 - inject filler earlier

  /** Hard limit before giving up on rich context */
  HARD_LIMIT: 4000, // Was 6000 - fail even faster for Better than Human latency
} as const;

/**
 * Filler injection strategy
 *
 * UPDATED Dec 2024: More aggressive filler for conversational feel
 * UPDATED Dec 25 2024: Further lowered thresholds for "Better than Human"
 * UPDATED Dec 29 2024: Even more aggressive - 600ms feels like human pausing to think
 * Research: Human turn-taking gaps are 200-500ms, anything >1s feels slow
 */
export const FILLER_STRATEGY = {
  /** Never inject filler below this latency */
  MIN_LATENCY_FOR_FILLER: 600, // Was 800 - inject filler earlier for conversational feel

  /** Always inject filler above this latency */
  GUARANTEED_FILLER_LATENCY: 1200, // Was 1500 - guarantee filler at 1.2s

  /** Buffer time to add to average latency for filler timing */
  FILLER_BUFFER_MS: 200, // Was 300 - tighter buffer for more responsive filler

  /** Minimum time between fillers */
  FILLER_COOLDOWN_MS: 5000, // Was 6000 - allow more frequent filler when needed
} as const;

// ============================================================================
// SESSION LATENCY TRACKING
// ============================================================================

interface SessionLatencyStats {
  /** Recent turn latencies (last 10 turns) */
  recentLatencies: number[];

  /** Rolling average latency */
  avgLatency: number;

  /** P95 latency */
  p95Latency: number;

  /** Last filler injection time */
  lastFillerTime: number;

  /** Total turns processed */
  turnCount: number;

  /** Session start time */
  startTime: number;
}

const sessionStats = new Map<string, SessionLatencyStats>();

/**
 * Get or create latency stats for a session
 */
function getSessionStats(sessionId: string): SessionLatencyStats {
  if (!sessionStats.has(sessionId)) {
    sessionStats.set(sessionId, {
      recentLatencies: [],
      avgLatency: 1500, // Start with conservative estimate
      p95Latency: 2500,
      lastFillerTime: 0,
      turnCount: 0,
      startTime: Date.now(),
    });
  }
  return sessionStats.get(sessionId)!;
}

/**
 * Record a turn's processing latency
 */
export function recordTurnLatency(sessionId: string, latencyMs: number): void {
  const stats = getSessionStats(sessionId);

  // Keep last 10 latencies for rolling stats
  stats.recentLatencies.push(latencyMs);
  if (stats.recentLatencies.length > 10) {
    stats.recentLatencies.shift();
  }

  // Update rolling average
  stats.avgLatency =
    stats.recentLatencies.reduce((a, b) => a + b, 0) / stats.recentLatencies.length;

  // Update P95 (simple approximation: max of recent)
  const sorted = [...stats.recentLatencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  stats.p95Latency = sorted[p95Index] || stats.avgLatency;

  stats.turnCount++;

  // Log performance periodically
  if (stats.turnCount % 5 === 0) {
    log.debug(
      {
        sessionId,
        avgLatency: Math.round(stats.avgLatency),
        p95Latency: Math.round(stats.p95Latency),
        turnCount: stats.turnCount,
      },
      'Session latency stats'
    );
  }
}

// ============================================================================
// ADAPTIVE TIMEOUT CALCULATION
// ============================================================================

export interface AdaptiveTimeouts {
  /** When to inject a thinking filler */
  fillerTimeoutMs: number;

  /** Hard timeout for turn processing */
  hardTimeoutMs: number;

  /** Whether this session is running fast */
  isPerformingWell: boolean;

  /** Recommended response strategy */
  strategy: 'instant' | 'natural' | 'with-filler' | 'fallback';
}

/**
 * Calculate adaptive timeouts based on session performance
 */
export function getAdaptiveTimeouts(sessionId: string): AdaptiveTimeouts {
  const stats = getSessionStats(sessionId);

  // Calculate filler timeout based on actual performance
  // Add buffer to average, but never below minimum
  const rawFillerTimeout = stats.avgLatency + FILLER_STRATEGY.FILLER_BUFFER_MS;
  const fillerTimeoutMs = Math.max(
    FILLER_STRATEGY.MIN_LATENCY_FOR_FILLER,
    Math.min(rawFillerTimeout, FILLER_STRATEGY.GUARANTEED_FILLER_LATENCY)
  );

  // Hard timeout based on P95 with headroom
  const hardTimeoutMs = Math.max(LATENCY_TARGETS.HARD_LIMIT, stats.p95Latency * 1.5);

  // Determine performance tier
  const isPerformingWell = stats.avgLatency < LATENCY_TARGETS.ACCEPTABLE;

  // Recommend strategy
  let strategy: AdaptiveTimeouts['strategy'];
  if (stats.avgLatency < LATENCY_TARGETS.INSTANT) {
    strategy = 'instant';
  } else if (stats.avgLatency < LATENCY_TARGETS.NATURAL) {
    strategy = 'natural';
  } else if (stats.avgLatency < LATENCY_TARGETS.NEEDS_FILLER) {
    strategy = 'with-filler';
  } else {
    strategy = 'fallback';
  }

  return {
    fillerTimeoutMs,
    hardTimeoutMs,
    isPerformingWell,
    strategy,
  };
}

/**
 * Check if a filler should be spoken now
 * Respects cooldown and performance context
 */
export function shouldInjectFiller(sessionId: string, elapsedMs: number): boolean {
  const stats = getSessionStats(sessionId);
  const timeouts = getAdaptiveTimeouts(sessionId);

  // Respect cooldown
  const timeSinceLastFiller = Date.now() - stats.lastFillerTime;
  if (timeSinceLastFiller < FILLER_STRATEGY.FILLER_COOLDOWN_MS) {
    return false;
  }

  // Don't filler on instant responses
  if (elapsedMs < FILLER_STRATEGY.MIN_LATENCY_FOR_FILLER) {
    return false;
  }

  // Always filler after guaranteed threshold
  if (elapsedMs >= FILLER_STRATEGY.GUARANTEED_FILLER_LATENCY) {
    return true;
  }

  // Filler based on adaptive timeout
  return elapsedMs >= timeouts.fillerTimeoutMs;
}

/**
 * Record that a filler was injected
 */
export function recordFillerInjection(sessionId: string): void {
  const stats = getSessionStats(sessionId);
  stats.lastFillerTime = Date.now();
}

// ============================================================================
// TURN PROFILING
// ============================================================================

interface TurnProfile {
  startTime: number;
  checkpoints: Map<string, number>;
}

const turnProfiles = new Map<string, TurnProfile>();

/**
 * Start profiling a turn
 */
export function startTurnProfile(sessionId: string, turnNumber: number): void {
  const key = `${sessionId}:${turnNumber}`;
  turnProfiles.set(key, {
    startTime: Date.now(),
    checkpoints: new Map(),
  });
}

/**
 * Record a checkpoint during turn processing
 */
export function markTurnCheckpoint(
  sessionId: string,
  turnNumber: number,
  checkpoint: string
): void {
  const key = `${sessionId}:${turnNumber}`;
  const profile = turnProfiles.get(key);
  if (profile) {
    profile.checkpoints.set(checkpoint, Date.now() - profile.startTime);
  }
}

/**
 * Complete turn profiling and record latency
 */
export function completeTurnProfile(
  sessionId: string,
  turnNumber: number
): { totalMs: number; checkpoints: Record<string, number> } | null {
  const key = `${sessionId}:${turnNumber}`;
  const profile = turnProfiles.get(key);

  if (!profile) {
    return null;
  }

  const totalMs = Date.now() - profile.startTime;

  // Record for adaptive timing
  recordTurnLatency(sessionId, totalMs);

  // Build checkpoint report
  const checkpoints: Record<string, number> = {};
  profile.checkpoints.forEach((time, name) => {
    checkpoints[name] = time;
  });

  // Clean up
  turnProfiles.delete(key);

  // Log slow turns
  if (totalMs > LATENCY_TARGETS.ACCEPTABLE) {
    log.warn(
      {
        sessionId,
        turnNumber,
        totalMs,
        checkpoints,
      },
      'Slow turn detected'
    );
  }

  return { totalMs, checkpoints };
}

// ============================================================================
// SESSION CLEANUP
// ============================================================================

/**
 * Clean up session stats
 */
export function cleanupSessionTiming(sessionId: string): void {
  sessionStats.delete(sessionId);

  // Clean up any orphaned turn profiles
  for (const key of turnProfiles.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      turnProfiles.delete(key);
    }
  }
}

/**
 * Get session performance summary
 */
export function getSessionPerformanceSummary(sessionId: string): {
  avgLatencyMs: number;
  p95LatencyMs: number;
  turnCount: number;
  strategy: string;
  sessionDurationMs: number;
} | null {
  const stats = sessionStats.get(sessionId);
  if (!stats) {
    return null;
  }

  const timeouts = getAdaptiveTimeouts(sessionId);

  return {
    avgLatencyMs: Math.round(stats.avgLatency),
    p95LatencyMs: Math.round(stats.p95Latency),
    turnCount: stats.turnCount,
    strategy: timeouts.strategy,
    sessionDurationMs: Date.now() - stats.startTime,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  LATENCY_TARGETS,
  FILLER_STRATEGY,
  recordTurnLatency,
  getAdaptiveTimeouts,
  shouldInjectFiller,
  recordFillerInjection,
  startTurnProfile,
  markTurnCheckpoint,
  completeTurnProfile,
  cleanupSessionTiming,
  getSessionPerformanceSummary,
};
