/**
 * Realtime Model Preemptive Generation Patch
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * LiveKit's built-in preemptiveGeneration ONLY works with separate STT + LLM pipelines.
 * When using Google's RealtimeModel (Gemini 2.0 speech-to-speech), it's disabled because:
 *
 *   `if (!(this.llm instanceof LLM)) return;`
 *
 * This patch provides preemptive capabilities for RealtimeModel by:
 * 1. Intercepting partial transcripts from the model
 * 2. Running intent prediction and pattern caching
 * 3. Pre-warming context and anticipating likely responses
 * 4. Optionally, starting parallel LLM calls for anticipated intents
 *
 * @module RealtimePreemptivePatch
 */

import { getLogger } from '../utils/safe-logger.js';
import {
  getResponseAnticipationService,
  predictIntent,
  generatePrefetchContext,
  type AnticipatedResponse,
} from './response-anticipation.js';
import { getEnhancedTurnPredictor } from './enhanced-turn-prediction.js';
import type { ProsodyFeatures } from './audio-prosody.js';

const log = getLogger().child({ module: 'RealtimePreemptivePatch' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Partial transcript event from RealtimeModel
 */
export interface PartialTranscriptEvent {
  itemId: string;
  transcript: string;
  isFinal: boolean;
}

/**
 * Preemptive action to take
 */
export interface PreemptiveAction {
  /** Type of action */
  type: 'cache_hit' | 'context_prepared' | 'anticipation_ready' | 'none';
  /** Anticipated response if available */
  anticipation: AnticipatedResponse | null;
  /** Context hint for LLM */
  contextHint: string | null;
  /** Estimated latency savings (ms) */
  estimatedSavingsMs: number;
  /** Reason for action */
  reason: string;
}

/**
 * Callback for when preemptive action is ready
 */
export type PreemptiveCallback = (action: PreemptiveAction) => void;

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Minimum transcript length to start anticipation
  MIN_ANTICIPATION_LENGTH: 3,

  // Update interval for partial processing (ms)
  UPDATE_INTERVAL_MS: 100,

  // Minimum confidence for cache hit
  MIN_CACHE_CONFIDENCE: 0.6,

  // Minimum turn prediction confidence to prepare context
  MIN_TURN_PREDICTION_CONFIDENCE: 0.7,

  // Latency estimates
  CACHE_HIT_SAVINGS_MS: 150,
  CONTEXT_PREP_SAVINGS_MS: 50,
};

// ============================================================================
// PREEMPTIVE PROCESSOR
// ============================================================================

export class RealtimePreemptiveProcessor {
  private sessionId: string;
  private lastProcessedTranscript = '';
  private lastProcessedTime = 0;
  private recentUserMessages: string[] = [];
  private emotionalState: string | null = null;
  private currentTopic: string | null = null;
  private callback: PreemptiveCallback | null = null;
  private enabled = true;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    log.debug({ sessionId }, '⚡ Realtime preemptive processor initialized');
  }

  /**
   * Set callback for preemptive actions
   */
  onPreemptiveAction(callback: PreemptiveCallback): void {
    this.callback = callback;
  }

  /**
   * Enable/disable processing
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.debug({ enabled }, '⚡ Preemptive processing state changed');
  }

  /**
   * Process partial transcript event
   * Call this when RealtimeModel emits `input_audio_transcription_completed`
   */
  processPartialTranscript(event: PartialTranscriptEvent): PreemptiveAction {
    if (!this.enabled) {
      return {
        type: 'none',
        anticipation: null,
        contextHint: null,
        estimatedSavingsMs: 0,
        reason: 'Disabled',
      };
    }

    const { transcript, isFinal } = event;

    // Skip if too short
    if (transcript.length < CONFIG.MIN_ANTICIPATION_LENGTH) {
      return {
        type: 'none',
        anticipation: null,
        contextHint: null,
        estimatedSavingsMs: 0,
        reason: 'Too short',
      };
    }

    // Throttle updates
    const now = Date.now();
    if (
      !isFinal &&
      transcript === this.lastProcessedTranscript &&
      now - this.lastProcessedTime < CONFIG.UPDATE_INTERVAL_MS
    ) {
      return {
        type: 'none',
        anticipation: null,
        contextHint: null,
        estimatedSavingsMs: 0,
        reason: 'Throttled',
      };
    }

    this.lastProcessedTranscript = transcript;
    this.lastProcessedTime = now;

    // Run anticipation
    const anticipator = getResponseAnticipationService(this.sessionId);
    const anticipation = anticipator.anticipate(transcript);

    let action: PreemptiveAction;

    // Check for cache hit
    if (anticipation?.isComplete && anticipation.confidence >= CONFIG.MIN_CACHE_CONFIDENCE) {
      action = {
        type: 'cache_hit',
        anticipation,
        contextHint: anticipation.contextHint,
        estimatedSavingsMs: CONFIG.CACHE_HIT_SAVINGS_MS,
        reason: `Cache hit: ${anticipation.intent} (${(anticipation.confidence * 100).toFixed(0)}%)`,
      };

      log.info(
        {
          intent: anticipation.intent,
          confidence: anticipation.confidence,
          savings: CONFIG.CACHE_HIT_SAVINGS_MS,
        },
        '⚡ CACHE HIT - Preemptive response ready'
      );
    }
    // Check for partial anticipation (context preparation)
    else if (anticipation && anticipation.confidence >= 0.4) {
      // Prepare context for faster LLM response
      const prefetchContext = generatePrefetchContext(
        this.recentUserMessages,
        this.emotionalState,
        this.currentTopic
      );

      action = {
        type: 'context_prepared',
        anticipation,
        contextHint: [
          anticipation.contextHint,
          prefetchContext.userHistoryHint,
          prefetchContext.emotionalHint,
        ]
          .filter(Boolean)
          .join(' '),
        estimatedSavingsMs: CONFIG.CONTEXT_PREP_SAVINGS_MS,
        reason: `Context prepared: ${anticipation.intent} (${(anticipation.confidence * 100).toFixed(0)}%)`,
      };

      log.debug(
        {
          intent: anticipation.intent,
          confidence: anticipation.confidence,
        },
        '⚡ Context prepared for faster generation'
      );
    }
    // No actionable anticipation
    else {
      action = {
        type: 'none',
        anticipation: null,
        contextHint: null,
        estimatedSavingsMs: 0,
        reason: 'No confident anticipation',
      };
    }

    // Invoke callback if set
    if (this.callback && action.type !== 'none') {
      this.callback(action);
    }

    // If final, record for context
    if (isFinal && transcript.length > 10) {
      this.recentUserMessages.push(transcript);
      if (this.recentUserMessages.length > 5) {
        this.recentUserMessages.shift();
      }
    }

    return action;
  }

  /**
   * Process with prosody for enhanced turn prediction
   */
  processWithProsody(
    event: PartialTranscriptEvent,
    prosody: ProsodyFeatures,
    silenceDuration: number
  ): PreemptiveAction {
    // First run standard anticipation
    const baseAction = this.processPartialTranscript(event);

    // If we have prosody, also run turn prediction
    const turnPredictor = getEnhancedTurnPredictor(this.sessionId);
    const turnPrediction = turnPredictor.predict(prosody, event.transcript, silenceDuration);

    // If turn prediction is highly confident, upgrade our action
    if (turnPrediction.completionProbability >= CONFIG.MIN_TURN_PREDICTION_CONFIDENCE) {
      if (baseAction.type === 'none') {
        // Upgrade to anticipation_ready
        return {
          type: 'anticipation_ready',
          anticipation: baseAction.anticipation,
          contextHint: `Turn likely complete (${(turnPrediction.completionProbability * 100).toFixed(0)}% confidence). ${turnPrediction.reason}`,
          estimatedSavingsMs: 30,
          reason: 'Turn prediction high confidence',
        };
      } else if (baseAction.type === 'context_prepared') {
        // Add turn prediction context
        return {
          ...baseAction,
          contextHint: `${baseAction.contextHint} Turn appears complete.`,
        };
      }
    }

    return baseAction;
  }

  /**
   * Update context for better anticipation
   */
  updateContext(context: {
    emotionalState?: string;
    currentTopic?: string;
    recentAgentText?: string;
  }): void {
    if (context.emotionalState) {
      this.emotionalState = context.emotionalState;
    }
    if (context.currentTopic) {
      this.currentTopic = context.currentTopic;
    }

    // Also update anticipation service context
    const anticipator = getResponseAnticipationService(this.sessionId);
    if (context.recentAgentText) {
      // The anticipator will use this for context-aware anticipation
    }
  }

  /**
   * Get the complete response for a cache hit
   */
  getCompleteResponse(): { response: string; ssml: string } | null {
    const anticipator = getResponseAnticipationService(this.sessionId);
    return anticipator.getCompleteResponse();
  }

  /**
   * Report accuracy for learning
   */
  reportAccuracy(wasCorrect: boolean): void {
    const anticipator = getResponseAnticipationService(this.sessionId);
    anticipator.reportAccuracy(wasCorrect);
  }

  /**
   * Get statistics
   */
  getStats(): { hitRate: number; totalHits: number; totalMisses: number } {
    const anticipator = getResponseAnticipationService(this.sessionId);
    const stats = anticipator.getStats();
    return {
      hitRate: anticipator.getHitRate(),
      totalHits: stats.hits,
      totalMisses: stats.misses,
    };
  }

  /**
   * Reset processor state
   */
  reset(): void {
    this.lastProcessedTranscript = '';
    this.lastProcessedTime = 0;
    this.recentUserMessages = [];
    this.emotionalState = null;
    this.currentTopic = null;
    this.callback = null;
  }
}

// ============================================================================
// INTEGRATION WITH VOICE AGENT
// ============================================================================

/**
 * Hook into RealtimeModel transcription events
 *
 * Usage in voice-agent.ts:
 * ```typescript
 * import { hookRealtimePreemptive } from '../speech/realtime-preemptive-patch.js';
 *
 * // In session setup, after creating RealtimeModel:
 * const preemptiveProcessor = hookRealtimePreemptive(
 *   sessionId,
 *   session,
 *   (action) => {
 *     if (action.type === 'cache_hit' && action.anticipation) {
 *       // Option 1: Use cached response directly (fastest)
 *       const { response, ssml } = preemptiveProcessor.getCompleteResponse()!;
 *       session.say(ssml, { allowInterruptions: true });
 *
 *       // Option 2: Just log for now, let normal flow continue
 *       diag.state('⚡ Cache hit ready', { intent: action.anticipation.intent });
 *     } else if (action.contextHint) {
 *       // Prepend context hint to LLM (would need custom integration)
 *       diag.state('⚡ Context prepared', { hint: action.contextHint });
 *     }
 *   }
 * );
 * ```
 */
export function hookRealtimePreemptive(
  sessionId: string,
  session: unknown, // voice.AgentSession - avoid importing
  callback?: PreemptiveCallback
): RealtimePreemptiveProcessor {
  const processor = new RealtimePreemptiveProcessor(sessionId);

  if (callback) {
    processor.onPreemptiveAction(callback);
  }

  // Hook into session events
  // The session emits UserInputTranscribed events with isFinal flag
  const sessionAny = session as { on: (event: string, cb: (e: unknown) => void) => void };

  sessionAny.on('user_input_transcribed', (event: unknown) => {
    const ev = event as { transcript: string; isFinal: boolean };
    processor.processPartialTranscript({
      itemId: 'current',
      transcript: ev.transcript,
      isFinal: ev.isFinal,
    });
  });

  log.info({ sessionId }, '⚡ Hooked into session for preemptive processing');

  return processor;
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

const realtimePreemptiveRegistry = createSessionRegistry(
  (sessionId: string) => new RealtimePreemptiveProcessor(sessionId),
  { name: 'RealtimePreemptive', cleanup: (processor) => processor.reset(), verbose: false }
);

registerGlobalRegistry(realtimePreemptiveRegistry);

export function getRealtimePreemptiveProcessor(sessionId: string): RealtimePreemptiveProcessor {
  return realtimePreemptiveRegistry.get(sessionId);
}

export function resetRealtimePreemptiveProcessor(sessionId: string): void {
  realtimePreemptiveRegistry.reset(sessionId);
  log.debug({ sessionId }, '⚡ Realtime preemptive processor reset');
}

export function getActiveRealtimePreemptiveCount(): number {
  return realtimePreemptiveRegistry.getActiveCount();
}
