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

import { createLogger, truncateForLog } from '../../utils/safe-logger.js';
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
import { getVoiceIdForPersona } from '../../config/voice-ids.js';
import { getModelProvider } from '../model-provider/index.js';

const log = createLogger({ module: 'TtsWrapper' });

// =============================================================================
// GARBAGE RESPONSE DETECTION & RECOVERY
// =============================================================================

/**
 * Detect if LLM output is garbage/meaningless.
 *
 * Garbage responses include:
 * - Empty or whitespace-only
 * - Just punctuation (like ".")
 * - Very short non-words (< 3 meaningful chars)
 * - Just "..." or similar filler
 *
 * These indicate Gemini went into a bad state and needs recovery.
 */
function detectGarbageResponse(trimmedOutput: string): boolean {
  // Empty or whitespace only
  if (!trimmedOutput || trimmedOutput.length === 0) {
    return true;
  }

  // Just punctuation (. , ! ? ... etc)
  const punctuationOnly = /^[.,!?;:\-–—…'"()[\]{}]+$/;
  if (punctuationOnly.test(trimmedOutput)) {
    return true;
  }

  // Very short meaningless output (< 3 chars after removing punctuation)
  const withoutPunctuation = trimmedOutput.replace(/[.,!?;:\-–—…'"()[\]{}]/g, '').trim();
  if (withoutPunctuation.length < 3) {
    return true;
  }

  // Just ellipsis variants
  if (/^\.{2,}$/.test(trimmedOutput) || trimmedOutput === '...' || trimmedOutput === '…') {
    return true;
  }

  return false;
}

/**
 * Trigger recovery when garbage response is detected.
 *
 * This speaks a brief fallback message to maintain conversation flow
 * while Gemini recovers (or we prepare for another turn).
 */
async function triggerGarbageRecovery(
  session: voice.AgentSession,
  sessionId: string | undefined,
  personaId: string | undefined
): Promise<void> {
  // Record this as a quality degradation event
  if (sessionId) {
    try {
      const { recordGeminiEmptyResponse } = await import(
        '../voice-agent/quality-degradation-monitor.js'
      );
      recordGeminiEmptyResponse(sessionId);
    } catch {
      // Non-critical - just logging
    }
  }

  // Small delay to let the empty/garbage audio "complete" first
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Warm, human fallback messages (not robotic "I didn't understand")
  const fallbackMessages = [
    "Hmm, I lost my train of thought for a second there. What were you saying?",
    "Sorry, something slipped. Can you say that again?",
    "My mind wandered for a moment. I'm back - what's up?",
    "Oops, I got a little distracted. I'm here now.",
  ];

  const fallback = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];

  log.info(
    { sessionId, personaId, fallback: fallback.slice(0, 50) },
    '🔄 GARBAGE RECOVERY: Speaking fallback message'
  );

  try {
    // Use session.say() to speak the fallback directly
    // This bypasses generateReply which might also be timing out
    await session.say(fallback, { allowInterruptions: true });
  } catch (err) {
    log.error(
      { error: String(err), sessionId },
      '🔄 GARBAGE RECOVERY: session.say() failed, conversation may be stuck'
    );
  }
}

// =============================================================================
// JSON LEAK ANALYSIS (OpenAI Realtime SDK Bug Workaround)
// =============================================================================

/**
 * Known tool argument keys that commonly appear in leaked JSON.
 * Used to identify which tool's function call leaked.
 */
const TOOL_ARG_SIGNATURES: Record<string, string[]> = {
  rememberAboutUser: ['fact', 'category', 'importance'],
  addTask: ['title', 'description', 'dueDate', 'priority'],
  playMusic: ['query', 'genre', 'artist', 'mood'],
  getWeather: ['location', 'units'],
  setReminder: ['message', 'time', 'recurring'],
  handoff: ['targetPersona', 'reason', 'context'],
};

/**
 * Analyze leaked JSON to extract useful debugging info.
 * 
 * Attempts to identify:
 * - Which tool's function call leaked
 * - What arguments were included
 * - Any patterns that might help debug the SDK issue
 */
function analyzeLeakedJson(leakedJson: string): {
  probableTool?: string;
  detectedArgs: string[];
  isPartialJson: boolean;
  hasClosingBrace: boolean;
} {
  const detectedArgs: string[] = [];
  let probableTool: string | undefined;
  
  // Check for known argument keys
  for (const [toolName, argKeys] of Object.entries(TOOL_ARG_SIGNATURES)) {
    const matchingArgs = argKeys.filter(key => 
      leakedJson.includes(`"${key}"`) || leakedJson.includes(`"${key}":`)
    );
    
    if (matchingArgs.length > 0) {
      detectedArgs.push(...matchingArgs);
      // Tool with most matching args is probably the source
      if (!probableTool || matchingArgs.length > (TOOL_ARG_SIGNATURES[probableTool]?.length || 0)) {
        probableTool = toolName;
      }
    }
  }
  
  // Check for common argument values (helps identify even if keys don't match)
  const commonValues = ['personal', 'work', 'health', 'high', 'medium', 'low'];
  for (const value of commonValues) {
    if (leakedJson.includes(`"${value}"`)) {
      detectedArgs.push(`value:${value}`);
    }
  }
  
  return {
    probableTool,
    detectedArgs: [...new Set(detectedArgs)], // Dedupe
    isPartialJson: !leakedJson.includes('{') || !leakedJson.includes('}'),
    hasClosingBrace: leakedJson.includes('}'),
  };
}

/**
 * Record telemetry about JSON leaks for observability.
 * 
 * Uses structured logging that can be picked up by log aggregation systems.
 * This helps us:
 * - Track how often the OpenAI Realtime SDK leaks function calls
 * - Identify which tools are most affected
 * - Potentially report patterns to LiveKit
 */
async function recordJsonLeakTelemetry(
  sessionId: string | undefined,
  personaId: string | undefined,
  leakedJson: string,
  analysis: ReturnType<typeof analyzeLeakedJson>
): Promise<void> {
  // Use structured logging for telemetry (picked up by log aggregation)
  // This is the standard approach in this codebase - logs go to GCP Cloud Logging
  log.info(
    {
      metric: 'openai_realtime_json_leak',
      sessionId: sessionId || 'unknown',
      personaId: personaId || 'unknown',
      probableTool: analysis.probableTool || 'unknown',
      detectedArgs: analysis.detectedArgs.slice(0, 5),
      isPartialJson: analysis.isPartialJson,
      hasClosingBrace: analysis.hasClosingBrace,
      leakLength: leakedJson.length,
      // Include sanitized sample for debugging (no PII - just JSON structure)
      leakSample: leakedJson.slice(0, 100).replace(/[a-zA-Z]{4,}/g, 'xxx'),
    },
    '📊 [TELEMETRY] OpenAI Realtime JSON leak detected'
  );
}

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
 *       // IMPORTANT: sessionId lives in userData.services, not directly on userData
 *       sessionId: this.session.userData?.services?.sessionId,
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
  // SKIP when:
  // - DISABLE_JSON_WORKAROUND=true: Explicitly disabled
  // - SEMANTIC_ROUTING_PRIMARY=true: Semantic router handles all tool calls
  // - Provider has native function calling (doesn't need JSON workaround)
  //
  // When a provider has native function calling (e.g., OpenAI Realtime), the LLM calls
  // functions directly via the API protocol, not by outputting JSON in text.
  // The sanitizer would just add latency with no benefit.
  const provider = getModelProvider();
  const skipJsonWorkaround =
    process.env.DISABLE_JSON_WORKAROUND === 'true' ||
    process.env.SEMANTIC_ROUTING_PRIMARY === 'true' ||
    !provider.needsJsonWorkaround();

  let filteredText: NodeReadableStream<string>;
  if (skipJsonWorkaround) {
    const reason = !provider.needsJsonWorkaround()
      ? `${provider.displayName} has native function calling`
      : process.env.SEMANTIC_ROUTING_PRIMARY === 'true'
        ? 'semantic routing is primary'
        : 'explicitly disabled';
    log.info(`${provider.getLogPrefix()} JSON workaround DISABLED - ${reason}`);
    
    // BUG FIX: Even with native function calling, OpenAI Realtime can sometimes
    // leak function call JSON into the text stream (race condition in SDK or model).
    // Add a lightweight filter to strip JSON-like content that shouldn't be spoken.
    // 
    // Observed pattern: When model outputs BOTH text AND function call in same response,
    // part of the function call args leak into text:
    //   'tomorrow",  \n  "category": "personal",  \n  "importance": "medium" \n}'
    //
    // This filter catches and strips such leaks without the full JSON workaround overhead.
    // We also capture telemetry to track this SDK/model behavior.
    let jsonLeakBuffer = ''; // Accumulate leaked chunks for analysis
    
    const jsonLeakFilter = new NodeTransformStream<string, string>({
      transform(chunk, controller) {
        // Patterns that indicate leaked function call JSON (not natural speech)
        // These are structural JSON patterns that would never appear in speech
        const jsonLeakPatterns = [
          // Partial JSON object end: '"key": "value" }' or '"key": "value"\n}'
          /"\s*[:,]\s*\n?\s*"[^"]+"\s*\n?\s*\}?\s*$/,
          // JSON key-value pairs on multiple lines
          /"\s*:\s*"[^"]+"\s*,?\s*\n\s*"/,
          // Starts with a quote and colon (mid-JSON)
          /^"\s*[:,]/,
          // JSON closing brace with quotes before it
          /"\s*\n?\s*\}\s*\n?\s*$/,
          // Line that's just "key": "value" format
          /^\s*"[a-z_]+"\s*:\s*"[^"]+"\s*,?\s*$/i,
          // Function call argument patterns (category, importance, fact, etc.)
          /"\s*(category|importance|fact|medium|high|low|personal)"\s*[:,]/i,
        ];
        
        // Check if chunk looks like leaked JSON
        const looksLikeJson = jsonLeakPatterns.some(pattern => pattern.test(chunk));
        
        // Also check for specific known function call argument values
        const knownArgValues = ['personal', 'medium', 'high', 'low', 'category', 'importance'];
        const hasKnownArgPattern = knownArgValues.some(val => 
          chunk.includes(`"${val}"`) && (chunk.includes(':') || chunk.includes(','))
        );
        
        if (looksLikeJson || hasKnownArgPattern) {
          // Accumulate leaked JSON for analysis
          jsonLeakBuffer += chunk;
          
          // Don't enqueue - strip from TTS stream
          return;
        }
        
        // Clean chunk: pass through to TTS
        controller.enqueue(chunk);
      },
      flush() {
        // Analyze accumulated leaked JSON at end of stream
        if (jsonLeakBuffer.length > 0) {
          // Try to extract useful info from the leaked JSON
          const extractedInfo = analyzeLeakedJson(jsonLeakBuffer);
          
          // Log with structured data for observability
          log.warn(
            { 
              leakedJson: jsonLeakBuffer.slice(0, 200),
              leakLength: jsonLeakBuffer.length,
              sessionId,
              personaId,
              ...extractedInfo,
            },
            '🚨 [JSON-LEAK-FILTER] Stripped leaked function call JSON from TTS stream'
          );
          
          // Record telemetry for tracking this SDK behavior
          // Fire-and-forget to avoid blocking TTS
          recordJsonLeakTelemetry(sessionId, personaId, jsonLeakBuffer, extractedInfo).catch(() => {
            // Non-critical - ignore errors
          });
        }
      }
    });
    
    filteredText = text.pipeThrough(jsonLeakFilter);
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

          // 🚨 GARBAGE RESPONSE DETECTION - LLM output too short/empty to be meaningful
          // This catches cases where Gemini outputs just ".", punctuation, or near-empty text
          const trimmedOutput = rawLLMBuffer.trim();
          const isGarbageResponse = detectGarbageResponse(trimmedOutput);

          // E2E TRACE LOG - Always visible in production logs
          // Use truncateForLog() to respect LOG_FULL_RESPONSES env var
          log.info(
            {
              trace: 'E2E_LLM_OUTPUT',
              rawOutput: truncateForLog(rawLLMBuffer, 500),
              fullLength: rawLLMBuffer.length,
              containsJson,
              containsWeather,
              containsMusic,
              hasGeminiProblem,
              isGarbageResponse,
              verdict: containsJson
                ? '✅ JSON_DETECTED'
                : isGarbageResponse
                  ? '🚨 GARBAGE_RESPONSE'
                  : hasGeminiProblem
                    ? '🚨 GEMINI_PROBLEM_PATTERN'
                    : '💬 PLAIN_TEXT',
            },
            `🔍 E2E TRACE [1/4] LLM OUTPUT: ${containsJson ? 'JSON' : isGarbageResponse ? '🚨 GARBAGE' : hasGeminiProblem ? '⚠️ GEMINI PROBLEM' : 'text'} (${rawLLMBuffer.length} chars)`
          );

          // 🚨 GARBAGE RECOVERY: If LLM output is garbage, trigger fallback
          // This fires async - doesn't block stream completion
          if (isGarbageResponse && options.session) {
            // Log detailed context for debugging
            log.error(
              {
                sessionId,
                rawOutput: rawLLMBuffer,
                trimmedOutput,
                trimmedLength: trimmedOutput.length,
                rawLength: rawLLMBuffer.length,
                containsJson,
                containsMusic,
                hasGeminiProblem,
                personaId,
                // Character codes to see invisible chars
                charCodes: rawLLMBuffer.slice(0, 20).split('').map(c => c.charCodeAt(0)),
              },
              '🚨 GARBAGE RESPONSE DETECTED - Gemini output is meaningless!'
            );

            // Fire-and-forget: speak a fallback message
            // This runs after the empty/garbage audio completes
            triggerGarbageRecovery(options.session, sessionId, personaId).catch((err) => {
              log.error({ error: String(err) }, 'Garbage recovery failed');
            });
          }

          // V3.2: Track Ferni's commitments in her response
          // This catches when Ferni says things like "I'll check in about that" or "Let me know how it goes"
          // Fire-and-forget to not block TTS stream
          if (userId && userId !== 'anonymous' && rawLLMBuffer.length > 10 && !isGarbageResponse) {
            import('../../services/superhuman/semantic-intelligence/integration.js')
              .then(({ trackFerniCommitments }) => {
                trackFerniCommitments(userId, rawLLMBuffer, {
                  // Context is minimal in TTS wrapper, but commitments will still be detected
                });
              })
              .catch((err) => {
                // Non-critical - don't block TTS
                log.debug({ error: String(err), sessionId }, 'Failed to track Ferni commitments');
              });
          }
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
        // Use truncateForLog() to respect LOG_FULL_RESPONSES env var
        log.info(
          {
            trace: 'E2E_TTS_OUTPUT',
            ttsText: truncateForLog(ttsOutputBuffer, 300),
            fullLength: totalCharacters,
            estimatedTokens: estimatedOutputTokens,
            isEmpty: ttsOutputBuffer.trim().length === 0,
          },
          `🔍 E2E TRACE [4/4] → TTS: "${truncateForLog(ttsOutputBuffer, 100)}"`
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
    // BUG FIX: Convert personaId to actual Cartesia voice UUID
    // Previously passed personaId directly, causing cache misses and wrong voice lookups
    const actualVoiceId = getVoiceIdForPersona(personaId);
    const cacheAwareTTS = createCacheAwareTTSNode({
      voiceId: actualVoiceId,
      emotion,
      sessionId,
      enableCache: true,
    });

    log.debug(
      { personaId, voiceId: actualVoiceId, emotion, sessionId },
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

  // BUG FIX: sessionId lives in userData.services.sessionId, NOT userData.sessionId!
  // UserData has services?: SessionServices, and SessionServices has sessionId: string.
  // Previously this was always returning undefined, causing sessionId: 'unknown' in handoffs.
  const services = userData?.services as { sessionId?: string } | undefined;
  const extractedSessionId = services?.sessionId ?? (userData?.sessionId as string | undefined);

  // DIAGNOSTIC: Log when sessionId is missing or 'unknown'
  if (!extractedSessionId || extractedSessionId === 'unknown') {
    log.warn(
      {
        hasSession: !!session,
        hasUserData: !!userData,
        hasServices: !!services,
        servicesSessionId: services?.sessionId,
        userDataSessionId: userData?.sessionId,
        personaId: defaultPersonaId,
        userDataKeys: userData ? Object.keys(userData).slice(0, 10) : [],
      },
      '⚠️ [HANDOFF-DEBUG] sessionId extraction failed - check userData.services'
    );
  }

  return {
    userId: userData?.userId as string | undefined,
    sessionId: extractedSessionId,
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
