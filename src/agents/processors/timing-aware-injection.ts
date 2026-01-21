/**
 * Timing-Aware Injection Module
 *
 * Phase 3 BTH Communication Overhaul
 *
 * Provides graceful degradation of context injection based on timing pressure.
 * When the system is under time pressure (user waiting too long, tools slow),
 * we intelligently reduce context to maintain responsiveness.
 *
 * Strategy:
 * 1. TIER 1 (Essential): Always include - safety, identity, boundaries
 * 2. TIER 2 (High-Value): Include unless severe pressure - emotional, memory, trust
 * 3. TIER 3 (Nice-to-Have): Skip under pressure - catchphrases, stories, ambient
 *
 * @module agents/processors/timing-aware-injection
 */

import type { ContextInjection } from './types.js';
import type { TimingState } from '../../intelligence/context-builders/awareness/system-state-awareness.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'timing-aware-injection' });

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

/**
 * Tier 1: Essential - ALWAYS include regardless of timing pressure
 * These are non-negotiable for safety and identity
 */
const TIER_1_ESSENTIAL = new Set([
  'safety',
  'crisis_response',
  'identity',
  'boundaries',
  'unsaid',
  'system_state',      // Current system state (music, timers)
  'timing_state',      // Timing awareness (Phase 3)
  'tool_hint',         // Tool execution hints
]);

/**
 * Tier 2: High-Value - Include unless under severe pressure
 * These provide "Better than Human" emotional intelligence
 */
const TIER_2_HIGH_VALUE = new Set([
  'emotional',
  'emotional_context',
  'memory',
  'memory_context',
  'trust',
  'voice_emotion',
  'coaching',
  'cognitive',
  'engagement',
  'persona',
  'superhuman',
]);

/**
 * Tier 3: Nice-to-Have - Skip when under any pressure
 * These add polish but aren't critical
 */
const TIER_3_OPTIONAL = new Set([
  'catchphrase',
  'response_prefix',
  'conversation_state',
  'wrap_up',
  'story_opportunity',
  'mode_transition',
  'situational_response',
  'pushback',
  'health_awareness',
  'ambient_awareness',
  'celebration',
  'humanizing',
]);

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Pressure level thresholds
 */
export const PRESSURE_CONFIG = {
  // User waiting thresholds
  MODERATE_WAIT_MS: 2000,    // 2s - start reducing TIER 3
  SEVERE_WAIT_MS: 4000,      // 4s - also reduce TIER 2
  CRITICAL_WAIT_MS: 6000,    // 6s - bare minimum only

  // E2E latency thresholds (recent average)
  SLOW_LATENCY_MS: 3000,     // System running slow
  VERY_SLOW_LATENCY_MS: 5000, // System very slow

  // Injection limits at each pressure level
  NORMAL: { maxInjections: 6, maxChars: 1500 },
  MODERATE: { maxInjections: 4, maxChars: 1000 },
  SEVERE: { maxInjections: 3, maxChars: 600 },
  CRITICAL: { maxInjections: 2, maxChars: 400 },
} as const;

// ============================================================================
// PRESSURE DETECTION
// ============================================================================

export type PressureLevel = 'normal' | 'moderate' | 'severe' | 'critical';

/**
 * Determine pressure level from timing state
 */
export function detectPressureLevel(timingState: TimingState | null): PressureLevel {
  if (!timingState) {
    return 'normal';
  }

  const { userWaitingTime, avgE2ELatency, toolsInFlight } = timingState;

  // Critical: User waiting very long or multiple tools in flight
  if (userWaitingTime > PRESSURE_CONFIG.CRITICAL_WAIT_MS) {
    return 'critical';
  }

  // Severe: User waiting long or system very slow
  if (
    userWaitingTime > PRESSURE_CONFIG.SEVERE_WAIT_MS ||
    (avgE2ELatency && avgE2ELatency > PRESSURE_CONFIG.VERY_SLOW_LATENCY_MS)
  ) {
    return 'severe';
  }

  // Moderate: User waiting or tools in flight
  if (
    userWaitingTime > PRESSURE_CONFIG.MODERATE_WAIT_MS ||
    toolsInFlight.length > 0 ||
    (avgE2ELatency && avgE2ELatency > PRESSURE_CONFIG.SLOW_LATENCY_MS)
  ) {
    return 'moderate';
  }

  return 'normal';
}

// ============================================================================
// INJECTION FILTERING
// ============================================================================

/**
 * Filter injections based on timing pressure
 *
 * @param injections - All candidate injections
 * @param pressureLevel - Current pressure level
 * @returns Filtered injections appropriate for the pressure level
 */
export function filterInjectionsByPressure(
  injections: ContextInjection[],
  pressureLevel: PressureLevel
): ContextInjection[] {
  // Normal pressure - no filtering needed
  if (pressureLevel === 'normal') {
    return injections;
  }

  // Get allowed categories for this pressure level
  const allowedCategories = getAllowedCategories(pressureLevel);

  // Filter injections
  const filtered = injections.filter((injection) => {
    const category = injection.category?.toLowerCase() || 'unknown';
    return allowedCategories.has(category);
  });

  // Apply limits
  const limits = getLimitsForPressure(pressureLevel);
  const limited = applyLimits(filtered, limits.maxInjections, limits.maxChars);

  log.debug(
    {
      pressureLevel,
      inputCount: injections.length,
      outputCount: limited.length,
      droppedCount: injections.length - limited.length,
    },
    'Filtered injections by timing pressure'
  );

  return limited;
}

/**
 * Get allowed categories for a pressure level
 */
function getAllowedCategories(pressureLevel: PressureLevel): Set<string> {
  const allowed = new Set<string>();

  // Always include TIER 1
  for (const cat of TIER_1_ESSENTIAL) {
    allowed.add(cat);
  }

  // Include TIER 2 unless critical
  if (pressureLevel !== 'critical') {
    for (const cat of TIER_2_HIGH_VALUE) {
      allowed.add(cat);
    }
  }

  // Include TIER 3 only at normal (which doesn't reach this function)
  // So TIER 3 is always excluded when filtering by pressure

  return allowed;
}

/**
 * Get injection limits for a pressure level
 */
function getLimitsForPressure(
  pressureLevel: PressureLevel
): { maxInjections: number; maxChars: number } {
  switch (pressureLevel) {
    case 'critical':
      return PRESSURE_CONFIG.CRITICAL;
    case 'severe':
      return PRESSURE_CONFIG.SEVERE;
    case 'moderate':
      return PRESSURE_CONFIG.MODERATE;
    default:
      return PRESSURE_CONFIG.NORMAL;
  }
}

/**
 * Apply count and character limits to injections
 */
function applyLimits(
  injections: ContextInjection[],
  maxCount: number,
  maxChars: number
): ContextInjection[] {
  const result: ContextInjection[] = [];
  let totalChars = 0;

  // Sort by priority (lower = more important)
  const sorted = [...injections].sort((a, b) => (a.priority || 50) - (b.priority || 50));

  for (const injection of sorted) {
    if (result.length >= maxCount) {
      break;
    }

    const contentLength = injection.content?.length || 0;
    if (totalChars + contentLength > maxChars) {
      // Try to include if it's essential
      if (TIER_1_ESSENTIAL.has(injection.category?.toLowerCase() || '')) {
        result.push(injection);
        totalChars += contentLength;
      }
      continue;
    }

    result.push(injection);
    totalChars += contentLength;
  }

  return result;
}

// ============================================================================
// CACHE FOR RECENT INSIGHTS
// ============================================================================

interface CachedInsight {
  content: string;
  category: string;
  timestamp: number;
}

const recentInsightsBySession = new Map<string, CachedInsight[]>();

/**
 * Cache an insight for potential reuse under pressure
 */
export function cacheInsight(sessionId: string, injection: ContextInjection): void {
  if (!injection.content || !injection.category) return;

  // Only cache high-value insights
  if (!TIER_2_HIGH_VALUE.has(injection.category.toLowerCase())) return;

  if (!recentInsightsBySession.has(sessionId)) {
    recentInsightsBySession.set(sessionId, []);
  }

  const insights = recentInsightsBySession.get(sessionId)!;
  insights.push({
    content: injection.content,
    category: injection.category,
    timestamp: Date.now(),
  });

  // Keep last 10 insights
  if (insights.length > 10) {
    insights.shift();
  }
}

/**
 * Get cached insights for use under pressure
 * Returns insights from the last 60 seconds
 */
export function getCachedInsights(sessionId: string): CachedInsight[] {
  const insights = recentInsightsBySession.get(sessionId) || [];
  const cutoff = Date.now() - 60000; // 60 seconds
  return insights.filter((i) => i.timestamp > cutoff);
}

/**
 * Clear cached insights for a session
 */
export function clearCachedInsights(sessionId: string): void {
  recentInsightsBySession.delete(sessionId);
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Apply timing-aware graceful degradation to injections
 *
 * This is the main entry point that should be called from turn-processor
 * to filter injections based on current timing pressure.
 *
 * @param injections - All candidate injections
 * @param sessionId - Session ID for caching
 * @param timingState - Current timing state (or null if unavailable)
 * @returns Filtered injections with graceful degradation applied
 */
export function applyTimingAwareDegradation(
  injections: ContextInjection[],
  sessionId: string,
  timingState: TimingState | null
): {
  injections: ContextInjection[];
  pressureLevel: PressureLevel;
  degradationApplied: boolean;
} {
  // Detect pressure level
  const pressureLevel = detectPressureLevel(timingState);

  // Cache high-value insights for potential future use
  for (const injection of injections) {
    cacheInsight(sessionId, injection);
  }

  // Apply filtering if under pressure
  const degradationApplied = pressureLevel !== 'normal';
  const filteredInjections = degradationApplied
    ? filterInjectionsByPressure(injections, pressureLevel)
    : injections;

  if (degradationApplied) {
    log.info(
      {
        pressureLevel,
        originalCount: injections.length,
        filteredCount: filteredInjections.length,
        userWaitingTime: timingState?.userWaitingTime,
        toolsInFlight: timingState?.toolsInFlight.length,
      },
      'Timing-aware degradation applied'
    );
  }

  return {
    injections: filteredInjections,
    pressureLevel,
    degradationApplied,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  TIER_1_ESSENTIAL,
  TIER_2_HIGH_VALUE,
  TIER_3_OPTIONAL,
};
