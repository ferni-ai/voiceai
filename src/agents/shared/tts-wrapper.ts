/**
 * Shared TTS Node Wrapper
 *
 * Provides consistent TTS preprocessing for ALL persona agents:
 * - JSON function call sanitization (Gemini workaround)
 * - Interrupt-aware SSML softening
 * - FinOps cost tracking
 * - Streaming TTS optimization (aggressive chunking for low latency)
 * - Cache-aware TTS (checks speculative cache before calling Cartesia)
 *
 * This is designed to work with any agent via explicit parameter passing,
 * avoiding inheritance issues with stream types.
 *
 * @module agents/shared/tts-wrapper
 */

import { voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import {
  TransformStream as NodeTransformStream,
  type ReadableStream as NodeReadableStream,
} from 'node:stream/web';

import { createLogger } from '../../utils/safe-logger.js';
import { createSanitizerWithMusicFallback } from './tool-call-sanitizer.js';
import { finops } from '../../services/observability/finops.js';
import { GEMINI_MODEL } from '../../config/gemini-config.js';
import { createInterruptAwareTransform } from '../../speech/graceful-interrupt/speech-wrapper.js';
import {
  createStreamingTTSTransform,
  isStreamingTTSEnabled,
  getOptimizedStreamingConfig,
} from './performance/streaming-tts-transform.js';
import { createCacheAwareTTSNode } from './performance/cache-aware-tts.js';
import {
  applyPostTTSEnhancement,
  PostTTSPresets,
  type PostTTSConfig,
} from './performance/post-tts-transform.js';

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
  /** Current emotional context (for cache-aware TTS) */
  emotion?: string;
  /** User's IP-detected location for weather, local content */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };
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
  /** Enable streaming TTS optimization (default: true if env allows) */
  enableStreamingOptimization?: boolean;
  /** Is this the first turn? (enables more aggressive optimization) */
  isFirstTurn?: boolean;
  /** Enable cache-aware TTS that checks speculative cache before Cartesia (default: true) */
  enableCacheAwareTTS?: boolean;
  /** Enable "Better Than Human" post-TTS audio enhancement (default: true) */
  enablePostTTSEnhancement?: boolean;
  /** Post-TTS enhancement config (uses betterThanHuman preset by default) */
  postTTSConfig?: Partial<PostTTSConfig>;
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
  const {
    tools,
    sessionContext,
    onInterruptRecoveryApplied,
    enableStreamingOptimization = isStreamingTTSEnabled(),
    isFirstTurn = false,
    enableCacheAwareTTS = process.env.CACHE_AWARE_TTS_ENABLED !== 'false',
    enablePostTTSEnhancement = process.env.POST_TTS_ENHANCEMENT_ENABLED !== 'false',
    postTTSConfig,
  } = options;

  // Extract session context
  const userId = sessionContext?.userId;
  const sessionId = sessionContext?.sessionId || 'unknown';
  const personaId = sessionContext?.personaId || 'ferni';
  const wasInterrupted = sessionContext?.wasInterrupted;
  const interruptType = sessionContext?.interruptType;
  const emotion = sessionContext?.emotion;
  const userLocation = sessionContext?.userLocation;

  // 1. Filter JSON function calls (Gemini workaround)
  // SKIP when semantic routing is the primary tool calling method.
  // The semantic router handles tool execution BEFORE the LLM, so we don't need
  // to intercept JSON from the text stream anymore.
  const skipJsonWorkaround =
    process.env.DISABLE_JSON_WORKAROUND === 'true' ||
    process.env.SEMANTIC_ROUTING_PRIMARY === 'true';

  let filteredText: NodeReadableStream<string>;
  if (skipJsonWorkaround) {
    log.info('🎯 JSON workaround DISABLED - semantic routing is primary tool calling method');
    filteredText = text;
  } else {
    // Legacy path: intercept JSON function calls from LLM text output
    log.info('🔄 JSON workaround ACTIVE - intercepting JSON function calls from LLM output');

    // 🔍 E2E TRACE: Log raw LLM output BEFORE sanitization
    // This is CRITICAL for diagnosing tool call issues (Gemini problem pattern)
    let rawLLMBuffer = '';
    const rawLLMLogger = new NodeTransformStream<string, string>({
      transform(chunk, controller) {
        rawLLMBuffer += chunk;
        controller.enqueue(chunk);
      },
      flush() {
        // Log the complete raw LLM output for this turn
        if (rawLLMBuffer.length > 0) {
          const containsJson = rawLLMBuffer.includes('{"fn"') || rawLLMBuffer.includes('"fn":');
          const containsWeather = rawLLMBuffer.toLowerCase().includes('weather');
          const containsMusic =
            rawLLMBuffer.toLowerCase().includes('music') ||
            rawLLMBuffer.toLowerCase().includes('play');

          // Detect common Gemini problem patterns - when LLM talks ABOUT an action instead of DOING it
          const geminiProblemPatterns = [
            /let me check/i,
            /i('ll| will) (check|look|get|find)/i,
            /checking (the|your|on)/i,
            /i('m| am) having trouble/i,
            /i seem to be having.*(trouble|difficulty|issue)/i, // "I seem to be having a bit of trouble"
            /having (a bit of |some )?(trouble|difficulty|issue)/i, // generic trouble
            /i can('t|not) (access|get|check)/i,
            /unfortunately/i,
            /i('m| am) not able to/i,
            /i don't (seem to )?have access/i,
          ];
          const hasGeminiProblem = geminiProblemPatterns.some((p) => p.test(rawLLMBuffer));

          // E2E TRACE LOG - Always visible in production logs
          log.info(
            {
              trace: 'E2E_LLM_OUTPUT',
              rawOutput: rawLLMBuffer.slice(0, 500),
              fullLength: rawLLMBuffer.length,
              containsJson,
              containsWeather,
              containsMusic,
              hasGeminiProblem,
              verdict: containsJson
                ? '✅ JSON_DETECTED'
                : hasGeminiProblem
                  ? '🚨 GEMINI_PROBLEM_PATTERN'
                  : '💬 PLAIN_TEXT',
            },
            `🔍 E2E TRACE [1/4] LLM OUTPUT: ${containsJson ? 'JSON' : hasGeminiProblem ? '⚠️ GEMINI PROBLEM' : 'text'} (${rawLLMBuffer.length} chars)`
          );
        }
      },
    });

    // Merge tools with session context so sanitizer has access to userId/personaId/userLocation
    // This is needed for location-based tools (weather) and observability tracking
    const toolContext = {
      ...tools,
      userId,
      personaId,
      userLocation,
    };

    const sanitizerWithFallback = createSanitizerWithMusicFallback(
      toolContext,
      options.session,
      sessionId
    );

    // Pipe: Raw LLM → Logger → Sanitizer
    filteredText = text.pipeThrough(rawLLMLogger).pipeThrough(sanitizerWithFallback);
  }

  // 2. Apply interrupt-aware transform for softer recovery
  // Can be disabled for debugging with DISABLE_INTERRUPT_TRANSFORM=true
  const skipInterruptTransform = process.env.DISABLE_INTERRUPT_TRANSFORM === 'true';

  let interruptAwareText: NodeReadableStream<string>;
  if (skipInterruptTransform) {
    log.info('🚫 Interrupt-aware transform DISABLED for debugging');
    interruptAwareText = filteredText;
  } else {
    // Note: Cast needed because Web Streams and Node Streams have slightly different types
    interruptAwareText = filteredText.pipeThrough(
      createInterruptAwareTransform({
        wasInterrupted,
        interruptType,
        personaId,
        sessionId,
      }) as unknown as NodeTransformStream<string, string>
    );
  }

  // Clear interrupt flag after using it
  if (wasInterrupted && onInterruptRecoveryApplied) {
    onInterruptRecoveryApplied();
    log.debug('🎭 Interrupt recovery applied to streaming response');
  }

  // 3. Create cost tracking stream for FinOps + E2E Trace [4/4]
  let totalCharacters = 0;
  let ttsOutputBuffer = '';
  const costTrackingStream = new NodeTransformStream<string, string>({
    transform(chunk, controller) {
      totalCharacters += chunk.length;
      ttsOutputBuffer += chunk;
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
          model: GEMINI_MODEL, // From centralized config
          inputTokens: 0,
          outputTokens: estimatedOutputTokens,
          userId,
          sessionId,
        });

        // 🔍 E2E TRACE [4/4]: What actually goes to TTS (spoken to user)
        log.info(
          {
            trace: 'E2E_TTS_OUTPUT',
            ttsText: ttsOutputBuffer.slice(0, 300),
            fullLength: totalCharacters,
            estimatedTokens: estimatedOutputTokens,
            isEmpty: ttsOutputBuffer.trim().length === 0,
          },
          `🔍 E2E TRACE [4/4] → TTS: "${ttsOutputBuffer.slice(0, 100)}${ttsOutputBuffer.length > 100 ? '...' : ''}"`
        );
      }
    },
  });

  // 4. Chain all transforms (sanitizer → interrupt-aware → cost tracking)
  const trackedText = interruptAwareText.pipeThrough(costTrackingStream);

  // 5. Apply streaming TTS optimization for lower latency
  // This chunks the text more aggressively for faster first-audio
  let optimizedText: NodeReadableStream<string>;
  if (enableStreamingOptimization) {
    const streamingConfig = getOptimizedStreamingConfig({
      isFirstTurn,
      sessionId,
      personaId,
    });

    const streamingTransform = createStreamingTTSTransform(streamingConfig);
    optimizedText = trackedText.pipeThrough(
      streamingTransform as unknown as NodeTransformStream<string, string>
    );

    log.debug(
      { isFirstTurn, sessionId },
      '🚀 Streaming TTS optimization enabled - aggressive chunking active'
    );
  } else {
    optimizedText = trackedText;
  }

  log.debug('Sanitizer, interrupt-awareness, cost tracking, and streaming optimization attached');

  // 6. Pass to TTS implementation (cache-aware or default)
  let audioStream: NodeReadableStream<AudioFrame> | null;

  if (enableCacheAwareTTS) {
    // Use cache-aware TTS that checks speculative cache before Cartesia
    const cacheAwareTTS = createCacheAwareTTSNode({
      voiceId: personaId,
      emotion,
      sessionId,
      enableCache: true,
    });

    log.debug(
      { personaId, emotion, sessionId },
      '🎯 Cache-aware TTS enabled - will check speculative cache'
    );

    audioStream = await cacheAwareTTS(agent, optimizedText, modelSettings);
  } else {
    // Fallback to default TTS implementation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audioStream = await (voice.Agent.default as any).ttsNode(agent, optimizedText, modelSettings);
  }

  // 7. Apply "Better Than Human" post-TTS enhancement (Rust-accelerated audio processing)
  if (audioStream && enablePostTTSEnhancement) {
    const enhancementConfig = {
      ...PostTTSPresets.betterThanHuman,
      ...postTTSConfig,
      sessionId,
      personaId,
    };

    log.debug(
      { sessionId, personaId, config: enhancementConfig },
      '🦀 Applying post-TTS "Better Than Human" audio enhancement'
    );

    return applyPostTTSEnhancement(audioStream, enhancementConfig);
  }

  return audioStream;
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
  const { session } = agent;
  const userData = session?.userData as Record<string, unknown> | undefined;

  return {
    userId: userData?.userId as string | undefined,
    sessionId: userData?.sessionId as string | undefined,
    personaId: (userData?.personaId as string | undefined) || defaultPersonaId,
    wasInterrupted: userData?.wasInterrupted as boolean | undefined,
    interruptType: userData?.interruptType as 'hard' | 'soft' | undefined,
    emotion: userData?.currentEmotion as string | undefined,
    userLocation: userData?.userLocation as
      | { city?: string; regionCode?: string; countryCode?: string }
      | undefined,
  };
}

/**
 * Clear interrupt flags in agent's session userData.
 * Safe to call even if session or userData is undefined.
 */
export function clearInterruptFlags(agent: voice.Agent): void {
  const { session } = agent;
  const userData = session?.userData as Record<string, unknown> | undefined;

  if (userData) {
    userData.wasInterrupted = false;
    userData.interruptType = undefined;
  }
}

export default wrappedTtsNode;
