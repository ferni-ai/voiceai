/**
 * Unified Anticipation Pipeline
 *
 * Combines intent prediction and emotional prosody anticipation into a single,
 * coherent system for preparing agent responses during user speech.
 *
 * Benefits:
 * - Single API for all anticipation
 * - Combines intent + emotion for richer understanding
 * - Coordinates micro-reactions with intent context
 * - Session-scoped with proper cleanup
 *
 * @module speech/anticipation/pipeline
 */

import { createLogger } from '../../utils/safe-logger.js';
import { EmotionPredictor } from './emotion-predictor.js';
import { IntentPredictor } from './intent-predictor.js';
import type {
  AnticipationContext,
  AnticipationOptions,
  AnticipationResult,
  DEFAULT_ANTICIPATION_OPTIONS,
} from './types.js';

const log = createLogger({ module: 'AnticipationPipeline' });

// ============================================================================
// UNIFIED ANTICIPATION PIPELINE
// ============================================================================

/**
 * Unified anticipation pipeline
 *
 * Call during user speech to prepare response prosody before they finish.
 * This is what makes the agent feel present and responsive.
 */
export class AnticipationPipeline {
  private readonly sessionId: string;
  private readonly intentPredictor: IntentPredictor;
  private readonly emotionPredictor: EmotionPredictor;
  private readonly options: Required<AnticipationOptions>;

  // State
  private lastResult: AnticipationResult | null = null;
  private lastUpdateTime = 0;
  private updateThrottleMs = 100; // Don't update more than 10x/second

  constructor(sessionId: string, options: AnticipationOptions = {}) {
    this.sessionId = sessionId;
    this.intentPredictor = new IntentPredictor();
    this.emotionPredictor = new EmotionPredictor();

    // Merge options with defaults
    this.options = {
      personaId: options.personaId ?? 'ferni',
      minConfidence: options.minConfidence ?? 0.5,
      preferenceWeight: options.preferenceWeight ?? { intent: 0.4, emotion: 0.6 },
      enableMicroReactions: options.enableMicroReactions ?? true,
      enableTemplates: options.enableTemplates ?? false,
    };

    log.debug({ sessionId }, '🔮 Anticipation pipeline initialized');
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Process partial transcript and return anticipation result
   *
   * Call this repeatedly during user speech. It's throttled internally
   * to avoid over-processing.
   */
  process(context: AnticipationContext): AnticipationResult | null {
    // Throttle updates
    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateThrottleMs) {
      return this.lastResult;
    }
    this.lastUpdateTime = now;

    const { partialTranscript, tone } = context;

    // Skip very short transcripts
    if (partialTranscript.trim().length < 3) {
      return null;
    }

    // Run both predictors
    const intentPrediction = this.intentPredictor.predict(partialTranscript);
    const emotionPrediction = this.emotionPredictor.predict(partialTranscript, tone);

    // Calculate combined confidence
    const { preferenceWeight } = this.options;
    const combinedConfidence =
      intentPrediction.confidence * preferenceWeight.intent +
      emotionPrediction.confidence * preferenceWeight.emotion;

    // Determine actionability
    const isActionable = combinedConfidence >= this.options.minConfidence;
    const actionableReason = this.getActionableReason(
      isActionable,
      intentPrediction.confidence,
      emotionPrediction.confidence
    );

    // Determine prosody (emotion takes precedence for naturalness)
    const prosody = {
      speedMultiplier: emotionPrediction.speedMultiplier,
      volumeMultiplier: emotionPrediction.volumeMultiplier,
      pauseMultiplier: emotionPrediction.pauseMultiplier,
      emotion: emotionPrediction.anticipatedEmotion,
      microReactionSsml: this.options.enableMicroReactions
        ? emotionPrediction.microReactionSsml
        : null,
    };

    // Adjust prosody based on intent context
    if (intentPrediction.intent === 'question' && intentPrediction.confidence > 0.6) {
      // Questions: slightly faster response
      prosody.speedMultiplier = Math.min(prosody.speedMultiplier * 1.05, 1.15);
    } else if (intentPrediction.intent === 'emotional_share' && intentPrediction.confidence > 0.6) {
      // Emotional sharing: slower, softer
      prosody.speedMultiplier = Math.min(prosody.speedMultiplier, 0.9);
      prosody.volumeMultiplier = Math.min(prosody.volumeMultiplier, 0.9);
    } else if (intentPrediction.intent === 'celebration' && intentPrediction.confidence > 0.6) {
      // Celebration: match energy
      prosody.speedMultiplier = Math.max(prosody.speedMultiplier, 1.05);
      prosody.volumeMultiplier = Math.max(prosody.volumeMultiplier, 1.05);
    }

    const result: AnticipationResult = {
      intent: intentPrediction,
      emotion: emotionPrediction,
      combinedConfidence,
      isActionable,
      actionableReason,
      prosody,
      timestamp: now,
    };

    this.lastResult = result;

    log.debug(
      {
        intent: intentPrediction.intent,
        trajectory: emotionPrediction.trajectory,
        combinedConfidence: combinedConfidence.toFixed(2),
        isActionable,
      },
      '🔮 Anticipation processed'
    );

    return result;
  }

  /**
   * Get the latest result without re-processing
   */
  getLatest(): AnticipationResult | null {
    return this.lastResult;
  }

  /**
   * Get prepared prosody for response (convenience method)
   *
   * Returns null if no actionable anticipation is available.
   */
  getPreparedProsody(): AnticipationResult['prosody'] | null {
    if (!this.lastResult || !this.lastResult.isActionable) {
      return null;
    }

    // Check freshness (3 seconds max)
    const age = Date.now() - this.lastResult.timestamp;
    if (age > 3000) {
      return null;
    }

    return this.lastResult.prosody;
  }

  /**
   * Check if we should use a micro-reaction
   */
  shouldUseMicroReaction(): boolean {
    if (!this.options.enableMicroReactions) return false;
    if (!this.lastResult || !this.lastResult.isActionable) return false;

    // Only use micro-reactions for high-confidence emotional trajectories
    return (
      this.lastResult.emotion.confidence >= 0.6 &&
      this.lastResult.prosody.microReactionSsml !== null
    );
  }

  /**
   * Get context hint for LLM (if available)
   */
  getContextHint(): string | null {
    if (!this.lastResult || this.lastResult.intent.confidence < 0.5) {
      return null;
    }
    return this.lastResult.intent.contextHint ?? null;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private getActionableReason(
    isActionable: boolean,
    intentConfidence: number,
    emotionConfidence: number
  ): string {
    if (isActionable) {
      if (emotionConfidence >= 0.7) {
        return 'high_emotion_confidence';
      }
      if (intentConfidence >= 0.7) {
        return 'high_intent_confidence';
      }
      return 'combined_confidence_met';
    }

    if (intentConfidence < 0.3 && emotionConfidence < 0.3) {
      return 'insufficient_data';
    }
    return 'below_threshold';
  }

  // ==========================================================================
  // STATS & LIFECYCLE
  // ==========================================================================

  /**
   * Get statistics
   */
  getStats() {
    return {
      intentStats: this.intentPredictor.getStats(),
      emotionStats: this.emotionPredictor.getStats(),
      lastResultAge: this.lastResult ? Date.now() - this.lastResult.timestamp : null,
    };
  }

  /**
   * Reset pipeline state
   */
  reset(): void {
    this.intentPredictor.reset();
    this.emotionPredictor.reset();
    this.lastResult = null;
    this.lastUpdateTime = 0;
    log.debug({ sessionId: this.sessionId }, '🔮 Anticipation pipeline reset');
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const pipelines = new Map<string, AnticipationPipeline>();

/**
 * Get or create anticipation pipeline for a session
 */
export function getAnticipationPipeline(
  sessionId: string,
  options?: AnticipationOptions
): AnticipationPipeline {
  let pipeline = pipelines.get(sessionId);
  if (!pipeline) {
    pipeline = new AnticipationPipeline(sessionId, options);
    pipelines.set(sessionId, pipeline);
  }
  return pipeline;
}

/**
 * Reset pipeline for a session
 */
export function resetAnticipationPipeline(sessionId: string): void {
  const pipeline = pipelines.get(sessionId);
  if (pipeline) {
    pipeline.reset();
    pipelines.delete(sessionId);
  }
}

/**
 * Reset all pipelines
 */
export function resetAllAnticipationPipelines(): void {
  for (const pipeline of pipelines.values()) {
    pipeline.reset();
  }
  pipelines.clear();
}

/**
 * Get active pipeline count
 */
export function getActiveAnticipationPipelineCount(): number {
  return pipelines.size;
}
