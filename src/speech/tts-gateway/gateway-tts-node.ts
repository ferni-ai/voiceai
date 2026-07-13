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

// ESM doesn't have global require, so we create one for dynamic imports
const require = createRequire(import.meta.url);
import { markCallStage, recordCallEvent } from '../../services/analytics/call-quality-monitor.js';
import { getTTSCache } from '../../services/tts/index.js';
import { getTTSProvider } from './providers/index.js';
import { getSSMLProcessor } from './ssml/index.js';
import type { SSMLProsodyConfig } from './types.js';

// ============================================================================
// JSON FUNCTION CALL FILTERING
// ============================================================================

/**
 * Regex to detect the `{"fn":` function call prefix (optionally backtick-wrapped).
 * Prevents tool call leakage to TTS when LLM outputs a function call
 * instead of speaking naturally. Requires `{"fn":` specifically to avoid
 * false positives on legitimate text like "{That's interesting}".
 */
const JSON_FN_PREFIX = /^\s*`?\s*\{\s*"fn"\s*:/;

/**
 * Check if text is a JSON function call that should not be spoken.
 *
 * Requires the text to match the `{"fn": ...}` pattern specifically.
 * Partial JSON streaming fragments starting with `{"fn":` are also filtered.
 * Legitimate text like "{That's interesting}" will NOT be filtered.
 */
function isJsonFunctionCall(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length < 5) {
    return false;
  }

  // Must start with {"fn": (optionally wrapped in backticks)
  if (!JSON_FN_PREFIX.test(trimmed)) {
    return false;
  }

  // Strip surrounding backticks for JSON parsing
  const jsonCandidate = trimmed.replace(/^`\s*/, '').replace(/\s*`$/, '');

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
    return typeof parsed === 'object' && parsed !== null && typeof parsed.fn === 'string';
  } catch {
    // Partial JSON starting with {"fn": (streaming) — still filter
    return true;
  }
}

/**
 * Check if the TTS Gateway is enabled.
 * Set USE_TTS_GATEWAY=false to disable (enabled by default).
 */
function isTTSGatewayEnabled(): boolean {
  return process.env.USE_TTS_GATEWAY !== 'false';
}

const log = createLogger({ module: 'GatewayTTSNode' });

type FirstAudioObserver = () => void;

interface FirstAudioObserverOptions {
  sessionId?: string;
  startTime: number;
}

function createFirstAudioObserver({
  sessionId,
  startTime,
}: FirstAudioObserverOptions): FirstAudioObserver {
  let hasMarkedFirstAudio = false;

  return (): void => {
    if (hasMarkedFirstAudio) return;
    hasMarkedFirstAudio = true;
    const ttfbMs = Date.now() - startTime;
    log.info({ ttfbMs, sessionId }, `🔊 Gateway TTS TTFB: ${ttfbMs}ms`);
    if (sessionId) {
      try {
        const firstAudioAtMs = Date.now();
        markCallStage(sessionId, 'tts_first_frame', firstAudioAtMs);
        recordCallEvent({
          callId: sessionId,
          timestamp: firstAudioAtMs,
          type: 'first_response',
        });
      } catch {
        // Non-fatal observability
      }
    }
  };
}

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
   * Speculative synthesis starts in parallel with cache lookup (cost vs latency tradeoff).
   * Cartesia WebSocket per-chunk streaming is enabled when CARTESIA_STREAMING_TTS !== 'false'.
   */
  enableSpeculativeSynthesis?: boolean;

  /**
   * Start TTS on first phrase instead of waiting for full response (default: true when STREAMING_TTS_OVERLAP !== 'false').
   * Target: -100–200ms E2E by sending first sentence to TTS while LLM continues streaming.
   */
  enableStreamingOverlap?: boolean;
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

  const BYTES_PER_SAMPLE = 2; // s16le: 16-bit PCM = 2 bytes per sample
  const samplesPerFrame = Math.floor((sampleRate * frameDurationMs) / 1000);
  const bytesPerFrame = samplesPerFrame * BYTES_PER_SAMPLE;

  let offset = 0;
  while (offset < buffer.byteLength) {
    const frameSize = Math.min(bytesPerFrame, buffer.byteLength - offset);
    const frameBuffer = buffer.slice(offset, offset + frameSize);
    const samplesPerChannel = frameSize / BYTES_PER_SAMPLE;

    if (samplesPerChannel <= 0) {
      offset += frameSize;
      continue;
    }

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
  frameDurationMs: number,
  onFirstFrame?: FirstAudioObserver
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
      onFirstFrame?.();
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
// STREAMING OVERLAP: Start TTS on first phrase (target -100–200ms E2E)
// ============================================================================

// Sentence boundary: match sentence-ending punctuation followed by space or end-of-string.
// Negative lookbehind avoids splitting on abbreviations (Dr. Mr. Ms. U.S. etc.) and decimals (3.5).
const SENTENCE_END = /(?<![A-Z][a-z]|[A-Z]|[0-9])([.!?]+)\s|([.!?]+)$/;
const MIN_FIRST_CHUNK = 20;
const MIN_CHUNK = 15;

function sanitizeChunkForTTS(
  chunk: string,
  ssmlProcessor: ReturnType<typeof getSSMLProcessor>
): { text: string; prosody: SSMLProsodyConfig } {
  if (isJsonFunctionCall(chunk)) return { text: '', prosody: {} };
  let text = chunk;
  if (containsInstructionBlocks(text)) text = stripInstructionBlocks(text);
  if (containsGuidanceBlocks(text)) text = stripGuidanceBlocks(text);
  const ssmlResult = ssmlProcessor.parse(text);
  return {
    text: ssmlResult.cleanText.trim(),
    prosody: { ...ssmlResult.prosody },
  };
}

interface StreamingOverlapOptions {
  textStream: NodeReadableStream<string>;
  voiceId: string;
  sessionId?: string;
  personaId?: string;
  emotion?: string;
  sampleRate: number;
  frameDurationMs: number;
  enableCache: boolean;
  timeoutMs: number;
  cache: ReturnType<typeof getTTSCache> | null;
  provider: ReturnType<typeof getTTSProvider>;
  ssmlProcessor: ReturnType<typeof getSSMLProcessor>;
  markFirstAudio: FirstAudioObserver;
}

/**
 * Synthesize with timeout using AbortController for clean cancellation.
 *
 * Note: ITTSProvider.synthesize() does not accept an AbortSignal, so the
 * underlying HTTP/WebSocket request continues after timeout. The result is
 * discarded. This is a known limitation — to fully cancel, providers would
 * need to accept `{ signal: AbortSignal }` in their options.
 */
async function synthesizeWithTimeout(
  provider: ReturnType<typeof getTTSProvider>,
  text: string,
  voiceId: string,
  prosody: SSMLProsodyConfig,
  timeoutMs: number
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await Promise.race([
      provider.synthesize(text, voiceId, prosody),
      new Promise<ArrayBuffer>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`TTS timeout after ${timeoutMs}ms`));
        });
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function createStreamingOverlapTTS(
  opts: StreamingOverlapOptions
): Promise<NodeReadableStream<AudioFrame> | null> {
  const {
    textStream,
    voiceId,
    sessionId,
    personaId,
    emotion,
    sampleRate,
    frameDurationMs,
    enableCache,
    timeoutMs,
    cache,
    provider,
    ssmlProcessor,
    markFirstAudio,
  } = opts;

  // Prefer sentence-overlap for all streaming providers (Sonata + Cartesia).
  // Whole-text drain delayed first audio until the full LLM reply finished — opt in only for debug.
  const useWholeTextStreaming =
    process.env.TTS_WHOLE_TEXT_STREAMING === 'true' &&
    !!provider.synthesizeStreaming &&
    provider.name !== 'cartesia';
  const useProviderChunkStreaming =
    typeof provider.synthesizeStreaming === 'function' &&
    (provider.name !== 'cartesia' || process.env.CARTESIA_STREAMING_TTS !== 'false');

  return new ReadableStream<AudioFrame>({
    async start(controller) {
      const reader = textStream.getReader();
      let buffer = '';
      let firstChunk = true;
      let closed = false;

      const closeStream = (err?: Error) => {
        if (!closed) {
          closed = true;
          try {
            if (err) controller.error(err);
            else controller.close();
          } catch { /* already closed or errored */ }
        }
      };

      try {
        // ── LOCAL STREAMING PATH: collect all text, stream as one request ──
        if (useWholeTextStreaming) {
          // Drain the entire LLM text stream first
          while (true) {
            const { done, value } = await reader.read();
            if (value) buffer += value;
            if (done) break;
          }

          const { text: fullText, prosody } = sanitizeChunkForTTS(buffer, ssmlProcessor);
          const prosodyWithEmotion: SSMLProsodyConfig = {
            ...prosody,
            emotion: prosody.emotion || emotion,
          };

          if (fullText) {
            try {
              metrics.gatewaySyntheses++;
              let totalBytes = 0;
              for await (const audioChunk of provider.synthesizeStreaming!(
                fullText, voiceId, prosodyWithEmotion
              )) {
                if (audioChunk && audioChunk.byteLength > 0) {
                  totalBytes += audioChunk.byteLength;
                  markFirstAudio();
                  for (const frame of splitIntoFrames(audioChunk, sampleRate, frameDurationMs)) {
                    controller.enqueue(frame);
                  }
                }
              }
              log.info(
                { totalBytes, textLen: fullText.length, sessionId },
                `🔊 Whole-text streaming TTS complete`
              );
            } catch (err) {
              log.warn(
                { err: String(err), sessionId, personaId, textLen: fullText.length },
                'Whole-text streaming TTS failed'
              );
            }
          }
        } else {
        // ── CLOUD TTS PATH: sentence-by-sentence overlap (Cartesia etc) ──
        // Prefetch next chunk synthesis while current chunk plays (LATENCY-OPT)
        type PrefetchEntry = {
          text: string;
          prosody: SSMLProsodyConfig;
          promise: Promise<ArrayBuffer>;
        };
        let prefetch: PrefetchEntry | null = null;

        const synthesizeChunkAudio = async (
          text: string,
          prosodyWithEmotion: SSMLProsodyConfig
        ): Promise<ArrayBuffer> => {
          if (enableCache && cache) {
            const cached = await cache.get(text, voiceId, prosodyWithEmotion);
            if (cached) {
              metrics.cacheHits++;
              return cached.audio;
            }
            metrics.cacheMisses++;
            metrics.gatewaySyntheses++;
            const audio = await synthesizeWithTimeout(
              provider,
              text,
              voiceId,
              prosodyWithEmotion,
              timeoutMs
            );
            const sampleCount = audio.byteLength / 2;
            const durationMs = Math.round((sampleCount / sampleRate) * 1000);
            await cache.set(text, voiceId, audio, durationMs, prosodyWithEmotion);
            return audio;
          }
          metrics.gatewaySyntheses++;
          return synthesizeWithTimeout(provider, text, voiceId, prosodyWithEmotion, timeoutMs);
        };

        const enqueueStreamedChunk = async (
          text: string,
          prosodyWithEmotion: SSMLProsodyConfig
        ): Promise<void> => {
          // Cache hit still uses full buffer (faster than opening WS)
          if (enableCache && cache) {
            const cached = await cache.get(text, voiceId, prosodyWithEmotion);
            if (cached) {
              metrics.cacheHits++;
              if (cached.audio.byteLength > 0) {
                markFirstAudio();
                for (const frame of splitIntoFrames(cached.audio, sampleRate, frameDurationMs)) {
                  controller.enqueue(frame);
                }
              }
              return;
            }
            metrics.cacheMisses++;
          }

          metrics.gatewaySyntheses++;
          const parts: Uint8Array[] = [];
          for await (const audioChunk of provider.synthesizeStreaming!(
            text,
            voiceId,
            prosodyWithEmotion
          )) {
            if (!audioChunk || audioChunk.byteLength === 0) continue;
            parts.push(new Uint8Array(audioChunk));
            markFirstAudio();
            for (const frame of splitIntoFrames(audioChunk, sampleRate, frameDurationMs)) {
              controller.enqueue(frame);
            }
          }

          if (enableCache && cache && parts.length > 0) {
            const total = parts.reduce((n, p) => n + p.byteLength, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const part of parts) {
              merged.set(part, offset);
              offset += part.byteLength;
            }
            const durationMs = Math.round((merged.byteLength / 2 / sampleRate) * 1000);
            await cache.set(text, voiceId, merged.buffer, durationMs, prosodyWithEmotion);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (value) buffer += value;

          const minLen = firstChunk ? MIN_FIRST_CHUNK : MIN_CHUNK;
          let chunk: string | null = null;

          if (buffer.length >= minLen) {
            const match = buffer.match(SENTENCE_END);
            if (match && match.index !== undefined) {
              const end = match.index + match[0].length;
              chunk = buffer.slice(0, end);
              buffer = buffer.slice(end);
              firstChunk = false;
            } else if (buffer.length >= 80) {
              // Word-boundary fallback: find last space before 80, or any space at all
              const space = buffer.lastIndexOf(' ', 80);
              const anySpace = space > 0 ? space : buffer.indexOf(' ');
              const cut = anySpace > 0 ? anySpace + 1 : 80;
              chunk = buffer.slice(0, cut);
              buffer = buffer.slice(cut);
              firstChunk = false;
            }
          }

          if (done && buffer.length > 0) {
            chunk = buffer;
            buffer = '';
          } else if (done && !chunk) {
            break;
          }

          if (chunk) {
            const { text, prosody } = sanitizeChunkForTTS(chunk, ssmlProcessor);
            const prosodyWithEmotion: SSMLProsodyConfig = {
              ...prosody,
              emotion: prosody.emotion || emotion,
            };
            if (!text) continue;

            // Per-chunk error handling: skip failed chunks instead of killing the stream
            try {
              // Prefetched full buffers (REST) take priority when matched
              if (
                prefetch &&
                prefetch.text === text &&
                JSON.stringify(prefetch.prosody) === JSON.stringify(prosodyWithEmotion)
              ) {
                const audio = await prefetch.promise;
                prefetch = null;
                if (audio && audio.byteLength > 0) {
                  markFirstAudio();
                  for (const frame of splitIntoFrames(audio, sampleRate, frameDurationMs)) {
                    controller.enqueue(frame);
                  }
                }
              } else if (useProviderChunkStreaming) {
                if (prefetch) {
                  void prefetch.promise.catch(() => undefined);
                  prefetch = null;
                }
                await enqueueStreamedChunk(text, prosodyWithEmotion);
              } else {
                if (prefetch) {
                  // Discard mismatched prefetch (best-effort; don't block)
                  void prefetch.promise.catch(() => undefined);
                  prefetch = null;
                }
                const audio = await synthesizeChunkAudio(text, prosodyWithEmotion);
                if (audio && audio.byteLength > 0) {
                  markFirstAudio();
                  for (const frame of splitIntoFrames(audio, sampleRate, frameDurationMs)) {
                    controller.enqueue(frame);
                  }
                }
              }

              // Speculatively start next sentence if already buffered (REST prefetch)
              const nextMatch = buffer.match(SENTENCE_END);
              if (nextMatch && nextMatch.index !== undefined && buffer.length >= MIN_CHUNK) {
                const nextEnd = nextMatch.index + nextMatch[0].length;
                const nextRaw = buffer.slice(0, nextEnd);
                const nextSanitized = sanitizeChunkForTTS(nextRaw, ssmlProcessor);
                if (nextSanitized.text) {
                  const nextProsody: SSMLProsodyConfig = {
                    ...nextSanitized.prosody,
                    emotion: nextSanitized.prosody.emotion || emotion,
                  };
                  prefetch = {
                    text: nextSanitized.text,
                    prosody: nextProsody,
                    promise: synthesizeChunkAudio(nextSanitized.text, nextProsody),
                  };
                }
              }
            } catch (chunkErr) {
              prefetch = null;
              log.warn(
                { err: String(chunkErr), sessionId, personaId, chunkLen: text.length },
                'Streaming overlap: chunk synthesis failed, skipping'
              );
              // Continue to next chunk instead of aborting the stream
            }
          }

          if (done) break;
        }
        } // end cloud TTS path
      } catch (err) {
        log.warn({ err: String(err), sessionId, personaId }, 'Streaming overlap TTS error');
        closeStream(err instanceof Error ? err : new Error(String(err)));
      } finally {
        try { reader.releaseLock(); } catch { /* already released */ }
        closeStream();
      }
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
    enableStreamingOverlap = process.env.STREAMING_TTS_OVERLAP !== 'false',
  } = config;

  // Get gateway components
  const cache = getTTSCache();
  const provider = getTTSProvider();
  const ssmlProcessor = getSSMLProcessor();

  return async (
    textStream: NodeReadableStream<string>
  ): Promise<NodeReadableStream<AudioFrame> | null> => {
    const startTime = Date.now();
    const markFirstAudio = createFirstAudioObserver({ sessionId, startTime });
    metrics.totalRequests++;

    // =========================================================================
    // STREAMING OVERLAP: Start TTS on first phrase (target -100–200ms E2E)
    // =========================================================================
    if (enableStreamingOverlap) {
      return createStreamingOverlapTTS({
        textStream,
        voiceId,
        sessionId,
        personaId,
        emotion,
        sampleRate,
        frameDurationMs,
        enableCache,
        timeoutMs,
        cache,
        provider,
        ssmlProcessor,
        markFirstAudio,
      });
    }

    // =========================================================================
    // 1. COLLECT TEXT FROM STREAM (non-streaming path)
    // =========================================================================

    let fullText = '';
    const reader = textStream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += value;
      }
    } finally {
      try { reader.releaseLock(); } catch { /* already released */ }
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
    // 2.5. FILTER JSON FUNCTION CALLS
    // =========================================================================

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
    // 2.6. STRIP INSTRUCTION BLOCKS
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
      ]).catch((err) => {
        log.warn({ error: String(err), sessionId }, 'Speculative synthesis failed');
        return new ArrayBuffer(0);
      });

      log.debug(
        { text: truncateForLog(finalText, 30), sessionId },
        '🚀 Speculative synthesis started in parallel with cache check'
      );
    }

    if (enableCache && cache) {
      const cacheCheckStart = Date.now();
      const cached = await cache.get(finalText, voiceId, prosody);

      if (cached) {
        const hitLatency = Date.now() - cacheCheckStart;
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

        return createAudioFrameStream(cached.audio, sampleRate, frameDurationMs, markFirstAudio);
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
      '🎤 Gateway TTS: Calling configured TTS provider'
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
        // Estimate duration from audio size (s16le = 2 bytes per sample)
        const sampleCount = audio.byteLength / 2;
        const durationMs = Math.round((sampleCount / sampleRate) * 1000);

        await cache.set(finalText, voiceId, audio, durationMs, prosody);

        log.debug(
          { text: truncateForLog(finalText, 30), voiceId, durationMs },
          'Cached synthesized audio'
        );
      }

      // =========================================================================
      // 6. RETURN AUDIO FRAME STREAM
      // =========================================================================

      return createAudioFrameStream(audio, sampleRate, frameDurationMs, markFirstAudio);
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
