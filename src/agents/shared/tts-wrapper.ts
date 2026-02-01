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
import { markTurnCheckpoint } from '../../services/performance/turn-profiler.js';
import { createSanitizerWithMusicFallback } from './sanitizer/index.js';
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
import { getLinguisticMirroring } from '../../conversation/superhuman/linguistic-mirroring.js';
// FTIS V2 mode check - when enabled, skip JSON workaround entirely
import { isFTISV2OnlyMode } from '../processors/tool-routing-integration.js';
import {
  bridgeToFerniContext,
  enrichContextFromFirestore,
  enrichContextWithMemory,
} from '../../speech/tts/ferni-tts-context-bridge.js';

// TTS Gateway integration
import {
  isTTSGatewayEnabled,
  createStreamingPipeline as createGatewayStreamingPipeline,
  extractSSMLToConfig,
  getSSMLProcessor,
  createGatewayTTSNode,
} from '../../speech/tts-gateway/index.js';

const log = createLogger({ module: 'TtsWrapper' });

// =============================================================================
// FERNI TTS CONFIGURATION
// =============================================================================

/**
 * Check if Ferni TTS (superhuman transforms) is enabled
 */
function isFerniTTSEnabled(): boolean {
  return (
    process.env.TTS_PROVIDER === 'ferni-tts' || process.env.ENABLE_FERNI_TTS_TRANSFORMS === 'true'
  );
}

// NOTE: _getFerniTTSEndpoint was removed - it was dead code (never called)

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
 * Detect if LLM is responding to a punctuation-only STT artifact.
 *
 * Sometimes Gemini's internal STT transcribes silence/noise as just "." or similar,
 * and the LLM responds with things like "You just sent a period."
 *
 * These responses should be suppressed as they're reacting to artifacts, not user intent.
 */
function detectPunctuationArtifactResponse(trimmedOutput: string): boolean {
  const lower = trimmedOutput.toLowerCase();

  // Patterns that indicate the LLM is responding to a punctuation-only artifact
  const punctuationArtifactPatterns = [
    // "You sent a period" variants
    /you (just )?(sent|typed|said) (a |an? )?\.?(period|dot|ellips|punctuation)/i,
    // "That was just a period" variants
    /(that was|that's) (just )?(a |an? )?(period|dot|ellips|punctuation)/i,
    // "Just a period?" variants
    /^(just |only )?(a |an? )?(period|dot|ellips|punctuation)\??$/i,
    // "Everything alright? You sent a period"
    /everything (alright|okay|ok)\??.*(period|dot|punctuation)/i,
    // "You just sent punctuation"
    /you (just )?(sent|typed) (some )?punctuation/i,
    // "Did you mean to send a period?"
    /did you (mean|want) to.*(period|dot|punctuation)/i,
    // "I noticed you sent a period"
    /i (noticed|saw|see) you (sent|typed).*(period|dot|punctuation)/i,
  ];

  for (const pattern of punctuationArtifactPatterns) {
    if (pattern.test(lower)) {
      return true;
    }
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
      const { recordGeminiEmptyResponse } =
        await import('../voice-agent/quality-degradation-monitor.js');
      recordGeminiEmptyResponse(sessionId);
    } catch {
      // Non-critical - just logging
    }
  }

  // Small delay to let the empty/garbage audio "complete" first
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Warm, human fallback messages (not robotic "I didn't understand")
  const fallbackMessages = [
    'Hmm, I lost my train of thought for a second there. What were you saying?',
    'Sorry, something slipped. Can you say that again?',
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
  // Cursor/Claude Code edit format - NOT a Ferni tool, indicates context contamination
  cursorEdit: ['edits', 'path', 'start_line', 'end_line'],
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
    const matchingArgs = argKeys.filter(
      (key) => leakedJson.includes(`"${key}"`) || leakedJson.includes(`"${key}":`)
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
  /** Current turn number for profiling checkpoints */
  turnNumber?: number;
  /** User's IP-detected location for weather, local content */
  userLocation?: {
    city?: string;
    regionCode?: string;
    countryCode?: string;
  };

  // =========================================================================
  // BETTER THAN HUMAN: Rich context for natural tool responses
  // =========================================================================

  /** User's name for personalized responses */
  userName?: string;
  /** What the user originally asked (from last transcript) */
  userRequest?: string;
  /** User's detected emotional state */
  userEmotion?: {
    primary?: string;
    intensity?: number;
    valence?: number;
  };
  /** Time context for awareness */
  timeContext?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | 'late-night';
    dayOfWeek?: string;
    isWeekend?: boolean;
  };
  /** Recent conversation topics for continuity */
  recentTopics?: string[];
  /** Persona display name for voice guidance */
  personaDisplayName?: string;
  /** Current conversation mode for injection tracking */
  conversationMode?: string;
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
  const turnNumber = sessionContext?.turnNumber;

  // =========================================================================
  // P1 UTO Fix (January 2026): Mark TTS start checkpoint for latency tracking
  // This enables accurate time-to-first-audio measurement
  // =========================================================================
  if (sessionId !== 'unknown' && turnNumber !== undefined) {
    markTurnCheckpoint(sessionId, turnNumber, 'ttsStart');
  }

  // 1. Filter JSON function calls (Gemini workaround)
  // SKIP when:
  // - FTIS V2 mode enabled: FTIS handles all tool calls via classification
  // - DISABLE_JSON_WORKAROUND=true: Explicitly disabled
  // - SEMANTIC_ROUTING_PRIMARY=true: Semantic router handles all tool calls
  // - Provider has native function calling (doesn't need JSON workaround)
  //
  // When a provider has native function calling (e.g., OpenAI Realtime), the LLM calls
  // functions directly via the API protocol, not by outputting JSON in text.
  // The sanitizer would just add latency with no benefit.
  //
  // When FTIS V2 is active, the system classifies user intent BEFORE the LLM responds
  // and executes tools directly. The LLM then receives tool results and responds naturally.
  const provider = getModelProvider();
  const skipJsonWorkaround =
    isFTISV2OnlyMode() || // FTIS V2 handles all tools - no JSON workaround needed
    process.env.DISABLE_JSON_WORKAROUND === 'true' ||
    process.env.SEMANTIC_ROUTING_PRIMARY === 'true' ||
    !provider.needsJsonWorkaround();

  let filteredText: NodeReadableStream<string>;
  if (skipJsonWorkaround) {
    const reason = isFTISV2OnlyMode()
      ? 'FTIS V2 mode handles all tools'
      : !provider.needsJsonWorkaround()
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

          // ========================================================================
          // CURSOR/CLAUDE CODE EDIT FORMAT PATTERNS (STRENGTHENED Jan 2026)
          // These catch IDE edit commands that should NEVER be spoken
          // Known issue: LLM sometimes hallucinates code editing format
          // ========================================================================
          // Edit object format: {"edits or [{"edits (with or without colon)
          /^\s*\[?\s*\{\s*"?edits/i,
          // Any content containing "edits" followed by bracket/brace
          /edits\s*[\[{]/i,
          // Path field: "path": "filename" or "path" "filename" or path without quotes
          /"?path"?\s*[:"]\s*"?[^"]*\.(go|ts|tsx|js|jsx|py|rs|md|json|yaml|yml)/i,
          // File paths with extensions being spoken
          /[a-zA-Z_\/][a-zA-Z0-9_\/-]*\.(go|ts|tsx|js|jsx|py|rs|md|json|yaml|yml)\b/i,
          // Line number fields: "start_line", "end_line" (with or without quotes/colons)
          /"?(start_line|end_line)"?\s*[:",]/i,
          // Line numbers in code-edit context
          /line\s*\d+/i,
          // Any chunk with both path-like and line number content
          /\.(go|ts|tsx|js|jsx|py|rs)\s+.*\d+/i,
          // Partial edit chunks: just filenames with extensions being spoken
          /^[a-zA-Z_][a-zA-Z0-9_-]*\.(go|ts|tsx|js|jsx|py|rs|md|json)\s*$/i,
          // Malformed JSON object start (opening brace with letters)
          /^\s*\{[a-zA-Z"]/,
          // XML-style code tags
          /<\/?(?:edit|path|code|file|start_line|end_line)[^>]*>/i,
        ];

        // Check if chunk looks like leaked JSON
        const looksLikeJson = jsonLeakPatterns.some((pattern) => pattern.test(chunk));

        // Also check for specific known function call argument values
        const knownArgValues = ['personal', 'medium', 'high', 'low', 'category', 'importance'];
        const hasKnownArgPattern = knownArgValues.some(
          (val) => chunk.includes(`"${val}"`) && (chunk.includes(':') || chunk.includes(','))
        );

        // Check for Cursor/Claude Code edit format specifically (STRENGTHENED Jan 2026)
        // Catches: {"edits, edits[, .go, .ts, start_line, end_line, path: "file.ext"
        const hasCursorEditPattern =
          // Core edit format
          (chunk.includes('edits') &&
            (chunk.includes('path') ||
              chunk.includes('line') ||
              chunk.includes('[') ||
              chunk.includes('{'))) ||
          // Line number fields
          chunk.includes('start_line') ||
          chunk.includes('end_line') ||
          // JSON-like edit structure
          /\{["\s]*edits/i.test(chunk) ||
          /\[\s*\{["\s]*path/i.test(chunk) ||
          // File extensions in suspicious context (not natural speech)
          /\.(go|ts|tsx|js|jsx|py|rs)\s+["\d{]/i.test(chunk) ||
          // Path with file extension
          (chunk.includes('path') && /\.(go|ts|tsx|js|jsx|py|rs|json|yaml|md)/i.test(chunk)) ||
          // Malformed JSON-like start
          /^\s*\{"?\w/.test(chunk);

        if (looksLikeJson || hasKnownArgPattern || hasCursorEditPattern) {
          // Accumulate leaked JSON for analysis
          jsonLeakBuffer += chunk;

          // Log detection for debugging context contamination
          if (hasCursorEditPattern) {
            log.warn(
              { chunk: chunk.slice(0, 100), sessionId },
              '🚨 [JSON-LEAK-FILTER] Cursor/Claude Code edit format detected - stripping'
            );
          }

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
      },
    });

    filteredText = text.pipeThrough(jsonLeakFilter);
  } else {
    // Legacy path: intercept JSON function calls from LLM text output
    log.info('🔄 JSON workaround ACTIVE - intercepting JSON function calls from LLM output');

    // 🔍 E2E TRACE: Log raw LLM output BEFORE sanitization
    // This is CRITICAL for diagnosing tool call issues (Gemini problem pattern)
    let rawLLMBuffer = '';
    let rawLLMStartTime = Date.now();
    let rawLLMChunkCount = 0;
    const rawLLMLogger = new NodeTransformStream<string, string>({
      start() {
        rawLLMStartTime = Date.now();
        log.info(
          { sessionId, personaId, trace: 'STREAM_LIFECYCLE' },
          '🔄 [0/4] Raw LLM logger stream STARTED - waiting for LLM output'
        );
      },
      transform(chunk, controller) {
        rawLLMChunkCount++;
        rawLLMBuffer += chunk;
        if (rawLLMChunkCount === 1) {
          const latencyMs = Date.now() - rawLLMStartTime;
          log.info(
            {
              sessionId,
              personaId,
              chunkLength: chunk.length,
              latencyMs,
              trace: 'STREAM_LIFECYCLE',
            },
            `🔄 [0.5/4] First LLM chunk arrived after ${latencyMs}ms: "${chunk.slice(0, 50)}..."`
          );
          // P1 UTO Fix (January 2026): Mark LLM first token checkpoint for latency tracking
          if (turnNumber !== undefined) {
            markTurnCheckpoint(sessionId, turnNumber, 'llmFirstToken');
          }
        }
        controller.enqueue(chunk);
      },
      flush() {
        // P1 UTO Fix (January 2026): Mark LLM complete checkpoint for latency tracking
        if (turnNumber !== undefined) {
          markTurnCheckpoint(sessionId, turnNumber, 'llmComplete');
        }

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
                charCodes: rawLLMBuffer
                  .slice(0, 20)
                  .split('')
                  .map((c) => c.charCodeAt(0)),
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

    // BETTER THAN HUMAN: Pass rich context for natural tool responses
    const sanitizerWithFallback = createSanitizerWithMusicFallback({
      toolContext,
      session: options.session,
      sessionId,
      userId,
      personaId,
      // Rich context for Better Than Human responses
      userName: sessionContext?.userName,
      userRequest: sessionContext?.userRequest,
      userEmotion: sessionContext?.userEmotion,
      timeContext: sessionContext?.timeContext,
      recentTopics: sessionContext?.recentTopics,
      personaDisplayName: sessionContext?.personaDisplayName,
      // BTH Feedback Loop: Conversation mode for injection tracking
      conversationMode: sessionContext?.conversationMode,
    });

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

  // 3. 🪞 BTH: Apply linguistic mirroring to match user's communication style
  // This makes Ferni "just... get me" by mirroring vocabulary, formality, and contractions
  // Must happen BEFORE cost tracking so we count the actual characters sent to TTS
  let linguisticallyMirroredText: NodeReadableStream<string>;
  const enableLinguisticMirroring =
    process.env.DISABLE_LINGUISTIC_MIRRORING !== 'true' && userId && userId !== 'anonymous';

  if (enableLinguisticMirroring) {
    const mirroringEngine = getLinguisticMirroring(userId);

    // Only apply if we've learned enough from user messages (3+ samples)
    if (mirroringEngine.hasLearnedEnough()) {
      let mirroringAppliedCount = 0;

      const linguisticMirroringTransform = new NodeTransformStream<string, string>({
        transform(chunk, controller) {
          const mirrored = mirroringEngine.applyStreamingSafeMirroring(chunk);
          if (mirrored !== chunk) {
            mirroringAppliedCount++;
          }
          controller.enqueue(mirrored);
        },
        flush() {
          if (mirroringAppliedCount > 0) {
            log.debug(
              { userId, sessionId, mirroringAppliedCount },
              '🪞 BTH: Linguistic mirroring applied to TTS stream'
            );
          }
        },
      });

      linguisticallyMirroredText = interruptAwareText.pipeThrough(linguisticMirroringTransform);
    } else {
      // Not enough samples yet - pass through
      linguisticallyMirroredText = interruptAwareText;
    }
  } else {
    // Mirroring disabled or no userId - pass through
    linguisticallyMirroredText = interruptAwareText;
  }

  // 4. Create cost tracking stream for FinOps + E2E Trace [4/4]
  // Also includes SAFETY CHECK for code-editing output that slipped through filters
  let totalCharacters = 0;
  let ttsOutputBuffer = '';
  let streamStartTime = Date.now();
  let chunkCount = 0;
  const costTrackingStream = new NodeTransformStream<string, string>({
    start() {
      streamStartTime = Date.now();
      log.info(
        { sessionId, personaId, trace: 'STREAM_LIFECYCLE' },
        '🔄 [2/4] TTS cost tracking stream STARTED'
      );
    },
    transform(chunk, controller) {
      chunkCount++;
      totalCharacters += chunk.length;
      ttsOutputBuffer += chunk;
      if (chunkCount === 1) {
        log.info(
          { sessionId, personaId, chunkLength: chunk.length, trace: 'STREAM_LIFECYCLE' },
          `🔄 [3/4] TTS stream first chunk received: "${chunk.slice(0, 50)}..."`
        );
      }
      controller.enqueue(chunk);
    },
    flush() {
      // =========================================================================
      // FIX (Jan 2026): Log when TTS stream is empty - helps diagnose "no audio" issues
      // This happens when OpenAI returns an empty response or only a function call
      // =========================================================================
      if (totalCharacters === 0) {
        log.warn(
          {
            sessionId,
            personaId,
            trace: 'E2E_TTS_EMPTY',
          },
          '⚠️ [TTS] Empty text stream - OpenAI may have returned no speech content (function call only?)'
        );
        return;
      }

      if (totalCharacters > 0) {
        // =========================================================================
        // SAFETY CHECK (Jan 2026): Detect code-editing output that slipped through
        // If the ENTIRE output looks like code/JSON, trigger garbage recovery
        // This catches cases where individual chunks looked okay but combined aren't
        // =========================================================================
        const codeEditIndicators = [
          /\{["\s]*edits/i,
          /\[\s*\{["\s]*path/i,
          /start_line.*end_line/i,
          /\.(go|ts|tsx|js|jsx|py|rs)\s*["{\d]/i,
          /^[^a-zA-Z]*\{.*path.*line/is, // JSON-like with path and line
        ];

        const looksLikeCodeEdit = codeEditIndicators.some((pattern) =>
          pattern.test(ttsOutputBuffer)
        );

        if (looksLikeCodeEdit) {
          log.error(
            {
              sessionId,
              personaId,
              outputSample: ttsOutputBuffer.slice(0, 200),
              totalLength: totalCharacters,
            },
            '🚨 [SAFETY] Full TTS output looks like code-editing format - context contamination detected'
          );

          // Note: We can't modify the stream here (chunks already enqueued), but
          // the log alert will help diagnose the issue. The garbage recovery
          // triggered by garbage response detection should catch this.
        }

        // =========================================================================
        // SAFETY CHECK (Jan 2026): Detect instruction leakage
        // If TTS output contains LLM instructions that were meant to be context
        // only (not spoken), log an error. This happens when LLM echoes instructions.
        // =========================================================================
        const instructionLeakageIndicators = [
          /A tool just executed successfully/i,
          /YOUR RESPONSE:/i,
          /PERSONA:\s*(Warm|Energetic|Calm|Professional|Creative|Wise)/i,
          /NEVER say "Status SUCCESS"/i,
          /Sound natural - like YOU did this/i,
          /Tool:\s+\w+\nResult:/i,
        ];

        const looksLikeInstructionLeak = instructionLeakageIndicators.some((pattern) =>
          pattern.test(ttsOutputBuffer)
        );

        if (looksLikeInstructionLeak) {
          log.error(
            {
              sessionId,
              personaId,
              outputSample: ttsOutputBuffer.slice(0, 300),
              totalLength: totalCharacters,
            },
            '🚨 [SAFETY] TTS output contains instruction leakage - LLM echoed context meant for prompt only'
          );
        }

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
        const streamDurationMs = Date.now() - streamStartTime;
        log.info(
          {
            trace: 'E2E_TTS_OUTPUT',
            ttsText: truncateForLog(ttsOutputBuffer, 300),
            fullLength: totalCharacters,
            estimatedTokens: estimatedOutputTokens,
            isEmpty: ttsOutputBuffer.trim().length === 0,
            chunkCount,
            streamDurationMs,
          },
          `🔍 E2E TRACE [4/4] → TTS: "${truncateForLog(ttsOutputBuffer, 100)}" (${chunkCount} chunks in ${streamDurationMs}ms)`
        );
      }
    },
  });

  // DIAGNOSTIC: Wrap the stream to detect cancellation
  // The writable side's abort signal tells us if the consumer cancelled
  const originalWritable = costTrackingStream.writable;
  const abortController = new AbortController();
  abortController.signal.addEventListener('abort', () => {
    log.warn(
      {
        sessionId,
        personaId,
        totalCharacters,
        chunkCount,
        trace: 'STREAM_CANCELLED',
        streamDurationMs: Date.now() - streamStartTime,
      },
      `🚨 [TTS STREAM CANCELLED] Stream aborted after ${chunkCount} chunks (${totalCharacters} chars) - THIS IS THE BUG!`
    );
  });

  // 5. Chain all transforms (sanitizer → interrupt-aware → mirroring → cost tracking)
  const trackedText = linguisticallyMirroredText.pipeThrough(costTrackingStream);

  // 6. Apply streaming TTS optimization for lower latency
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

  // 6. Build superhuman context for Ferni TTS transforms
  // This extracts conversation state (emotion, timezone, relationship, etc.) from session userData
  // The context is used by the 8 "Better than Human" prosody transforms
  const enableSuperhumanContext = isFerniTTSEnabled();
  let superhumanContext: ReturnType<typeof bridgeToFerniContext> | undefined;

  if (enableSuperhumanContext) {
    // Access full session userData for context extraction
    const fullUserData = agent.session?.userData as Record<string, unknown> | undefined;

    // Bridge conversation state → superhuman context
    superhumanContext = bridgeToFerniContext(fullUserData);

    // Async enrichment for relationship data (fire-and-forget to not block TTS)
    // This adds relationship stage from Firestore if not already in session
    if (userId && userId !== 'anonymous') {
      // Start async enrichment in background
      void Promise.all([
        enrichContextFromFirestore(userId, superhumanContext),
        enrichContextWithMemory(sessionId, superhumanContext),
      ])
        .then(([firestoreEnriched, memoryEnriched]) => {
          // Merge enriched data back
          Object.assign(superhumanContext!, firestoreEnriched, memoryEnriched);
          log.debug(
            {
              sessionId,
              userId,
              hasRelationshipStage: superhumanContext?.relationshipStage !== undefined,
              entityCount: superhumanContext?.rememberedEntities?.length || 0,
            },
            '🧠 Superhuman context enriched from Firestore/memory'
          );
        })
        .catch((err) => {
          log.debug({ error: String(err), sessionId }, 'Failed to enrich superhuman context');
        });
    }

    log.info(
      {
        sessionId,
        personaId,
        hasUserLocalHour: superhumanContext.userLocalHour !== undefined,
        hasRelationshipStage: superhumanContext.relationshipStage !== undefined,
        hasUserEmotion: superhumanContext.userEmotion !== undefined,
        hasUserEnergy: superhumanContext.userEnergy !== undefined,
        turnNumber: superhumanContext.turnNumber,
        userLocalHour: superhumanContext.userLocalHour,
        relationshipStage: superhumanContext.relationshipStage?.toFixed(2),
        emotion: superhumanContext.userEmotion?.[0],
        energy: superhumanContext.userEnergy?.toFixed(2),
      },
      '🦸 BTH: Superhuman context built for TTS transforms'
    );
  }

  // 7. Pass to TTS implementation (cache-aware or default)
  let audioStream: NodeReadableStream<AudioFrame> | null;

  // DIAGNOSTIC: Wrap text stream to detect cancellation
  let textStreamConsumed = false;
  let textStreamCancelled = false;
  const diagnosticTextStream = new NodeTransformStream<string, string>({
    transform(chunk, controller) {
      textStreamConsumed = true;
      controller.enqueue(chunk);
    },
    flush() {
      log.info(
        { sessionId, personaId, trace: 'STREAM_LIFECYCLE' },
        '✅ [5/4] Text stream fully consumed by TTS (flush called)'
      );
    },
  });

  // Detect when the readable side is cancelled
  const wrappedText = optimizedText.pipeThrough(diagnosticTextStream);

  // Track when stream reader is released without consuming
  const originalReader = wrappedText.getReader();
  const trackedTextStream = new ReadableStream<string>({
    async pull(controller) {
      try {
        const { value, done } = await originalReader.read();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        log.warn(
          { sessionId, personaId, error: String(err), trace: 'STREAM_CANCELLED' },
          '🚨 [TEXT STREAM ERROR] Error reading text stream'
        );
        controller.error(err);
      }
    },
    cancel(reason) {
      textStreamCancelled = true;
      log.warn(
        {
          sessionId,
          personaId,
          reason: String(reason),
          consumed: textStreamConsumed,
          trace: 'STREAM_CANCELLED',
        },
        '🚨 [TEXT STREAM CANCELLED] TTS text stream was cancelled - this explains missing audio!'
      );
      originalReader.cancel(reason);
    },
  }) as NodeReadableStream<string>;

  // 🚀 TTS GATEWAY: Use FULL gateway when enabled (highest priority)
  // This completely replaces LiveKit's internal Cartesia with our gateway
  if (isTTSGatewayEnabled()) {
    const actualVoiceId = getVoiceIdForPersona(personaId);

    log.info(
      { personaId, voiceId: actualVoiceId, emotion, sessionId },
      '🚀 Using FULL TTS Gateway - bypassing LiveKit Cartesia'
    );

    // Create gateway TTS node that:
    // 1. Collects text from stream
    // 2. Parses/strips SSML
    // 3. Checks unified cache
    // 4. On miss: calls our Cartesia provider directly
    // 5. Caches result
    // 6. Returns audio frames
    const gatewayTTS = createGatewayTTSNode({
      voiceId: actualVoiceId,
      sessionId,
      personaId,
      emotion,
      sampleRate: 24000,
      frameDurationMs: 20,
      enableCache: true,
    });

    // Use gateway for full TTS synthesis
    audioStream = await gatewayTTS(trackedTextStream);
  } else if (enableCacheAwareTTS) {
    // LEGACY PATH: Use cache-aware TTS that checks speculative cache before Cartesia
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
      '🎯 Cache-aware TTS enabled (legacy path) - will check speculative cache'
    );

    audioStream = await cacheAwareTTS(agent, trackedTextStream, modelSettings);
  } else {
    // Fallback to default TTS implementation
    // 🚀 CONSOLIDATED: Use gateway's SSMLProcessor (single source of truth)
    // This prevents SSML tags from being spoken literally by Cartesia
    const processor = getSSMLProcessor();
    const bufferTransform = processor.createBufferTransform();

    const stripTransform = new NodeTransformStream<string, string>({
      transform(chunk, controller) {
        const result = processor.parse(chunk);
        if (result.cleanText.trim()) {
          controller.enqueue(result.cleanText);
        }
      },
    });

    const ssmlStrippedStream = trackedTextStream
      .pipeThrough(bufferTransform)
      .pipeThrough(stripTransform);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audioStream = await (voice.Agent.default as any).ttsNode(
      agent,
      ssmlStrippedStream,
      modelSettings
    );
  }

  // =========================================================================
  // P1 UTO Fix (January 2026): Wrap audio stream with checkpoint markers
  // This tracks ttsFirstByte and ttsComplete for latency measurement
  // =========================================================================
  function wrapWithTTSCheckpoints(
    stream: NodeReadableStream<AudioFrame> | null
  ): NodeReadableStream<AudioFrame> | null {
    if (!stream || sessionId === 'unknown' || turnNumber === undefined) {
      return stream;
    }

    let isFirstFrame = true;
    const checkpointTransform = new NodeTransformStream<AudioFrame, AudioFrame>({
      transform(frame, controller) {
        if (isFirstFrame) {
          isFirstFrame = false;
          markTurnCheckpoint(sessionId, turnNumber!, 'ttsFirstByte');
        }
        controller.enqueue(frame);
      },
      flush() {
        markTurnCheckpoint(sessionId, turnNumber!, 'ttsComplete');
      },
    });

    return stream.pipeThrough(checkpointTransform);
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

    const enhancedStream = await applyPostTTSEnhancement(audioStream, enhancementConfig);
    return wrapWithTTSCheckpoints(enhancedStream);
  }

  return wrapWithTTSCheckpoints(audioStream);
}

// =============================================================================
// HELPER FOR EXTRACTING SESSION CONTEXT FROM AGENT
// =============================================================================

// ============================================================================
// BETTER THAN HUMAN: Context Helpers
// ============================================================================

/**
 * Persona display names for personalized voice guidance
 */
const PERSONA_DISPLAY_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'maya-santos': 'Maya',
  'peter-john': 'Peter',
  'alex-chen': 'Alex',
  'jordan-taylor': 'Jordan',
  'nayan-patel': 'Nayan',
};

/**
 * Get persona display name from persona ID
 */
function getPersonaDisplayName(personaId?: string): string | undefined {
  if (!personaId) return undefined;
  return PERSONA_DISPLAY_NAMES[personaId];
}

/**
 * Compute time context for time-aware responses
 */
function computeTimeContext(): TtsSessionContext['timeContext'] {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Determine time of day
  let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | 'late-night';
  if (hour < 6) {
    timeOfDay = 'late-night';
  } else if (hour < 12) {
    timeOfDay = 'morning';
  } else if (hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'night';
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    timeOfDay,
    dayOfWeek: dayNames[day],
    isWeekend: day === 0 || day === 6,
  };
}

/**
 * Extract TTS session context from agent's session userData.
 * Safe to call even if session or userData is undefined.
 *
 * BETTER THAN HUMAN: Includes rich context for natural tool responses:
 * - User's name for personalization
 * - Last user message (what they asked for)
 * - Emotional state from voice analysis
 * - Time of day awareness
 * - Recent conversation topics
 * - Persona display name
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
  const personaId = (userData?.personaId as string | undefined) || defaultPersonaId;

  // DIAGNOSTIC: Log when sessionId is missing or 'unknown'
  if (!extractedSessionId || extractedSessionId === 'unknown') {
    log.warn(
      {
        hasSession: !!session,
        hasUserData: !!userData,
        hasServices: !!services,
        servicesSessionId: services?.sessionId,
        userDataSessionId: userData?.sessionId,
        personaId,
        userDataKeys: userData ? Object.keys(userData).slice(0, 10) : [],
      },
      '⚠️ [HANDOFF-DEBUG] sessionId extraction failed - check userData.services'
    );
  }

  // Extract voice emotion data if available
  const voiceEmotion = userData?.voiceEmotion as
    | {
        primary?: string;
        intensity?: number;
        valence?: number;
      }
    | undefined;

  // Extract last emotion analysis as fallback
  const lastEmotionAnalysis = userData?.lastEmotionAnalysis as
    | {
        primary?: string;
        intensity?: number;
      }
    | undefined;

  return {
    // Core session info
    userId: userData?.userId as string | undefined,
    sessionId: extractedSessionId,
    personaId,
    wasInterrupted: userData?.wasInterrupted as boolean | undefined,
    interruptType: userData?.interruptType as 'hard' | 'soft' | undefined,
    emotion: userData?.currentEmotion as string | undefined,
    userLocation: userData?.userLocation as
      | { city?: string; regionCode?: string; countryCode?: string }
      | undefined,
    // Turn number for profiling checkpoints (P1 UTO Fix - January 2026)
    turnNumber:
      (userData?.turnCount as number | undefined) ?? (userData?.turnNumber as number | undefined),

    // =========================================================================
    // BETTER THAN HUMAN: Rich context for natural tool responses
    // =========================================================================

    // User's name for personalized responses
    userName: (userData?.userName as string | undefined) || (userData?.name as string | undefined),

    // What the user originally asked (from last transcript)
    userRequest: userData?.lastUserMessage as string | undefined,

    // User's detected emotional state (prefer voice emotion, fallback to last analysis)
    userEmotion:
      voiceEmotion || lastEmotionAnalysis
        ? {
            primary: voiceEmotion?.primary || lastEmotionAnalysis?.primary,
            intensity: voiceEmotion?.intensity || lastEmotionAnalysis?.intensity,
            valence: voiceEmotion?.valence,
          }
        : undefined,

    // Time context for awareness
    timeContext: computeTimeContext(),

    // Recent conversation topics for continuity (last 3)
    recentTopics: (userData?.recentTopics as string[] | undefined)?.slice(0, 3),

    // Persona display name for voice guidance
    personaDisplayName: getPersonaDisplayName(personaId),
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
