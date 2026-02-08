/**
 * Gateway-Integrated TTS Node
 *
 * Provides a ttsNode implementation that uses the TTS Gateway for all synthesis.
 * This replaces LiveKit's internal Cartesia with our gateway, enabling:
 *
 * 1. Unified caching - All TTS goes through our cache
 * 2. SSML processing - Gateway handles all SSML parsing/stripping
 * 3. Prosody control - Gateway extracts prosody and applies to API
 * 4. E2E tracing - Full observability of TTS pipeline
 * 5. Cost tracking - Accurate FinOps for TTS calls
 *
 * Flow:
 * ```
 * Text Stream → Collect → Check Cache → Hit? → Split to Frames → Stream
 *                              ↓ Miss
 *                     Gateway.synthesize() → Cache → Split to Frames → Stream
 * ```
 *
 * @module speech/tts-gateway/gateway-tts-node
 */

import type { AudioFrame } from '@livekit/rtc-node';
import { createRequire } from 'node:module';
import { ReadableStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';

import { createLogger, truncateForLog } from '../../utils/safe-logger.js';
import {
  stripInstructionBlocks,
  containsInstructionBlocks,
  stripGuidanceBlocks,
  containsGuidanceBlocks,
} from '../../utils/text-sanitization.js';

// FIX (Jan 2026): Create require for ESM compatibility
// ESM doesn't have global require, so we create one for dynamic imports
const require = createRequire(import.meta.url);
import { getTTSCache } from '../../services/tts/index.js';
import { getCartesiaProvider } from './providers/index.js';
import { getSSMLProcessor } from './ssml/index.js';
import type { SSMLProsodyConfig } from './types.js';

// ============================================================================
// JSON FUNCTION CALL FILTERING
// ============================================================================

/**
 * Pattern to detect JSON function calls that should NOT be spoken.
 *
 * These patterns catch:
 * - Complete JSON: `{"fn":"toolName","args":{...}}`
 * - Partial JSON (streaming): `{"fn":"
 * - With backticks: `` `{"fn":"
 *
 * FIX (Jan 2026): Prevents tool call leakage to TTS when LLM outputs
 * another function call instead of speaking naturally.
 */
const JSON_FUNCTION_CALL_PATTERNS = [
  // Complete or partial JSON function call
  /^\s*`?\s*\{\s*"fn"\s*:/i,
  // Just the opening of a function call
  /^\s*`?\s*\{\s*["']fn["']/i,
  // Backtick-wrapped JSON
  /^`\s*\{/,
];

/**
 * Check if text is a JSON function call that should not be spoken.
 *
 * This catches both complete and partial JSON function calls.
 * Even partial JSON like `{"fn":"` should NOT be spoken.
 */
function isJsonFunctionCall(text: string): boolean {
  const trimmed = text.trim();

  // Empty or very short - not a function call
  if (trimmed.length < 5) {
    return false;
  }

  // Check for JSON function call patterns
  for (const pattern of JSON_FUNCTION_CALL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  // Additional check: starts with backtick + brace (common LLM output)
  if (trimmed.startsWith('`{') || trimmed.startsWith('` {')) {
    return true;
  }

  return false;
}

/**
 * Check if the TTS Gateway is enabled.
 * Set USE_TTS_GATEWAY=false to disable (enabled by default).
 */
function isTTSGatewayEnabled(): boolean {
  return process.env.USE_TTS_GATEWAY !== 'false';
}

const log = createLogger({ module: 'GatewayTTSNode' });

// ============================================================================
// TYPES
// ============================================================================

export interface GatewayTTSNodeConfig {
  /** Voice ID (Cartesia UUID or persona name) */
  voiceId: string;
  /** Session ID for tracing */
  sessionId?: string;
  /** Persona ID for logging */
  personaId?: string;
  /** Initial emotion hint */
  emotion?: string;
  /** Sample rate for audio frames (default: 24000) */
  sampleRate?: number;
  /** Frame duration in ms (default: 20) */
  frameDurationMs?: number;
  /** Enable caching (default: true) */
  enableCache?: boolean;
  /** Timeout for synthesis in ms (default: 30000) */
  timeoutMs?: number;
  /**
   * Enable speculative synthesis (default: false)
   *
   * When enabled, synthesis starts in parallel with cache lookup.
   * This reduces latency on cache misses but increases API costs on cache hits.
   * Recommended only for latency-critical scenarios with low cache hit rates.
   *
   * TODO (LATENCY-OPT): Implement streaming synthesis for true "better than human" latency.
   * Current architecture collects all text before synthesis. With streaming:
   * 1. Start synthesis on first sentence/chunk
   * 2. Stream audio frames as they arrive
   * 3. Continue synthesis with subsequent chunks
   * This would give ~200-400ms faster time-to-first-audio.
   */
  enableSpeculativeSynthesis?: boolean;
}

export interface GatewayTTSMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  gatewaySyntheses: number;
  avgCacheHitLatencyMs: number;
  avgSynthesisLatencyMs: number;
  totalSavedLatencyMs: number;
  errors: number;
}

// ============================================================================
// METRICS
// ============================================================================

const metrics: GatewayTTSMetrics = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  gatewaySyntheses: 0,
  avgCacheHitLatencyMs: 0,
  avgSynthesisLatencyMs: 0,
  totalSavedLatencyMs: 0,
  errors: 0,
};

const cacheHitLatencies: number[] = [];
const synthesisLatencies: number[] = [];

export function getGatewayTTSMetrics(): GatewayTTSMetrics {
  return { ...metrics };
}

export function resetGatewayTTSMetrics(): void {
  metrics.totalRequests = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.gatewaySyntheses = 0;
  metrics.avgCacheHitLatencyMs = 0;
  metrics.avgSynthesisLatencyMs = 0;
  metrics.totalSavedLatencyMs = 0;
  metrics.errors = 0;
  cacheHitLatencies.length = 0;
  synthesisLatencies.length = 0;
}

// ============================================================================
// AUDIO FRAME CONVERSION
// ============================================================================

/**
 * Convert PCM ArrayBuffer to AudioFrame stream
 *
 * LiveKit expects audio frames of 20-100ms for smooth streaming.
 * We split the audio buffer into frames of the specified duration.
 */
function* splitIntoFrames(
  buffer: ArrayBuffer,
  sampleRate: number,
  frameDurationMs: number
): Generator<AudioFrame> {
  // Dynamic import to avoid issues when AudioFrame isn't available
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AudioFrame } = require('@livekit/rtc-node') as {
    AudioFrame: typeof import('@livekit/rtc-node').AudioFrame;
  };

  const bytesPerSample = 2; // 16-bit PCM
  const samplesPerFrame = Math.floor((sampleRate * frameDurationMs) / 1000);
  const bytesPerFrame = samplesPerFrame * bytesPerSample;

  let offset = 0;
  while (offset < buffer.byteLength) {
    const frameSize = Math.min(bytesPerFrame, buffer.byteLength - offset);
    const frameBuffer = buffer.slice(offset, offset + frameSize);
    const samplesPerChannel = frameSize / bytesPerSample;

    const int16Data = new Int16Array(frameBuffer);
    yield new AudioFrame(int16Data, sampleRate, 1, samplesPerChannel);

    offset += frameSize;
  }
}

/**
 * Create an empty, already-completed stream for when there's no audio to play.
 *
 * This is important for LiveKit SDK compatibility - returning `null` can cause
 * "WritableStream is closed" errors because the SDK tries to close streams
 * that are already closed. An empty completed stream is handled gracefully.
 */
function createEmptyAudioStream(): NodeReadableStream<AudioFrame> {
  return new ReadableStream<AudioFrame>({
    start(controller) {
      // Immediately close - no audio to play
      controller.close();
    },
  }) as NodeReadableStream<AudioFrame>;
}

/**
 * Create a ReadableStream of AudioFrames from an ArrayBuffer
 *
 * Paces the frames to maintain natural playback speed.
 */
function createAudioFrameStream(
  buffer: ArrayBuffer,
  sampleRate: number,
  frameDurationMs: number
): NodeReadableStream<AudioFrame> {
  const frames = [...splitIntoFrames(buffer, sampleRate, frameDurationMs)];
  let frameIndex = 0;
  let cancelled = false;

  return new ReadableStream<AudioFrame>({
    async pull(controller) {
      if (cancelled || frameIndex >= frames.length) {
        controller.close();
        return;
      }

      controller.enqueue(frames[frameIndex]);
      frameIndex++;

      // Pace frames to avoid buffer overflow (slightly faster than realtime)
      if (frameIndex < frames.length) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, frameDurationMs * 0.8);
        });
      }
    },
    cancel() {
      cancelled = true;
    },
  }) as NodeReadableStream<AudioFrame>;
}

// ============================================================================
// GATEWAY TTS NODE
// ============================================================================

/**
 * Create a gateway-integrated TTS node
 *
 * This function returns a TTS processor that:
 * 1. Collects text from the input stream
 * 2. Checks the unified cache
 * 3. On miss, calls the gateway's Cartesia provider
 * 4. Returns audio frames for LiveKit to play
 *
 * @param config - Configuration for the TTS node
 * @returns Function that processes text stream to audio frame stream
 */
export function createGatewayTTSNode(
  config: GatewayTTSNodeConfig
): (textStream: NodeReadableStream<string>) => Promise<NodeReadableStream<AudioFrame> | null> {
  const {
    voiceId,
    sessionId,
    personaId,
    emotion,
    sampleRate = 24000,
    frameDurationMs = 20,
    enableCache = true,
    timeoutMs = 30000,
    enableSpeculativeSynthesis = false,
  } = config;

  // Get gateway components
  const cache = getTTSCache();
  const provider = getCartesiaProvider();
  const ssmlProcessor = getSSMLProcessor();

  return async (
    textStream: NodeReadableStream<string>
  ): Promise<NodeReadableStream<AudioFrame> | null> => {
    const startTime = Date.now();
    metrics.totalRequests++;

    // =========================================================================
    // 1. COLLECT TEXT FROM STREAM
    // =========================================================================
    // We need the full text to check cache and synthesize
    // For streaming TTS, we'd need chunked synthesis (future enhancement)

    let fullText = '';
    const reader = textStream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += value;
      }
    } finally {
      reader.releaseLock();
    }

    if (!fullText.trim()) {
      log.debug({ sessionId, personaId }, 'Empty text stream, skipping TTS');
      // Return empty completed stream instead of null to avoid LiveKit SDK errors
      // ("WritableStream is closed" when SDK tries to close already-closed streams)
      return createEmptyAudioStream();
    }

    log.info(
      {
        text: truncateForLog(fullText, 100),
        voiceId,
        sessionId,
        personaId,
        trace: 'GATEWAY_TTS_START',
      },
      `🚀 Gateway TTS: Processing "${truncateForLog(fullText, 50)}"`
    );

    // =========================================================================
    // 2. PARSE SSML AND EXTRACT PROSODY
    // =========================================================================

    const ssmlResult = ssmlProcessor.parse(fullText);
    const cleanText = ssmlResult.cleanText;

    if (!cleanText.trim()) {
      log.debug(
        { sessionId, originalText: truncateForLog(fullText, 50) },
        'Empty text after SSML strip'
      );
      // Return empty completed stream instead of null to avoid LiveKit SDK errors
      // ("WritableStream is closed" when SDK tries to close already-closed streams)
      return createEmptyAudioStream();
    }

    // =========================================================================
    // 2.5. FILTER JSON FUNCTION CALLS (FIX Jan 2026)
    // =========================================================================
    // Prevent tool call leakage to TTS. When LLM outputs JSON function calls
    // like `{"fn":"getNews","args":{}}` instead of speaking naturally,
    // we MUST NOT send this to TTS or the user hears gibberish.
    //
    // This catches:
    // - Complete JSON: `{"fn":"toolName","args":{}}`
    // - Partial JSON (streaming): `{"fn":"
    // - With backticks: `` `{"fn":"

    if (isJsonFunctionCall(cleanText)) {
      log.warn(
        {
          text: truncateForLog(cleanText, 100),
          fullText: truncateForLog(fullText, 100),
          sessionId,
          personaId,
          trace: 'GATEWAY_TTS_JSON_FILTERED',
        },
        '🚫 Gateway TTS: Filtered JSON function call - NOT speaking this'
      );
      // Return empty completed stream instead of null to avoid LiveKit SDK errors
      return createEmptyAudioStream();
    }

    // =========================================================================
    // 2.6. STRIP INSTRUCTION BLOCKS (FIX Jan 2026)
    // =========================================================================
    // Final safety net: Strip instruction blocks like [TYPE: presence], [TONE: warm]
    // that Gemini sometimes echoes back from the prompt.
    //
    // This catches:
    // - [SITUATION: 15s silence | User's name: seth]
    // - [TYPE: presence] → [MAX: 8 words] [TONE: warm]
    // - [OUTPUT: plain text only, no quotes, no meta-commentary]

    let finalText = cleanText;
    if (containsInstructionBlocks(cleanText)) {
      finalText = stripInstructionBlocks(cleanText);
      log.warn(
        {
          original: truncateForLog(cleanText, 100),
          cleaned: truncateForLog(finalText, 100),
          sessionId,
          personaId,
          trace: 'GATEWAY_TTS_INSTRUCTION_STRIPPED',
        },
        '🚫 Gateway TTS: Stripped instruction blocks from speech'
      );

      // If nothing remains after stripping, return empty
      if (!finalText.trim()) {
        log.debug({ sessionId }, 'Empty text after instruction stripping');
        return createEmptyAudioStream();
      }
    }

    // Second pass: strip guidance blocks (<system>, <guidance>, <internal> tags etc.)
    // This catches patterns that stripInstructionBlocks doesn't know about.
    // Both passes are idempotent and O(n) (Rust-accelerated Aho-Corasick when available).
    if (containsGuidanceBlocks(finalText)) {
      const guidanceStripped = stripGuidanceBlocks(finalText);
      if (guidanceStripped !== finalText) {
        log.warn(
          {
            sessionId,
            personaId,
            trace: 'GATEWAY_TTS_GUIDANCE_STRIPPED',
          },
          '🚫 Gateway TTS: Stripped guidance blocks from speech'
        );
        finalText = guidanceStripped;

        if (!finalText.trim()) {
          log.debug({ sessionId }, 'Empty text after guidance stripping');
          return createEmptyAudioStream();
        }
      }
    }

    // Merge emotion from config with parsed prosody
    const prosody: SSMLProsodyConfig = {
      ...ssmlResult.prosody,
      emotion: ssmlResult.prosody.emotion || emotion,
    };

    // =========================================================================
    // 3. CHECK CACHE (with optional speculative synthesis)
    // =========================================================================

    // Speculative synthesis: start both cache check and synthesis in parallel
    // This reduces latency on cache misses but wastes API calls on cache hits
    let speculativeSynthesisPromise: Promise<ArrayBuffer> | null = null;
    let speculativeSynthesisStart = 0;

    if (enableSpeculativeSynthesis && enableCache && cache) {
      speculativeSynthesisStart = Date.now();
      // Start synthesis immediately (fire-and-forget for now)
      speculativeSynthesisPromise = Promise.race([
        provider.synthesize(finalText, voiceId, prosody),
        new Promise<ArrayBuffer>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`TTS synthesis timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);

      log.debug(
        { text: truncateForLog(finalText, 30), sessionId },
        '🚀 Speculative synthesis started in parallel with cache check'
      );
    }

    if (enableCache && cache) {
      const cached = await cache.get(finalText, voiceId, prosody);

      if (cached) {
        const hitLatency = Date.now() - startTime;
        metrics.cacheHits++;
        cacheHitLatencies.push(hitLatency);
        if (cacheHitLatencies.length > 100) cacheHitLatencies.shift();
        metrics.avgCacheHitLatencyMs =
          cacheHitLatencies.reduce((a, b) => a + b, 0) / cacheHitLatencies.length;

        // Estimate saved latency (typical synthesis is 200-400ms)
        metrics.totalSavedLatencyMs += Math.max(0, 300 - hitLatency);

        // Note: If speculative synthesis was started, it will complete in background
        // and be discarded. This is the tradeoff for lower latency on cache misses.
        if (speculativeSynthesisPromise) {
          log.debug(
            { sessionId },
            '⚡ Cache hit with speculative synthesis in progress - discarding synthesis'
          );
        }

        log.info(
          {
            text: truncateForLog(finalText, 50),
            voiceId,
            sessionId,
            hitLatencyMs: hitLatency,
            audioBytes: cached.audio.byteLength,
            speculativeSynthesisStarted: !!speculativeSynthesisPromise,
            trace: 'GATEWAY_TTS_CACHE_HIT',
          },
          `⚡ Gateway TTS CACHE HIT in ${hitLatency}ms`
        );

        return createAudioFrameStream(cached.audio, sampleRate, frameDurationMs);
      }
    }

    // =========================================================================
    // 4. SYNTHESIZE VIA GATEWAY (CACHE MISS)
    // =========================================================================

    metrics.cacheMisses++;
    metrics.gatewaySyntheses++;

    log.info(
      {
        text: truncateForLog(finalText, 50),
        voiceId,
        sessionId,
        prosody,
        speculativeSynthesisInProgress: !!speculativeSynthesisPromise,
        trace: 'GATEWAY_TTS_SYNTHESIZE',
      },
      '🎤 Gateway TTS: Calling Cartesia provider'
    );

    try {
      const synthesisStart = speculativeSynthesisStart || Date.now();

      // Use speculative synthesis result if available, otherwise start new synthesis
      const audio = speculativeSynthesisPromise
        ? await speculativeSynthesisPromise
        : await Promise.race([
            provider.synthesize(finalText, voiceId, prosody),
            new Promise<ArrayBuffer>((_, reject) => {
              setTimeout(() => {
                reject(new Error(`TTS synthesis timed out after ${timeoutMs}ms`));
              }, timeoutMs);
            }),
          ]);

      const synthesisLatency = Date.now() - synthesisStart;
      synthesisLatencies.push(synthesisLatency);
      if (synthesisLatencies.length > 100) synthesisLatencies.shift();
      metrics.avgSynthesisLatencyMs =
        synthesisLatencies.reduce((a, b) => a + b, 0) / synthesisLatencies.length;

      if (!audio || audio.byteLength === 0) {
        log.warn({ sessionId, voiceId }, 'Gateway TTS: Provider returned empty audio');
        metrics.errors++;
        // Return empty completed stream instead of null to avoid LiveKit SDK errors
        return createEmptyAudioStream();
      }

      log.info(
        {
          text: truncateForLog(finalText, 50),
          voiceId,
          sessionId,
          synthesisLatencyMs: synthesisLatency,
          audioBytes: audio.byteLength,
          trace: 'GATEWAY_TTS_COMPLETE',
        },
        `✅ Gateway TTS synthesized in ${synthesisLatency}ms (${audio.byteLength} bytes)`
      );

      // =========================================================================
      // 5. CACHE THE RESULT
      // =========================================================================

      if (enableCache && cache) {
        // Estimate duration from audio size (16-bit PCM at 24kHz)
        const durationMs = Math.round((audio.byteLength / 2 / sampleRate) * 1000);

        await cache.set(finalText, voiceId, audio, durationMs, prosody);

        log.debug(
          { text: truncateForLog(finalText, 30), voiceId, durationMs },
          'Cached synthesized audio'
        );
      }

      // =========================================================================
      // 6. RETURN AUDIO FRAME STREAM
      // =========================================================================

      return createAudioFrameStream(audio, sampleRate, frameDurationMs);
    } catch (error) {
      metrics.errors++;
      log.error(
        {
          error: String(error),
          text: truncateForLog(finalText, 50),
          voiceId,
          sessionId,
        },
        'Gateway TTS synthesis failed'
      );
      // Return empty completed stream instead of null to avoid LiveKit SDK errors
      return createEmptyAudioStream();
    }
  };
}

// ============================================================================
// CONVENIENCE: CREATE FULL TTS NODE FOR AGENT
// ============================================================================

/**
 * Create a complete TTS node replacement for voice agents
 *
 * This is designed to replace LiveKit's internal TTS entirely when the gateway
 * is enabled. It handles:
 * - SSML parsing and stripping
 * - Unified cache checking
 * - Cartesia API synthesis
 * - Audio frame conversion
 *
 * @param config - Configuration for the TTS node
 * @returns ttsNode-compatible function
 */
export function createGatewayTTSNodeForAgent(config: GatewayTTSNodeConfig) {
  if (!isTTSGatewayEnabled()) {
    log.warn({}, 'Gateway TTS requested but USE_TTS_GATEWAY is not enabled');
    return null;
  }

  const gatewayTTS = createGatewayTTSNode(config);

  return async (
    _agent: unknown,
    textStream: NodeReadableStream<string>,
    _modelSettings: unknown
  ): Promise<NodeReadableStream<AudioFrame> | null> => {
    return gatewayTTS(textStream);
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createGatewayTTSNode,
  createGatewayTTSNodeForAgent,
  getGatewayTTSMetrics,
  resetGatewayTTSMetrics,
};
