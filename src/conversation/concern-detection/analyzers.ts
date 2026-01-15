/**
 * Concern Detection Analyzers
 *
 * Individual analyzer functions for different signal sources:
 * - Linguistic: Word patterns and language analysis
 * - Behavioral: Engagement, response patterns
 * - Prosody: Voice characteristics
 * - Breathing: Breath patterns
 * - Temporal: Time-based patterns
 *
 * @module @ferni/conversation/concern-detection/analyzers
 */

import { createLogger } from '../../utils/safe-logger.js';
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';

import type {
  BreathingSignals,
  ConcernSignal,
  ConcernType,
  ProsodySignals,
  TemporalContext,
} from './types.js';
import {
  ABSOLUTIST_PATTERNS,
  CRISIS_PATTERNS,
  PATTERN_CHECKS,
} from './patterns.js';

const logger = createLogger({ module: 'ConcernAnalyzers' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// SIGNAL HELPER
// ============================================================================

export type SignalAdder = (
  source: ConcernSignal['source'],
  type: ConcernType,
  confidence: number,
  indicator: string
) => void;

// ============================================================================
// LINGUISTIC ANALYZER
// ============================================================================

/**
 * Analyze linguistic patterns in user message
 */
export function analyzeLinguistic(
  text: string,
  addSignal: SignalAdder,
  existingSignals: ConcernSignal[]
): void {
  const lowered = text.toLowerCase();

  // CRISIS CHECK FIRST - highest priority
  for (const pattern of CRISIS_PATTERNS) {
    if (pattern.test(lowered)) {
      addSignal('linguistic', 'crisis', 0.95, 'Crisis language detected');
      return; // Don't check other patterns
    }
  }

  // Check each concern type
  for (const { patterns, type, weight } of PATTERN_CHECKS) {
    const matches = patterns.filter((p) => p.test(lowered));
    if (matches.length > 0) {
      // More matches = higher confidence
      const confidence = Math.min(0.95, weight + matches.length * 0.1);
      addSignal('linguistic', type, confidence, `Pattern: ${type}`);
    }
  }

  // Check for absolutist language (negative spiral indicator)
  const absolutistCount = ABSOLUTIST_PATTERNS.filter((p) => p.test(lowered)).length;
  if (absolutistCount >= 2) {
    // Find the most likely concern type from existing signals
    const existingType = existingSignals.find((s) => s.source === 'linguistic')?.type || 'anxiety';
    addSignal(
      'linguistic',
      existingType,
      0.3 + absolutistCount * 0.1,
      'Absolutist language spiral'
    );
  }
}

// ============================================================================
// BEHAVIORAL ANALYZER
// ============================================================================

export interface BehavioralContext {
  engagementLevel?: number;
  responseLatencyMs?: number;
  previousTopics?: string[];
  currentTopic?: string;
}

export interface BehavioralState {
  responseLengthHistory: number[];
  engagementHistory: number[];
  turnCount: number;
}

/**
 * Analyze behavioral patterns in user interaction
 */
export function analyzeBehavioral(
  text: string,
  context: BehavioralContext,
  state: BehavioralState,
  addSignal: SignalAdder
): { responseLengthHistory: number[]; engagementHistory: number[] } {
  // 🦀 Use Rust for O(1) word counting
  const wordCount = RUST_COUNTING_AVAILABLE ? countWordsRust(text) : text.split(/\s+/).length;

  // Clone histories
  const responseLengthHistory = [...state.responseLengthHistory, wordCount];
  if (responseLengthHistory.length > 10) {
    responseLengthHistory.shift();
  }

  const engagementHistory = [...state.engagementHistory];
  if (context.engagementLevel !== undefined) {
    engagementHistory.push(context.engagementLevel);
    if (engagementHistory.length > 10) {
      engagementHistory.shift();
    }
  }

  // Check for sudden brevity (potential withdrawal)
  if (responseLengthHistory.length >= 3) {
    const recent = responseLengthHistory.slice(-3);
    const earlier = responseLengthHistory.slice(0, -3);

    if (earlier.length > 0) {
      const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;

      if (recentAvg < earlierAvg * 0.4 && earlierAvg > 15) {
        addSignal('behavioral', 'sadness', 0.5, 'Sudden response brevity (withdrawal)');
      }
    }
  }

  // Check for engagement decline
  if (engagementHistory.length >= 4) {
    const recent = engagementHistory.slice(-2);
    const earlier = engagementHistory.slice(-4, -2);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

    if (recentAvg < earlierAvg - 0.25) {
      addSignal('behavioral', 'exhaustion', 0.4, 'Engagement decline');
    }
  }

  // Check for topic avoidance
  if (context.previousTopics && context.currentTopic) {
    const heavyTopics = ['death', 'loss', 'trauma', 'abuse', 'suicide', 'divorce'];
    const wasDiscussingHeavy = context.previousTopics.some((t) =>
      heavyTopics.some((h) => t.toLowerCase().includes(h))
    );
    const nowOnLight = !heavyTopics.some((h) => context.currentTopic?.toLowerCase().includes(h));

    if (wasDiscussingHeavy && nowOnLight && wordCount < 20) {
      addSignal('behavioral', 'overwhelm', 0.4, 'Topic avoidance after heavy topic');
    }
  }

  // Check for late-night message + short response (potential crisis signal)
  const hour = new Date().getHours();
  if ((hour >= 23 || hour <= 4) && wordCount < 10 && state.turnCount > 5) {
    addSignal('behavioral', 'loneliness', 0.35, 'Late night brevity');
  }

  return { responseLengthHistory, engagementHistory };
}

// ============================================================================
// PROSODY ANALYZER
// ============================================================================

/**
 * Analyze voice prosody signals
 */
export function analyzeProsody(prosody: ProsodySignals, addSignal: SignalAdder): void {
  // Voice strain indicates stress/anxiety
  if (prosody.strain > 0.6) {
    addSignal('prosody', 'anxiety', prosody.strain * 0.8, 'Voice strain detected');
  }

  // Pitch instability indicates emotional dysregulation
  if (prosody.pitchInstability > 0.5) {
    addSignal('prosody', 'overwhelm', prosody.pitchInstability * 0.7, 'Pitch instability');
  }

  // Tremor is a strong signal
  if (prosody.tremor) {
    addSignal('prosody', 'fear', 0.75, 'Voice tremor detected');
  }

  // Low energy voice
  if (prosody.energy < 0.3) {
    addSignal('prosody', 'exhaustion', 0.6, 'Low voice energy');
  }

  // Speech rate deviation
  if (Math.abs(prosody.speechRateDeviation) > 0.3) {
    if (prosody.speechRateDeviation > 0) {
      // Speaking faster than usual = anxiety
      addSignal('prosody', 'anxiety', 0.5, 'Rapid speech');
    } else {
      // Speaking slower = sadness/exhaustion
      addSignal('prosody', 'sadness', 0.5, 'Slowed speech');
    }
  }
}

// ============================================================================
// BREATHING ANALYZER
// ============================================================================

/**
 * Analyze breathing patterns
 */
export function analyzeBreathing(breathing: BreathingSignals, addSignal: SignalAdder): void {
  // Rapid breathing (>20 bpm) indicates anxiety
  if (breathing.breathsPerMinute > 20) {
    const intensity = Math.min(1, (breathing.breathsPerMinute - 20) / 10);
    addSignal('breathing', 'anxiety', intensity * 0.7, 'Rapid breathing');
  }

  // Shallow breathing
  if (breathing.shallow) {
    addSignal('breathing', 'anxiety', 0.5, 'Shallow breathing');
  }

  // Held breath (often precedes difficult admission)
  if (breathing.heldBreath) {
    addSignal('breathing', 'fear', 0.6, 'Held breath');
  }

  // Frequent sighing
  if (breathing.sighFrequency > 0.5) {
    addSignal('breathing', 'sadness', 0.4, 'Frequent sighing');
  }
}

// ============================================================================
// TEMPORAL ANALYZER
// ============================================================================

/**
 * Analyze temporal context patterns
 */
export function analyzeTemporal(
  temporal: TemporalContext,
  existingSignals: ConcernSignal[],
  addSignal: SignalAdder
): void {
  // Late night conversations carry higher baseline concern
  if (temporal.isLateNight) {
    logger.debug('Late night context noted');
  }

  // Historical patterns (if available)
  if (temporal.historicalVulnerability && temporal.historicalVulnerability > 0.5) {
    addSignal(
      'temporal',
      'anxiety',
      temporal.historicalVulnerability * 0.5,
      'Historical vulnerability at this time'
    );
  }

  // Sunday evening anxiety (common pattern)
  if (temporal.dayOfWeek === 0 && temporal.hour >= 17 && temporal.hour <= 22) {
    // Light signal - don't over-weight
    // Only add if other signals present
    if (existingSignals.length > 0) {
      addSignal('temporal', 'anxiety', 0.2, 'Sunday evening pattern');
    }
  }

  // Monday morning (another common stress point)
  if (temporal.dayOfWeek === 1 && temporal.hour >= 6 && temporal.hour <= 10) {
    if (existingSignals.length > 0) {
      addSignal('temporal', 'overwhelm', 0.2, 'Monday morning pattern');
    }
  }
}
