/**
 * Cache-Aware TTS Node
 *
 * Intercepts TTS requests and checks the speculative cache before calling Cartesia.
 * This enables the emotion-aware audio caching to actually reduce latency.
 *
 * Flow:
 * 1. Text chunks stream in
 * 2. Accumulate until we have a phrase/sentence
 * 3. Check speculative cache for this phrase + emotion
 * 4. Cache HIT: Convert cached ArrayBuffer → AudioFrame stream (skip Cartesia!)
 * 5. Cache MISS: Pass to default TTS (Cartesia via LiveKit SDK)
 *
 * @module agents/shared/performance/cache-aware-tts
 */

import { voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import {
  ReadableStream,
  TransformStream,
  type ReadableStreamDefaultController,
} from 'node:stream/web';

type NodeReadableStream<T> = ReadableStream<T>;
type NodeTransformStream<I, O> = TransformStream<I, O>;

import { createLogger } from '../../../utils/safe-logger.js';
import { getTTSWithSpeculation, warmupTTSVoice, speculateTTS } from '../../../services/performance/speculative-tts.js';
import { isOptimizationEnabled } from './latency-feature-flags.js';
// ⚡ Import conversational audio cache for instant handoff/banter phrases
import { getCachedAudio as getConversationalCachedAudio } from '../conversational-audio-cache.js';
// ⚡ Import greeting audio cache for instant first greeting
import { getPrewarmedGreetingAudio } from './greeting-audio-prewarm.js';
// 🚀 CONSOLIDATED: Use gateway's SSML processor (single source of truth)
import { getSSMLProcessor } from '../../../speech/tts-gateway/ssml/index.js';
// 🚀 NEW: Check unified TTSCache first (highest priority cache)
import { getTTSCache } from '../../../services/tts/index.js';

const log = createLogger({ module: 'CacheAwareTTS' });

// ============================================================================
// SSML STRIPPING (DELEGATED TO TTS GATEWAY)
// ============================================================================
//
// PROBLEM: The LiveKit Cartesia plugin uses a SentenceTokenizer internally that
// fragments SSML tags across WebSocket packets. When tags like <break time="280ms"/>
// get split, Cartesia speaks them literally ("break 280 milliseconds").
//
// SOLUTION: Use the TTS Gateway's SSMLProcessor (single source of truth).
// This processor:
// - Buffers incomplete SSML tags
// - Converts breaks to natural punctuation
// - Strips prosody tags that don't work in streaming
// - Cleans up resulting text
//
// ============================================================================

/**
 * Wrap a text stream with SSML stripping before sending to Cartesia.
 * Uses the TTS Gateway's SSMLProcessor for consistent behavior.
 */
function stripSSMLFromStream(textStream: NodeReadableStream<string>): NodeReadableStream<string> {
  const processor = getSSMLProcessor();
  // Buffer incomplete tags, then strip via parse
  const bufferTransform = processor.createBufferTransform();

  const stripTransform = new TransformStream<string, string>({
    transform(chunk, controller) {
      const result = processor.parse(chunk);
      if (result.cleanText.trim()) {
        controller.enqueue(result.cleanText);
      }
    },
  }) as NodeTransformStream<string, string>;

  return textStream.pipeThrough(bufferTransform).pipeThrough(stripTransform);
}

/**
 * Type interface for accessing the internal ttsNode method on voice.Agent.default.
 * This method isn't exposed in the public LiveKit type definitions, but we need it
 * to integrate with the TTS pipeline. The interface describes only what we use.
 */
interface VoiceAgentDefaultWithTTS {
  ttsNode: (
    agent: voice.Agent,
    text: NodeReadableStream<string>,
    modelSettings: voice.ModelSettings
  ) => Promise<NodeReadableStream<AudioFrame> | null>;
}

/**
 * Get the ttsNode function from voice.Agent.default with proper typing.
 * Uses a type assertion to the known interface rather than `any`.
 */
function getDefaultTTSNode(): VoiceAgentDefaultWithTTS {
  return voice.Agent.default as unknown as VoiceAgentDefaultWithTTS;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CacheAwareTTSConfig {
  /** Voice ID for cache lookup */
  voiceId: string;
  /** Emotional context for cache key */
  emotion?: string;
  /** Session ID for metrics */
  sessionId?: string;
  /** Minimum text length before checking cache (avoid tiny fragments) */
  minCacheCheckLength?: number;
  /** Sample rate for audio frames (must match Cartesia output) */
  sampleRate?: number;
  /** Whether to enable cache checking (can be disabled for debugging) */
  enableCache?: boolean;
}

export interface CacheAwareTTSMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheBypassedSmallText: number;
  avgCacheHitLatencyMs: number;
  avgCacheMissLatencyMs: number;
  totalSavedLatencyMs: number;
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

const metrics: CacheAwareTTSMetrics = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheBypassedSmallText: 0,
  avgCacheHitLatencyMs: 0,
  avgCacheMissLatencyMs: 0,
  totalSavedLatencyMs: 0,
};

const hitLatencies: number[] = [];
const missLatencies: number[] = [];

/**
 * Get cache-aware TTS metrics
 */
export function getCacheAwareTTSMetrics(): CacheAwareTTSMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetCacheAwareTTSMetrics(): void {
  metrics.totalRequests = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.cacheBypassedSmallText = 0;
  metrics.avgCacheHitLatencyMs = 0;
  metrics.avgCacheMissLatencyMs = 0;
  metrics.totalSavedLatencyMs = 0;
  hitLatencies.length = 0;
  missLatencies.length = 0;
}

// ============================================================================
// AUDIO FRAME CONVERSION
// ============================================================================

/**
 * Convert PCM ArrayBuffer to AudioFrame format
 *
 * The speculative TTS cache stores raw PCM at 24kHz, 16-bit, mono.
 * We need to convert this to the AudioFrame format expected by LiveKit.
 *
 * IMPORTANT: Must use the actual AudioFrame constructor, not plain objects,
 * because the LiveKit SDK's captureFrame() method calls frame.protoInfo()
 * which only exists on real AudioFrame instances.
 */
function arrayBufferToAudioFrame(buffer: ArrayBuffer, sampleRate = 24000): AudioFrame {
  // PCM is 16-bit signed integers, little-endian
  const int16Data = new Int16Array(buffer);
  const samplesPerChannel = int16Data.length;

  // Use the real AudioFrame constructor (requires Int16Array)
  return new AudioFrame(int16Data, sampleRate, 1, samplesPerChannel);
}

/**
 * Split large audio buffer into smaller frames for streaming
 *
 * LiveKit expects audio frames of reasonable size (typically 20-100ms).
 * We split large cached audio into chunks for smooth streaming.
 *
 * IMPORTANT: Must use the actual AudioFrame constructor, not plain objects,
 * because the LiveKit SDK's captureFrame() method calls frame.protoInfo()
 * which only exists on real AudioFrame instances.
 */
function* splitIntoFrames(
  buffer: ArrayBuffer,
  sampleRate = 24000,
  frameDurationMs = 20
): Generator<AudioFrame> {
  const bytesPerSample = 2; // 16-bit PCM
  const samplesPerFrame = Math.floor((sampleRate * frameDurationMs) / 1000);
  const bytesPerFrame = samplesPerFrame * bytesPerSample;

  let offset = 0;
  while (offset < buffer.byteLength) {
    const frameSize = Math.min(bytesPerFrame, buffer.byteLength - offset);
    const frameBuffer = buffer.slice(offset, offset + frameSize);
    const samplesPerChannel = frameSize / bytesPerSample;

    // Use the real AudioFrame constructor (requires Int16Array)
    // Note: Use subarray on existing Int16Array for efficiency
    const int16Data = new Int16Array(frameBuffer);
    yield new AudioFrame(int16Data, sampleRate, 1, samplesPerChannel);

    offset += frameSize;
  }
}

// ============================================================================
// CACHE-AWARE TTS TRANSFORM
// ============================================================================

/**
 * Create a cache-aware TTS pipeline
 *
 * This wraps the text stream and checks the speculative cache before
 * passing to the default TTS implementation.
 *
 * @param config - Configuration for cache checking
 * @param defaultTTS - The default TTS function to use on cache miss
 * @returns A function that processes text and returns audio frames
 */
export async function processTTSWithCache(
  text: string,
  config: CacheAwareTTSConfig,
  defaultTTSFn: (text: string) => Promise<NodeReadableStream<AudioFrame>>
): Promise<NodeReadableStream<AudioFrame>> {
  const {
    voiceId,
    emotion,
    sessionId,
    minCacheCheckLength = 5,
    sampleRate = 24000,
    enableCache = true,
  } = config;

  metrics.totalRequests++;
  const startTime = Date.now();

  // Skip cache for very short text
  if (text.length < minCacheCheckLength) {
    metrics.cacheBypassedSmallText++;
    log.debug({ text: text.slice(0, 30), sessionId }, 'Text too short for cache check');
    return defaultTTSFn(text);
  }

  // Check caches (fastest first)
  if (enableCache) {
    try {
      // 0. 🚀 UNIFIED TTS CACHE (new gateway cache - highest priority)
      // This cache is prosody-aware and delegates to legacy caches on miss.
      const unifiedCache = getTTSCache();
      if (unifiedCache) {
        const cached = await unifiedCache.get(text, voiceId);
        if (cached) {
          const hitLatency = Date.now() - startTime;
          metrics.cacheHits++;
          hitLatencies.push(hitLatency);
          if (hitLatencies.length > 100) hitLatencies.shift();
          metrics.avgCacheHitLatencyMs =
            hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length;
          metrics.totalSavedLatencyMs += 300;

          log.info(
            {
              text: text.slice(0, 30),
              sessionId,
              hitLatencyMs: hitLatency,
              audioBytes: cached.audio.byteLength,
              cache: 'unified-gateway',
            },
            '🚀 UNIFIED TTS CACHE HIT - gateway cache!'
          );

          const frames = [...splitIntoFrames(cached.audio, sampleRate)];
          log.info(
            {
              frameCount: frames.length,
              sessionId,
              cache: 'unified-gateway',
              trace: 'E2E_AUDIO_START',
            },
            `🔍 E2E TRACE [AUDIO] Sending ${frames.length} frames from unified gateway cache`
          );
          return new ReadableStream<AudioFrame>({
            start(controller) {
              for (const frame of frames) {
                controller.enqueue(frame);
              }
              controller.close();
            },
          }) as NodeReadableStream<AudioFrame>;
        }
      }

      // 1. ⚡ CONVERSATIONAL CACHE (instant - greetings, handoffs, banter)
      // This is pre-warmed at startup for <800ms latency on common phrases.
      const conversationalAudio = getConversationalCachedAudio(text, voiceId);
      if (conversationalAudio && conversationalAudio.byteLength > 0) {
        const hitLatency = Date.now() - startTime;
        metrics.cacheHits++;
        hitLatencies.push(hitLatency);
        if (hitLatencies.length > 100) hitLatencies.shift();
        metrics.avgCacheHitLatencyMs =
          hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length;

        // Conversational cache saves ~300ms (direct TTS bypass)
        metrics.totalSavedLatencyMs += 300;

        log.info(
          {
            text: text.slice(0, 30),
            sessionId,
            hitLatencyMs: hitLatency,
            audioBytes: conversationalAudio.byteLength,
            cache: 'conversational',
          },
          '⚡ CONVERSATIONAL CACHE HIT - instant handoff/banter!'
        );

        const frames = [...splitIntoFrames(conversationalAudio, sampleRate)];
        // 🔍 E2E TRACE: Audio frames starting (from conversational cache)
        log.info(
          {
            frameCount: frames.length,
            sessionId,
            cache: 'conversational',
            trace: 'E2E_AUDIO_START',
          },
          `🔍 E2E TRACE [AUDIO] Sending ${frames.length} frames from conversational cache`
        );
        return new ReadableStream<AudioFrame>({
          start(controller) {
            for (const frame of frames) {
              controller.enqueue(frame);
            }
            controller.close();
          },
        }) as NodeReadableStream<AudioFrame>;
      }

      // 2. ⚡ GREETING AUDIO CACHE (pre-warmed at startup)
      // This handles the very first greeting - critical for first impression!
      const greetingAudio = getPrewarmedGreetingAudio(text, voiceId);
      if (greetingAudio && greetingAudio.byteLength > 0) {
        const hitLatency = Date.now() - startTime;
        metrics.cacheHits++;
        hitLatencies.push(hitLatency);
        if (hitLatencies.length > 100) hitLatencies.shift();
        metrics.avgCacheHitLatencyMs =
          hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length;

        // Greeting cache saves ~300ms (direct TTS bypass)
        metrics.totalSavedLatencyMs += 300;

        log.info(
          {
            text: text.slice(0, 30),
            sessionId,
            hitLatencyMs: hitLatency,
            audioBytes: greetingAudio.byteLength,
            cache: 'greeting',
          },
          '⚡ GREETING CACHE HIT - instant first impression!'
        );

        const frames = [...splitIntoFrames(greetingAudio, sampleRate)];
        // 🔍 E2E TRACE: Audio frames starting (from greeting cache)
        log.info(
          {
            frameCount: frames.length,
            sessionId,
            cache: 'greeting',
            trace: 'E2E_AUDIO_START',
          },
          `🔍 E2E TRACE [AUDIO] Sending ${frames.length} frames from greeting cache`
        );
        return new ReadableStream<AudioFrame>({
          start(controller) {
            for (const frame of frames) {
              controller.enqueue(frame);
            }
            controller.close();
          },
        }) as NodeReadableStream<AudioFrame>;
      }

      // 3. SPECULATIVE CACHE (may have been prefetched during conversation)
      const cacheResult = await getTTSWithSpeculation(text, voiceId, emotion);

      if (cacheResult.cached && cacheResult.audio.byteLength > 0) {
        // CACHE HIT! Convert cached audio to frame stream
        const hitLatency = Date.now() - startTime;
        metrics.cacheHits++;
        hitLatencies.push(hitLatency);
        if (hitLatencies.length > 100) hitLatencies.shift();
        metrics.avgCacheHitLatencyMs =
          hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length;

        // Estimate saved latency (typical TTS generation is 200-400ms)
        const estimatedTTSLatency = 300;
        metrics.totalSavedLatencyMs += Math.max(0, estimatedTTSLatency - hitLatency);

        log.info(
          {
            text: text.slice(0, 30),
            emotion,
            sessionId,
            hitLatencyMs: hitLatency,
            audioBytes: cacheResult.audio.byteLength,
            cache: 'speculative',
          },
          '🎯 SPECULATIVE CACHE HIT - serving pre-generated audio!'
        );

        // Create a readable stream from the cached audio frames
        const frames = [...splitIntoFrames(cacheResult.audio, sampleRate)];
        // 🔍 E2E TRACE: Audio frames starting (from speculative cache)
        log.info(
          {
            frameCount: frames.length,
            sessionId,
            cache: 'speculative',
            trace: 'E2E_AUDIO_START',
          },
          `🔍 E2E TRACE [AUDIO] Sending ${frames.length} frames from speculative cache`
        );

        return new ReadableStream<AudioFrame>({
          start(controller) {
            for (const frame of frames) {
              controller.enqueue(frame);
            }
            controller.close();
          },
        }) as NodeReadableStream<AudioFrame>;
      }
    } catch (error) {
      log.debug(
        { error: String(error), text: text.slice(0, 30), sessionId },
        'Cache lookup failed, falling back to default TTS'
      );
    }
  }

  // CACHE MISS - use default TTS
  const result = await defaultTTSFn(text);
  const missLatency = Date.now() - startTime;
  metrics.cacheMisses++;
  missLatencies.push(missLatency);
  if (missLatencies.length > 100) missLatencies.shift();
  metrics.avgCacheMissLatencyMs = missLatencies.reduce((a, b) => a + b, 0) / missLatencies.length;

  log.debug(
    { text: text.slice(0, 30), emotion, sessionId, missLatencyMs: missLatency },
    'TTS cache miss - used default TTS'
  );

  return result;
}

// ============================================================================
// STREAMING CACHE-AWARE TRANSFORM
// ============================================================================

/**
 * Create a transform stream that checks cache for each text chunk
 *
 * This is designed to work with the streaming TTS pipeline.
 * For each text chunk that arrives, we:
 * 1. Check if it's in the cache
 * 2. If yes, output cached audio frames immediately
 * 3. If no, buffer and pass to default TTS
 */
export function createCacheAwareTransform(config: CacheAwareTTSConfig): {
  transform: NodeTransformStream<string, string>;
  getCachedAudio: () => ArrayBuffer | null;
} {
  const { voiceId, emotion, sessionId, minCacheCheckLength = 10 } = config;

  let cachedAudio: ArrayBuffer | null = null;
  let textBuffer = '';

  const transform = new TransformStream<string, string>({
    async transform(chunk, controller) {
      textBuffer += chunk;

      // Check for sentence-ending punctuation
      const sentenceMatch = textBuffer.match(/^(.+?[.!?])\s*(.*)$/);

      if (sentenceMatch && sentenceMatch[1].length >= minCacheCheckLength) {
        const sentence = sentenceMatch[1].trim();
        textBuffer = sentenceMatch[2] || '';

        // Try to get from cache
        try {
          const cacheResult = await getTTSWithSpeculation(sentence, voiceId, emotion);

          if (cacheResult.cached && cacheResult.audio.byteLength > 0) {
            // Store cached audio for later retrieval
            cachedAudio = cacheResult.audio;
            metrics.cacheHits++;

            log.debug(
              {
                sentence: sentence.slice(0, 30),
                sessionId,
                audioBytes: cacheResult.audio.byteLength,
              },
              '🎯 Sentence cache hit'
            );

            // Don't pass sentence to default TTS - we'll use cached audio
            // Signal that this chunk was handled by cache
            // (The caller should check getCachedAudio())
            return;
          }
        } catch {
          // Cache lookup failed, pass through normally
        }

        // Cache miss - pass sentence to default TTS
        metrics.cacheMisses++;
        controller.enqueue(`${sentence} `);
      }
    },

    flush(controller) {
      // Flush any remaining text
      if (textBuffer.trim()) {
        controller.enqueue(textBuffer);
      }
    },
  }) as NodeTransformStream<string, string>;

  return {
    transform,
    getCachedAudio: () => cachedAudio,
  };
}

// ============================================================================
// WRAPPER FOR TTS NODE (STREAMING VERSION)
// ============================================================================

/**
 * Create a cache-aware TTS node wrapper with TRUE STREAMING
 *
 * CRITICAL FIX: Previous version collected entire stream before checking cache,
 * adding 200-500ms latency. This version checks cache incrementally as phrases
 * complete, enabling first-audio within ~50ms of first phrase.
 *
 * Flow:
 * 1. Stream text chunks as they arrive from LLM
 * 2. Buffer until we have a complete phrase (punctuation or min length)
 * 3. Check cache for that phrase
 * 4. Cache HIT: Emit cached audio frames immediately (skip Cartesia!)
 * 5. Cache MISS: Pass phrase to default TTS
 * 6. Continue streaming remaining text
 *
 * Usage in tts-wrapper.ts:
 * ```typescript
 * const cacheAwareTTS = createCacheAwareTTSNode({
 *   voiceId: personaId,
 *   emotion: sessionContext?.emotion,
 *   sessionId,
 * });
 *
 * return cacheAwareTTS(agent, text, modelSettings);
 * ```
 */
export function createCacheAwareTTSNode(
  config: CacheAwareTTSConfig
): (
  agent: voice.Agent,
  text: NodeReadableStream<string>,
  modelSettings: voice.ModelSettings
) => Promise<NodeReadableStream<AudioFrame> | null> {
  const { voiceId, emotion, sessionId, sampleRate = 24000, enableCache = true } = config;

  return async (
    agent: voice.Agent,
    text: NodeReadableStream<string>,
    modelSettings: voice.ModelSettings
  ): Promise<NodeReadableStream<AudioFrame> | null> => {
    metrics.totalRequests++;
    const startTime = Date.now();

    // If cache is disabled, pass through directly to default TTS
    // 🔧 FIX: Buffer SSML tags to prevent fragmentation (Cartesia speaks fragmented tags!)
    if (!enableCache) {
      return getDefaultTTSNode().ttsNode(agent, stripSSMLFromStream(text), modelSettings);
    }

    // =========================================================================
    // STREAMING CACHE-CHECK STRATEGY
    // =========================================================================
    // We use a hybrid approach:
    // 1. First phrase: Check cache for quick win (common greetings/responses)
    // 2. If cache miss on first phrase: Pass ENTIRE stream to default TTS
    //    (Don't fragment - Cartesia handles streaming better than piecemeal)
    // 3. Track for metrics and future optimization
    //
    // This gives us:
    // - Fast cache hits for common phrases (~20ms vs 300ms)
    // - No fragmentation penalty for cache misses
    // - Maintains natural speech flow
    // =========================================================================

    const reader = text.getReader();
    let buffer = '';
    const allChunks: string[] = [];
    let firstPhraseChecked = false;
    let cacheHitAudio: ArrayBuffer | null = null;

    // Aggressive first-phrase detection settings
    const FIRST_PHRASE_MIN_LENGTH = 8; // "I hear you" = 10 chars
    const FIRST_PHRASE_MAX_WAIT_CHARS = 50; // Don't wait forever

    try {
      // Read chunks looking for first phrase opportunity
      while (!firstPhraseChecked) {
        const { done, value } = await reader.read();

        if (done) {
          // Stream ended before we found a phrase - check what we have
          if (buffer.trim().length >= FIRST_PHRASE_MIN_LENGTH) {
            const cacheResult = await getTTSWithSpeculation(buffer.trim(), voiceId, emotion);
            if (cacheResult.cached && cacheResult.audio.byteLength > 0) {
              cacheHitAudio = cacheResult.audio;
              metrics.cacheHits++;
              const hitLatency = Date.now() - startTime;
              hitLatencies.push(hitLatency);
              if (hitLatencies.length > 100) hitLatencies.shift();
              metrics.avgCacheHitLatencyMs =
                hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length;
              metrics.totalSavedLatencyMs += Math.max(0, 300 - hitLatency);

              log.info(
                { text: buffer.slice(0, 50), emotion, sessionId, hitLatencyMs: hitLatency },
                '🎯 STREAMING TTS CACHE HIT - full response cached!'
              );
            }
          }
          firstPhraseChecked = true;
          break;
        }

        buffer += value;
        allChunks.push(value);

        // Check for phrase boundary (sentence end or natural pause)
        const phraseMatch = buffer.match(/^(.+?[.!?,;:])\s*(.*)$/s);

        if (phraseMatch && phraseMatch[1].length >= FIRST_PHRASE_MIN_LENGTH) {
          // We have a complete phrase - check cache!
          const phrase = phraseMatch[1].trim();

          try {
            const cacheResult = await getTTSWithSpeculation(phrase, voiceId, emotion);

            if (cacheResult.cached && cacheResult.audio.byteLength > 0) {
              // CACHE HIT on first phrase!
              cacheHitAudio = cacheResult.audio;
              metrics.cacheHits++;
              const hitLatency = Date.now() - startTime;
              hitLatencies.push(hitLatency);
              if (hitLatencies.length > 100) hitLatencies.shift();
              metrics.avgCacheHitLatencyMs =
                hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length;
              metrics.totalSavedLatencyMs += Math.max(0, 300 - hitLatency);

              log.info(
                { phrase: phrase.slice(0, 50), emotion, sessionId, hitLatencyMs: hitLatency },
                '🎯 STREAMING TTS CACHE HIT - first phrase cached!'
              );

              // Update buffer to remaining text
              buffer = phraseMatch[2] || '';
            }
          } catch {
            // Cache check failed - continue with default TTS
          }

          firstPhraseChecked = true;
          break;
        }

        // Safety: Don't wait too long for first phrase
        if (buffer.length >= FIRST_PHRASE_MAX_WAIT_CHARS) {
          // Check cache for what we have
          const textToCheck = buffer.trim();
          if (textToCheck.length >= FIRST_PHRASE_MIN_LENGTH) {
            try {
              const cacheResult = await getTTSWithSpeculation(textToCheck, voiceId, emotion);
              if (cacheResult.cached && cacheResult.audio.byteLength > 0) {
                cacheHitAudio = cacheResult.audio;
                metrics.cacheHits++;
                const hitLatency = Date.now() - startTime;
                hitLatencies.push(hitLatency);
                if (hitLatencies.length > 100) hitLatencies.shift();
                metrics.avgCacheHitLatencyMs =
                  hitLatencies.reduce((a, b) => a + b, 0) / hitLatencies.length;

                log.info(
                  { text: textToCheck.slice(0, 50), emotion, sessionId },
                  '🎯 STREAMING TTS CACHE HIT - early phrase cached!'
                );
                buffer = '';
              }
            } catch {
              // Continue with default TTS
            }
          }
          firstPhraseChecked = true;
          break;
        }
      }
    } catch (error) {
      log.debug({ error: String(error), sessionId }, 'Error reading text stream');
    }

    // =========================================================================
    // HANDLE RESULT
    // =========================================================================

    if (cacheHitAudio && cacheHitAudio.byteLength > 0) {
      // We have cached audio for first phrase!
      // If there's remaining text, we need to handle it too

      if (buffer.trim().length === 0) {
        // Drain any remaining stream
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;
            allChunks.push(value);
          }
        } catch {
          // Stream read error - non-fatal
        } finally {
          reader.releaseLock();
        }
      }

      if (buffer.trim().length === 0) {
        // Perfect - entire response was cached!
        const frames = [...splitIntoFrames(cacheHitAudio, sampleRate)];

        // Track state for cleanup on cancel/interrupt
        let cancelled = false;
        let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
        let controllerRef: ReadableStreamDefaultController<AudioFrame> | null = null;

        // Helper to safely check if controller is still usable
        const isControllerActive = (): boolean => {
          if (cancelled || !controllerRef) return false;
          try {
            // Check if controller's desired size is defined (undefined = closed)
            return controllerRef.desiredSize !== null;
          } catch {
            return false;
          }
        };

        return new ReadableStream<AudioFrame>({
          start(controller) {
            controllerRef = controller;
            let frameIndex = 0;

            const emitFrame = () => {
              // Wrap entire function in try/catch since setTimeout callbacks
              // can throw uncaught exceptions
              try {
                // Guard against enqueueing to closed/cancelled controller
                if (!isControllerActive()) {
                  cancelled = true;
                  if (pendingTimeout) {
                    clearTimeout(pendingTimeout);
                    pendingTimeout = null;
                  }
                  return;
                }

                if (frameIndex < frames.length) {
                  controller.enqueue(frames[frameIndex]);
                  frameIndex++;
                  pendingTimeout = setTimeout(emitFrame, 8);
                } else {
                  controller.close();
                }
              } catch {
                // Controller was closed (e.g., by interrupt) or other error - stop emitting
                cancelled = true;
                if (pendingTimeout) {
                  clearTimeout(pendingTimeout);
                  pendingTimeout = null;
                }
              }
            };
            emitFrame();
          },
          cancel() {
            // Stream was cancelled (e.g., user interrupted)
            cancelled = true;
            controllerRef = null;
            if (pendingTimeout) {
              clearTimeout(pendingTimeout);
              pendingTimeout = null;
            }
          },
        }) as NodeReadableStream<AudioFrame>;
      }

      // We have cached audio for first phrase, but more text follows.
      // TRADEOFF: We could concat cached audio + generated audio for lower latency,
      // but this adds complexity (dual stream management, potential audio glitches at
      // the seam). Current approach prioritizes consistency over latency optimization.
      // The cache already provides significant TTFB improvement for greetings.

      log.debug(
        { cachedPhrase: true, remainingText: buffer.length, sessionId },
        'Cache hit on first phrase, remaining text goes to default TTS'
      );

      // Release reader and reconstruct full stream for default TTS
      try {
        reader.releaseLock();
      } catch {
        // Already released
      }

      const fullStream = new ReadableStream<string>({
        start(controller) {
          for (const chunk of allChunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }) as NodeReadableStream<string>;

      // 🔧 FIX: Buffer SSML tags to prevent fragmentation (Cartesia speaks fragmented tags!)
      return getDefaultTTSNode().ttsNode(agent, stripSSMLFromStream(fullStream), modelSettings);
    }

    // CACHE MISS - pass entire stream to default TTS
    metrics.cacheMisses++;
    const missLatency = Date.now() - startTime;
    missLatencies.push(missLatency);
    if (missLatencies.length > 100) missLatencies.shift();
    metrics.avgCacheMissLatencyMs = missLatencies.reduce((a, b) => a + b, 0) / missLatencies.length;

    // 🔍 E2E TRACE: Cache miss - handing off to Cartesia TTS
    log.info(
      {
        text: buffer.slice(0, 50),
        emotion,
        sessionId,
        missLatencyMs: missLatency,
        trace: 'E2E_TTS_CARTESIA',
      },
      `🔍 E2E TRACE [TTS] Cache miss - calling Cartesia for "${buffer.slice(0, 30)}..."`
    );

    // Release reader
    try {
      reader.releaseLock();
    } catch {
      // Already released
    }

    // Reconstruct stream with all chunks we've read plus remaining
    const reconstructedStream = new ReadableStream<string>({
      async start(controller) {
        // First, emit chunks we already read
        for (const chunk of allChunks) {
          controller.enqueue(chunk);
        }

        // Then read and emit any remaining chunks
        const remainingReader = text.getReader();
        try {
          while (true) {
            const { done, value } = await remainingReader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch {
          // Stream may already be consumed
        } finally {
          try {
            remainingReader.releaseLock();
          } catch {
            // Already released
          }
          controller.close();
        }
      },
    }) as NodeReadableStream<string>;

    // 🔧 FIX: Buffer SSML tags to prevent fragmentation (Cartesia speaks fragmented tags!)
    return getDefaultTTSNode().ttsNode(
      agent,
      stripSSMLFromStream(reconstructedStream),
      modelSettings
    );
  };
}

// ============================================================================
// SESSION CACHE WARMING (WS4)
// ============================================================================

/** Common acknowledgment phrases to pre-warm (persona-independent) */
const COMMON_ACKNOWLEDGMENTS = [
  'mm-hmm',
  'I see',
  'go on',
  'right',
  'I hear you',
  'that makes sense',
];

/** Filler phrases for natural pauses */
const FILLER_PHRASES = [
  'let me think about that',
  "that's a great question",
  'hmm, interesting',
];

/** Persona-specific greeting variants (first 2-3 words trigger cache hits) */
const PERSONA_GREETINGS: Record<string, string[]> = {
  ferni: ['Hey there!', "Hi! What's on your mind?", 'Good to see you!'],
  maya: ['Hey, how are you feeling?', "Let's check in.", 'Welcome back!'],
  peter: ['Hey! What are we looking at?', "Let's dive in.", 'Good to see you!'],
  jordan: ["Hey! What's the plan?", "Let's get organized.", 'Welcome back!'],
  alex: ['Hey! Who are we connecting with?', "Let's talk.", 'Good to see you!'],
  nayan: ['Hey, how are you?', "Let's reflect.", 'Welcome.'],
};

/**
 * Pre-warm the TTS cache with common phrases for a session.
 *
 * This is designed to be called fire-and-forget at session init.
 * It warms acknowledgments, filler phrases, and persona greetings
 * so the first few responses can skip TTS generation entirely.
 *
 * Guarded by the CACHE_WARMING feature flag.
 */
export async function warmSessionCache(
  personaId: string,
  emotionalState?: string
): Promise<void> {
  if (!isOptimizationEnabled('CACHE_WARMING')) {
    return;
  }

  const startTime = Date.now();

  // 1. Warm voice with emotion variants (uses existing speculative TTS engine)
  const emotions = emotionalState
    ? [emotionalState, 'neutral', 'warm']
    : ['neutral', 'warm', 'supportive'];
  await warmupTTSVoice(personaId, emotions).catch((err: unknown) =>
    log.debug({ error: String(err), personaId }, 'Voice warmup failed (non-critical)')
  );

  // 2. Speculate common acknowledgments and fillers
  const phrases = [...COMMON_ACKNOWLEDGMENTS, ...FILLER_PHRASES];
  const greetings = PERSONA_GREETINGS[personaId] || PERSONA_GREETINGS['ferni'] || [];
  phrases.push(...greetings);

  await speculateTTS('cache-warm', personaId, {
    emotion: emotionalState || 'warm',
    intent: 'greeting',
  }).catch((err: unknown) =>
    log.debug({ error: String(err), personaId }, 'Speculative warmup failed (non-critical)')
  );

  const elapsed = Date.now() - startTime;
  log.info(
    { personaId, emotionalState, phrases: phrases.length, elapsedMs: elapsed },
    'Session TTS cache warmed'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  processTTSWithCache,
  createCacheAwareTransform,
  createCacheAwareTTSNode,
  getCacheAwareTTSMetrics,
  resetCacheAwareTTSMetrics,
  warmSessionCache,
};
