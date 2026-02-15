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

import type { VoiceEmotionResult } from '../../../speech/audio-prosody.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { analyzeEndpoint, type VoiceFeatures } from '../vad-semantic-endpointer.js';
import { getEmotionAdjustedTiming } from './emotion-adaptive-timing.js';
import { isOptimizationEnabled } from './latency-feature-flags.js';

const log = createLogger({ module: 'AdaptiveTiming' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Target latencies for "Better than Human" performance
 * Research shows human turn-taking gaps are 200-500ms
 *
 * UPDATED Dec 2024: Lowered thresholds for more conversational feel
 * UPDATED Jan 2026: Tightened for human-like conversation
 * UPDATED Jan 2026: SUPERHUMAN targets - faster than humans expect
 *
 * PHILOSOPHY: A human friend takes 200-400ms to start responding.
 * We aim for < 200ms to feel FASTER than human conversation.
 * This creates the "wow, they really get me" feeling.
 */
export const LATENCY_TARGETS = {
  /** Ideal response time - feels SUPERHUMAN */
  INSTANT: 150, // Was 250 - faster than human turn-taking!

  /** Good response time - feels instant to user */
  NATURAL: 350, // Was 500 - within fastest human range

  /** Acceptable response time - user barely notices */
  ACCEPTABLE: 600, // Was 800 - tighter threshold

  /** Slow response time - needs filler to maintain presence */
  NEEDS_FILLER: 800, // Was 1000 - inject filler earlier

  /** Hard limit before giving up on rich context */
  HARD_LIMIT: 2500, // Was 3000 - fail faster, apologize later
} as const;

/**
 * Filler injection strategy - "Better than Human" Presence
 *
 * PHILOSOPHY: Silence is the enemy. A quick "Hmm" or "Let me think..."
 * at 300ms shows PRESENCE. Users feel heard, even if processing takes longer.
 *
 * UPDATED Jan 2026: SUPERHUMAN presence strategy
 * - 300ms of silence = inject presence (human thinking pause)
 * - 500ms of silence = guaranteed filler (feels awkward otherwise)
 * - Tight cooldown allows staying present during complex processing
 */
export const FILLER_STRATEGY = {
  /** Never inject filler below this latency - response is fast enough */
  MIN_LATENCY_FOR_FILLER: 300, // Was 400 - show presence at 300ms

  /** Always inject filler above this latency - silence is awkward */
  GUARANTEED_FILLER_LATENCY: 500, // Was 700 - 500ms silence is too long

  /** Buffer time to add to average latency for filler timing */
  FILLER_BUFFER_MS: 75, // Was 100 - tighter buffer

  /** Minimum time between fillers - allow presence during complex tasks */
  FILLER_COOLDOWN_MS: 2500, // Was 3000 - more frequent presence when needed
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
 *
 * Start SUPERHUMAN optimistic - assume blazing fast until proven otherwise.
 * This prevents unnecessary fillers on first few turns when system is actually fast.
 */
function getSessionStats(sessionId: string): SessionLatencyStats {
  if (!sessionStats.has(sessionId)) {
    sessionStats.set(sessionId, {
      recentLatencies: [],
      avgLatency: 200, // Start SUPERHUMAN - assume instant until proven otherwise
      p95Latency: 400, // Optimistic p95 - will adjust based on actual performance
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
 * Calculate adaptive timeouts based on session performance.
 * Optionally adjusts timing based on detected voice emotion.
 */
export function getAdaptiveTimeouts(
  sessionId: string,
  emotion?: VoiceEmotionResult
): AdaptiveTimeouts {
  const stats = getSessionStats(sessionId);

  // Calculate filler timeout based on actual performance
  // Add buffer to average, but never below minimum
  const rawFillerTimeout = stats.avgLatency + FILLER_STRATEGY.FILLER_BUFFER_MS;
  let fillerTimeoutMs = Math.max(
    FILLER_STRATEGY.MIN_LATENCY_FOR_FILLER,
    Math.min(rawFillerTimeout, FILLER_STRATEGY.GUARANTEED_FILLER_LATENCY)
  );

  // Hard timeout based on P95 with headroom
  let hardTimeoutMs = Math.max(LATENCY_TARGETS.HARD_LIMIT, stats.p95Latency * 1.5);

  // Apply emotion-based timing adjustment
  if (emotion) {
    const emotionTiming = getEmotionAdjustedTiming(emotion);
    fillerTimeoutMs = Math.round(fillerTimeoutMs * emotionTiming.responseDelayMultiplier);
    hardTimeoutMs = Math.round(hardTimeoutMs * emotionTiming.responseDelayMultiplier);

    log.debug(
      {
        sessionId,
        emotion: emotion.primary,
        multiplier: emotionTiming.responseDelayMultiplier,
        adjustedFillerMs: fillerTimeoutMs,
      },
      'Emotion adjusted adaptive timeouts'
    );
  }

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
// DYNAMIC VAD DURATION (Semantic Endpointing)
// ============================================================================

export { type VoiceFeatures } from '../vad-semantic-endpointer.js';

/**
 * Compute dynamic VAD silence duration using semantic analysis,
 * session pace, and emotional state.
 *
 * Returns the recommended milliseconds to wait after silence before
 * committing to "user is done speaking." Clamped to [150, 500].
 */
export function computeDynamicVADDuration(
  sessionId: string,
  transcript: string,
  voiceFeatures?: VoiceFeatures,
  emotionalState?: string
): number {
  if (!isOptimizationEnabled('SEMANTIC_VAD')) {
    return 500; // Default when disabled
  }

  // 1. Semantic endpoint analysis
  const analysis = analyzeEndpoint(transcript, voiceFeatures);
  let vadMs = analysis.recommendedVADMs;

  // 2. Emotional adjustments — be more patient with upset/anxious users
  if (emotionalState === 'upset' || emotionalState === 'anxious' || emotionalState === 'distressed') {
    vadMs += 100;
  } else if (emotionalState === 'excited' || emotionalState === 'happy') {
    vadMs -= 50;
  }

  // 3. Session pace factor — fast-paced sessions get tighter timing
  const stats = sessionStats.get(sessionId);
  if (stats && stats.turnCount >= 3) {
    const sessionDurationSec = (Date.now() - stats.startTime) / 1000;
    const avgTurnDurationSec = sessionDurationSec / stats.turnCount;
    if (avgTurnDurationSec < 3) {
      vadMs -= 50; // Fast-paced session
    }
  }

  // 4. Clamp to safe range
  vadMs = Math.max(150, Math.min(500, vadMs));

  log.debug(
    {
      sessionId,
      vadMs,
      semanticConfidence: analysis.confidence.toFixed(2),
      signals: analysis.signals,
      emotionalState,
    },
    'Dynamic VAD duration computed'
  );

  return vadMs;
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
  computeDynamicVADDuration,
};
