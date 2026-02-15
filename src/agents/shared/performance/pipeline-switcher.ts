/**
 * Pipeline Switcher — Dynamic inference routing based on emotion and context.
 *
 * Selects between three pipeline modes:
 * - 'omni': Audio-to-audio via FullOmniPipeline (~200ms, fastest full response)
 * - 'quality': STT + LLM + TTS (~500ms, best reasoning quality)
 * - 'speed': LFM2 speech-to-speech (~100ms, for barge-in recovery)
 *
 * Environment:
 *   PIPELINE_SWITCHING=true  — enable dynamic switching (default: false)
 *   DEFAULT_PIPELINE=omni    — fallback when switching disabled
 *
 * @module agents/shared/performance/pipeline-switcher
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PipelineSwitcher' });

// ============================================================================
// TYPES
// ============================================================================

export type PipelineMode = 'omni' | 'quality' | 'speed';

export interface PipelineSwitchContext {
  /** Detected user emotion category */
  emotion?: string;
  /** User's stress level 0-1 */
  stressLevel?: number;
  /** Whether the user just interrupted the agent */
  wasInterrupted?: boolean;
  /** Current turn number in the conversation */
  turnCount: number;
  /** Length of the user's transcript in characters */
  userTranscriptLength: number;
  /** Whether this is the first agent response in the session */
  isFirstResponse: boolean;
  /** Whether the user asked a question (contains ?) */
  isQuestion?: boolean;
}

export interface PipelineSwitchResult {
  /** Selected pipeline mode */
  mode: PipelineMode;
  /** Human-readable reason for the selection */
  reason: string;
  /** Confidence in the selection (0-1) */
  confidence: number;
}

// ============================================================================
// THRESHOLDS
// ============================================================================

const LONG_TRANSCRIPT_CHARS = 200;
const SHORT_TRANSCRIPT_CHARS = 30;
const HIGH_STRESS_THRESHOLD = 0.7;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if pipeline switching is enabled.
 */
export function isPipelineSwitchingEnabled(): boolean {
  return process.env.PIPELINE_SWITCHING === 'true';
}

/**
 * Get the default pipeline mode from environment.
 */
export function getDefaultPipeline(): PipelineMode {
  const mode = process.env.DEFAULT_PIPELINE;
  if (mode === 'omni' || mode === 'quality' || mode === 'speed') return mode;
  return 'omni';
}

/**
 * Select the optimal inference pipeline based on conversation context.
 *
 * Priority order:
 * 1. Switching disabled → default pipeline
 * 2. Barge-in recovery → 'speed'
 * 3. First response → 'omni' (fast first impression)
 * 4. Emotion-based routing (distressed/angry, contemplative, sad)
 * 5. Context-based overrides (long question, short ack)
 * 6. Default → 'omni'
 */
export function selectPipeline(context: PipelineSwitchContext): PipelineSwitchResult {
  // 1. If switching disabled, return default
  if (!isPipelineSwitchingEnabled()) {
    const mode = getDefaultPipeline();
    return { mode, reason: 'Pipeline switching disabled', confidence: 1.0 };
  }

  // 2. Barge-in recovery: highest priority
  if (context.wasInterrupted) {
    log.debug({ turnCount: context.turnCount }, 'Barge-in detected, selecting speed pipeline');
    return { mode: 'speed', reason: 'Barge-in recovery — minimize response latency', confidence: 0.95 };
  }

  // 3. First response: fast first impression
  if (context.isFirstResponse) {
    return { mode: 'omni', reason: 'First response — fast first impression', confidence: 0.85 };
  }

  // 4. Emotion-based routing
  const emotionResult = selectByEmotion(context);
  if (emotionResult) {
    log.debug(
      { emotion: context.emotion, mode: emotionResult.mode, stress: context.stressLevel },
      'Emotion-based pipeline selection'
    );
    return emotionResult;
  }

  // 5. Context-based overrides
  const contextResult = selectByContext(context);
  if (contextResult) {
    return contextResult;
  }

  // 6. Default
  return { mode: 'omni', reason: 'Default pipeline', confidence: 0.6 };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function selectByEmotion(context: PipelineSwitchContext): PipelineSwitchResult | null {
  if (!context.emotion) return null;

  const highStress = (context.stressLevel ?? 0) >= HIGH_STRESS_THRESHOLD;

  switch (context.emotion) {
    case 'distressed':
    case 'angry':
      // Fast empathetic response — don't make an upset user wait
      return {
        mode: 'omni',
        reason: highStress
          ? `User ${context.emotion} with high stress — fast empathetic response`
          : `User ${context.emotion} — prioritize response speed`,
        confidence: highStress ? 0.9 : 0.8,
      };

    case 'contemplative':
      // User is thinking — give them the best answer
      return {
        mode: 'quality',
        reason: 'User contemplative — invest in reasoning quality',
        confidence: 0.8,
      };

    case 'sad':
      // Thoughtful, deliberate response
      return {
        mode: 'quality',
        reason: 'User sad — thoughtful response over speed',
        confidence: 0.75,
      };

    case 'happy':
    case 'neutral':
      // No strong signal from emotion alone — fall through to context
      return null;

    default:
      return null;
  }
}

function selectByContext(context: PipelineSwitchContext): PipelineSwitchResult | null {
  const isLong = context.userTranscriptLength > LONG_TRANSCRIPT_CHARS;
  const isShort = context.userTranscriptLength < SHORT_TRANSCRIPT_CHARS;

  // Long question → quality (complex question deserves best reasoning)
  if (isLong && context.isQuestion) {
    return {
      mode: 'quality',
      reason: 'Long question — invest in reasoning quality',
      confidence: 0.75,
    };
  }

  // Short non-question → speed (quick acknowledgment)
  if (isShort && !context.isQuestion) {
    return {
      mode: 'speed',
      reason: 'Short acknowledgment — fast response',
      confidence: 0.7,
    };
  }

  return null;
}
