/**
 * Semantic VAD Endpointer
 *
 * Analyzes transcript content and voice features to determine optimal
 * Voice Activity Detection silence duration. Instead of a fixed 500ms wait,
 * this module uses linguistic and prosodic signals to decide when the user
 * is truly done speaking.
 *
 * Confidence mapping:
 *   confidence 1.0 → 150ms (user definitely done)
 *   confidence 0.0 → 450ms (unsure, wait longer)
 *
 * @module agents/shared/vad-semantic-endpointer
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isOptimizationEnabled } from './performance/latency-feature-flags.js';

const log = createLogger({ module: 'SemanticEndpointer' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Default VAD duration when feature is disabled */
const DEFAULT_VAD_MS = 500;

/** Minimum VAD silence — user clearly done (question, exclamation) */
const MIN_VAD_MS = 150;

/** Maximum VAD silence — unsure if user is done */
const MAX_VAD_MS = 450;

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceFeatures {
  pitchTrend?: 'rising' | 'falling' | 'flat';
  /** Normalized energy level 0–1 */
  energy?: number;
}

export interface EndpointAnalysis {
  /** How confident we are that the user finished speaking (0–1) */
  confidence: number;
  /** Recommended VAD silence duration in ms */
  recommendedVADMs: number;
  /** Which signals contributed to the decision */
  signals: string[];
}

// ============================================================================
// LINGUISTIC PATTERNS
// ============================================================================

const QUESTION_PATTERN = /\?\s*$/;
const EXCLAMATION_PATTERN = /!\s*$/;
const COMPLETE_SENTENCE_PATTERN = /[.!?]\s*$/;
const TRAILING_OFF_PATTERN = /\b(um|uh|hmm|like|you know|I mean)\s*\.{0,3}\s*$/i;
const INCOMPLETE_THOUGHT_PATTERN = /\b(and|but|or|because|so|if|when|that|which|who)\s*$/i;

// ============================================================================
// ANALYSIS
// ============================================================================

/**
 * Analyze a transcript to determine endpoint confidence and recommended
 * VAD silence duration.
 *
 * Returns the default 500ms when the SEMANTIC_VAD flag is off.
 */
export function analyzeEndpoint(
  transcript: string,
  voiceFeatures?: VoiceFeatures
): EndpointAnalysis {
  if (!isOptimizationEnabled('SEMANTIC_VAD')) {
    return { confidence: 0, recommendedVADMs: DEFAULT_VAD_MS, signals: ['disabled'] };
  }

  const trimmed = transcript.trim();
  if (!trimmed) {
    return { confidence: 0, recommendedVADMs: MAX_VAD_MS, signals: ['empty'] };
  }

  let confidence = 0.5; // Neutral baseline
  const signals: string[] = [];

  // --- Textual signals ---

  if (QUESTION_PATTERN.test(trimmed)) {
    confidence += 0.3;
    signals.push('question_mark');
  }

  if (EXCLAMATION_PATTERN.test(trimmed)) {
    confidence += 0.3;
    signals.push('exclamation');
  }

  if (COMPLETE_SENTENCE_PATTERN.test(trimmed) && !signals.includes('question_mark') && !signals.includes('exclamation')) {
    confidence += 0.2;
    signals.push('complete_sentence');
  }

  if (TRAILING_OFF_PATTERN.test(trimmed)) {
    confidence -= 0.3;
    signals.push('trailing_off');
  }

  if (INCOMPLETE_THOUGHT_PATTERN.test(trimmed)) {
    confidence -= 0.4;
    signals.push('incomplete_thought');
  }

  // Short utterances (≤ 3 words) with punctuation are very likely complete
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 3 && COMPLETE_SENTENCE_PATTERN.test(trimmed)) {
    confidence += 0.1;
    signals.push('short_complete');
  }

  // --- Voice feature signals ---

  if (voiceFeatures) {
    if (voiceFeatures.pitchTrend === 'falling') {
      confidence += 0.15;
      signals.push('falling_pitch');
    } else if (voiceFeatures.pitchTrend === 'rising') {
      confidence += 0.1;
      signals.push('rising_pitch');
    }

    if (voiceFeatures.energy !== undefined && voiceFeatures.energy < 0.2) {
      confidence += 0.1;
      signals.push('low_energy');
    }
  }

  // Clamp confidence to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  // Map confidence → VAD duration: high confidence = shorter wait
  const recommendedVADMs = Math.round(MAX_VAD_MS - confidence * (MAX_VAD_MS - MIN_VAD_MS));

  log.debug(
    {
      confidence: confidence.toFixed(2),
      recommendedVADMs,
      signals,
      transcript: trimmed.slice(0, 50),
    },
    'Semantic endpoint analysis'
  );

  return { confidence, recommendedVADMs, signals };
}
