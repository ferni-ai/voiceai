/**
 * Shared TTS Node Wrapper
 *
 * Provides consistent TTS preprocessing for ALL persona agents:
 * - JSON function call sanitization (Gemini workaround)
 * - Interrupt-aware SSML softening
 * - FinOps cost tracking
 *
 * This is designed to work with any agent via explicit parameter passing,
 * avoiding inheritance issues with stream types.
 *
 * @module agents/shared/tts-wrapper
 */

import { voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import {
  ReadableStream as NodeReadableStream,
  TransformStream as NodeTransformStream,
} from 'node:stream/web';

import { createLogger } from '../../utils/safe-logger.js';
import { createSanitizerWithMusicFallback } from './tool-call-sanitizer.js';
import { finops } from '../../services/observability/finops.js';
import { createInterruptAwareTransform } from '../../speech/graceful-interrupt/speech-wrapper.js';

const log = createLogger({ module: 'TtsWrapper' });

// =============================================================================
// TYPES
// =============================================================================

/**
 * Session data needed for TTS processing
 */
export interface TtsSessionContext {
  userId?: string;
  sessionId?: string;
  personaId?: string;
  wasInterrupted?: boolean;
  interruptType?: 'hard' | 'soft';
}

/**
 * Options for the TTS wrapper
 */
export interface TtsWrapperOptions {
  /** Agent's tools (for sanitizer to detect function patterns) */
  tools?: Record<string, unknown>;
  /** Session context for tracking and interrupt handling */
  sessionContext?: TtsSessionContext;
  /** Callback to clear interrupt flags after use */
  onInterruptRecoveryApplied?: () => void;
  /** Voice session for speaking tool results via safeGenerateReply */
  session?: voice.AgentSession;
}

// =============================================================================
// MAIN WRAPPER FUNCTION
// =============================================================================

/**
 * Wraps TTS processing with sanitization, interrupt handling, and cost tracking.
 *
 * This is the unified TTS preprocessing that ALL persona agents should use.
 * It's designed to be called from each agent's ttsNode override without
 * relying on complex inheritance patterns.
 *
 * @param agent - The voice agent instance
 * @param text - Input text stream from LLM
 * @param modelSettings - TTS model settings
 * @param options - Processing options
 * @returns Processed audio stream, or null if no audio
 *
 * @example
 * ```typescript
 * // In any agent's ttsNode override:
 * async ttsNode(text, modelSettings) {
 *   return wrappedTtsNode(this, text, modelSettings, {
 *     tools: this._tools,
 *     sessionContext: {
 *       userId: this.session.userData?.userId,
 *       sessionId: this.session.userData?.sessionId,
 *       personaId: 'jordan-taylor',
 *       wasInterrupted: this.session.userData?.wasInterrupted,
 *       interruptType: this.session.userData?.interruptType,
 *     },
 *     onInterruptRecoveryApplied: () => {
 *       this.session.userData.wasInterrupted = false;
 *       this.session.userData.interruptType = undefined;
 *     },
 *   });
 * }
 * ```
 */
export async function wrappedTtsNode(
  agent: voice.Agent,
  text: NodeReadableStream<string>,
  modelSettings: voice.ModelSettings,
  options: TtsWrapperOptions = {}
): Promise<NodeReadableStream<AudioFrame> | null> {
  const { tools, sessionContext, onInterruptRecoveryApplied } = options;

  log.info('ttsNode wrapper called - filtering JSON function calls');

  // Extract session context
  const userId = sessionContext?.userId;
  const sessionId = sessionContext?.sessionId || 'unknown';
  const personaId = sessionContext?.personaId || 'ferni';
  const wasInterrupted = sessionContext?.wasInterrupted;
  const interruptType = sessionContext?.interruptType;

  // 1. Filter JSON function calls (Gemini workaround)
  // Pass session + sessionId so tool results can be spoken via coordinated speech
  const sanitizerWithFallback = createSanitizerWithMusicFallback(tools, options.session, sessionId);
  const filteredText = text.pipeThrough(sanitizerWithFallback);

  // 2. Apply interrupt-aware transform for softer recovery
  // Note: Cast needed because Web Streams and Node Streams have slightly different types
  const interruptAwareText = filteredText.pipeThrough(
    createInterruptAwareTransform({
      wasInterrupted,
      interruptType,
      personaId,
      sessionId,
    }) as unknown as NodeTransformStream<string, string>
  );

  // Clear interrupt flag after using it
  if (wasInterrupted && onInterruptRecoveryApplied) {
    onInterruptRecoveryApplied();
    log.debug('🎭 Interrupt recovery applied to streaming response');
  }

  // 3. Create cost tracking stream for FinOps
  let totalCharacters = 0;
  const costTrackingStream = new NodeTransformStream<string, string>({
    transform(chunk, controller) {
      totalCharacters += chunk.length;
      controller.enqueue(chunk);
    },
    flush() {
      if (totalCharacters > 0) {
        finops.recordTTSCost({
          characters: totalCharacters,
          userId,
          sessionId,
        });

        // Estimate LLM output tokens (~4 chars per token)
        const estimatedOutputTokens = Math.ceil(totalCharacters / 4);
        finops.recordLLMCost({
          model: 'gemini-2.0-flash-exp',
          inputTokens: 0,
          outputTokens: estimatedOutputTokens,
          userId,
          sessionId,
        });

        log.debug(
          { characters: totalCharacters, estimatedTokens: estimatedOutputTokens },
          'FinOps: TTS/LLM costs recorded'
        );
      }
    },
  });

  // 4. Chain all transforms
  const trackedText = interruptAwareText.pipeThrough(costTrackingStream);

  log.debug('Sanitizer, interrupt-awareness, and cost tracking attached to text stream');

  // 5. Pass to default TTS implementation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (voice.Agent.default as any).ttsNode(agent, trackedText, modelSettings);
}

// =============================================================================
// HELPER FOR EXTRACTING SESSION CONTEXT FROM AGENT
// =============================================================================

/**
 * Extract TTS session context from agent's session userData.
 * Safe to call even if session or userData is undefined.
 *
 * @param agent - Voice agent instance
 * @param defaultPersonaId - Fallback persona ID if not in session
 */
export function extractTtsSessionContext(
  agent: voice.Agent,
  defaultPersonaId: string
): TtsSessionContext {
  // Access session userData safely
  const session = agent.session;
  const userData = session?.userData as Record<string, unknown> | undefined;

  return {
    userId: userData?.userId as string | undefined,
    sessionId: userData?.sessionId as string | undefined,
    personaId: (userData?.personaId as string | undefined) || defaultPersonaId,
    wasInterrupted: userData?.wasInterrupted as boolean | undefined,
    interruptType: userData?.interruptType as 'hard' | 'soft' | undefined,
  };
}

/**
 * Clear interrupt flags in agent's session userData.
 * Safe to call even if session or userData is undefined.
 */
export function clearInterruptFlags(agent: voice.Agent): void {
  const session = agent.session;
  const userData = session?.userData as Record<string, unknown> | undefined;

  if (userData) {
    userData.wasInterrupted = false;
    userData.interruptType = undefined;
  }
}

export default wrappedTtsNode;
