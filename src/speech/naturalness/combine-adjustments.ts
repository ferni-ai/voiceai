/**
 * Combine Adjustments
 *
 * Merges TTS adjustments from multiple naturalness systems with proper
 * priority and clamping to avoid over-adjustment.
 *
 * @module naturalness/combine-adjustments
 */

import type { CombinedTtsAdjustments, ContextInjection } from './types.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const COMBINE_CONFIG = {
  /** Speed limits */
  SPEED: {
    MIN: 0.75,
    MAX: 1.15,
    DEFAULT: 1.0,
  },

  /** Volume boost limits */
  VOLUME_BOOST: {
    MIN: 0,
    MAX: 0.25,
    DEFAULT: 0,
  },

  /** Extra pause limits (ms) */
  EXTRA_PAUSE: {
    MIN: 0,
    MAX: 500,
    DEFAULT: 0,
  },
};

// ============================================================================
// ADJUSTMENT SOURCES
// ============================================================================

/**
 * Adjustments from a single source system
 */
export interface SourceAdjustments {
  /** Source system name */
  source: 'stress' | 'patterns' | 'ambient' | 'rapport';

  /** Speed multiplier (optional) */
  speedMultiplier?: number;

  /** Volume boost (optional) */
  volumeBoost?: number;

  /** Clarity mode (optional) */
  clarityMode?: boolean;

  /** Extra pause (optional, ms) */
  extraPauseMs?: number;

  /** Warmth level (optional) */
  warmthLevel?: 'neutral' | 'warm' | 'very_warm';

  /** Reason for adjustment */
  reason: string;

  /** Priority (higher = takes precedence for conflicting values) */
  priority: number;
}

// ============================================================================
// COMBINE LOGIC
// ============================================================================

/**
 * Combine adjustments from multiple sources
 *
 * Priority rules:
 * - Speed: Weighted average of all sources
 * - Volume: Max of all sources (loudest wins for audibility)
 * - Clarity: OR of all sources (if any needs clarity, enable it)
 * - Pause: Max of all sources (longest pause wins for comprehension)
 * - Warmth: Highest warmth level wins
 */
export function combineAdjustments(sources: SourceAdjustments[]): CombinedTtsAdjustments {
  if (sources.length === 0) {
    return {
      speedMultiplier: COMBINE_CONFIG.SPEED.DEFAULT,
      volumeBoost: COMBINE_CONFIG.VOLUME_BOOST.DEFAULT,
      clarityMode: false,
      extraPauseMs: COMBINE_CONFIG.EXTRA_PAUSE.DEFAULT,
      warmthLevel: 'neutral',
      reasons: [],
    };
  }

  // Sort by priority (highest first) for warmth resolution
  const sorted = [...sources].sort((a, b) => b.priority - a.priority);

  // Calculate weighted average for speed
  let speedSum = 0;
  let speedWeightSum = 0;
  for (const source of sources) {
    if (source.speedMultiplier !== undefined) {
      speedSum += source.speedMultiplier * source.priority;
      speedWeightSum += source.priority;
    }
  }
  const speedMultiplier =
    speedWeightSum > 0
      ? clamp(speedSum / speedWeightSum, COMBINE_CONFIG.SPEED.MIN, COMBINE_CONFIG.SPEED.MAX)
      : COMBINE_CONFIG.SPEED.DEFAULT;

  // Max for volume
  const volumeBoost = clamp(
    Math.max(0, ...sources.map((s) => s.volumeBoost ?? 0)),
    COMBINE_CONFIG.VOLUME_BOOST.MIN,
    COMBINE_CONFIG.VOLUME_BOOST.MAX
  );

  // OR for clarity
  const clarityMode = sources.some((s) => s.clarityMode === true);

  // Max for pause
  const extraPauseMs = clamp(
    Math.max(0, ...sources.map((s) => s.extraPauseMs ?? 0)),
    COMBINE_CONFIG.EXTRA_PAUSE.MIN,
    COMBINE_CONFIG.EXTRA_PAUSE.MAX
  );

  // Highest priority with warmth wins
  let warmthLevel: 'neutral' | 'warm' | 'very_warm' = 'neutral';
  for (const source of sorted) {
    if (source.warmthLevel) {
      if (source.warmthLevel === 'very_warm') {
        warmthLevel = 'very_warm';
        break;
      } else if (source.warmthLevel === 'warm' && warmthLevel === 'neutral') {
        warmthLevel = 'warm';
      }
    }
  }

  // Collect reasons
  const reasons = sources.filter((s) => s.reason).map((s) => `[${s.source}] ${s.reason}`);

  return {
    speedMultiplier,
    volumeBoost,
    clarityMode,
    extraPauseMs,
    warmthLevel,
    reasons,
  };
}

/**
 * Merge context injections, prioritizing by priority score
 */
export function mergeContextInjections(injections: ContextInjection[]): ContextInjection[] {
  // Filter out non-injections and sort by priority
  return injections
    .filter((i) => i.shouldInject && i.context.length > 0)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
