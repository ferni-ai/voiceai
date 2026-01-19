/**
 * TTS Gateway Implementation
 *
 * The main gateway class that coordinates SSML processing, caching,
 * provider selection, and audio output.
 *
 * This is the SINGLE ENTRY POINT for all TTS operations in Ferni.
 *
 * Architecture:
 * ```
 * Request → SSML Parse → Cache Lookup → Provider Call → Result
 *              ↓              ↓              ↓
 *         Extract Prosody   HIT? Return   Generate Audio
 *              ↓              ↓              ↓
 *         Clean Text     MISS? Continue   Cache Store
 * ```
 *
 * @module speech/tts-gateway/gateway
 */

import {
  TransformStream,
  type ReadableStream as NodeReadableStream,
} from 'node:stream/web';
import {
  DEFAULT_AUDIO_FORMAT,
  type ITTSGateway,
  type ITTSProvider,
  type ITTSCache,
  type IAudioSink,
  type TTSRequest,
  type TTSResult,
  type SSMLProsodyConfig,
  type AudioFormat,
  type TTSGatewayConfig,
  type GatewayStats,
  type TTSTrace,
  type TraceEvent,
  type TraceEventType,
} from './types.js';
import { getSSMLProcessor, type SSMLParseResult } from './ssml/index.js';
import { createLogger, truncateForLog } from '../../utils/safe-logger.js';
import { finops } from '../../services/observability/finops.js';

const log = createLogger({ module: 'TTSGateway' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum text length for non-streaming (use streaming above this) */
const DEFAULT_MAX_NON_STREAMING_LENGTH = 500;

// Note: DEFAULT_AUDIO_FORMAT is imported from types.ts (single source of truth)

// ============================================================================
// TRACING
// ============================================================================

/**
 * Generate a unique trace ID
 */
function generateTraceId(): string {
  return `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a trace object
 */
function createTrace(request: TTSRequest): TTSTrace {
  const traceId = generateTraceId();
  return {
    traceId,
    request,
    events: [],
    startTime: Date.now(),
    outcome: 'pending',
  };
}

/**
 * Add event to trace
 */
function addTraceEvent(
  trace: TTSTrace,
  type: TraceEventType,
  data?: Record<string, unknown>
): void {
  const event: TraceEvent = {
    type,
    timestamp: Date.now(),
    durationMs: Date.now() - trace.startTime,
    data,
  };
  trace.events.push(event);
}

/**
 * Complete trace
 */
function completeTrace(trace: TTSTrace, success: boolean, error?: string): void {
  trace.endTime = Date.now();
  trace.totalDurationMs = trace.endTime - trace.startTime;
  trace.outcome = success ? 'success' : 'error';
  if (error) {
    trace.error = error;
  }
}

// ============================================================================
// GATEWAY CLASS
// ============================================================================

/**
 * TTS Gateway implementation
 *
 * Coordinates all TTS operations with proper SSML handling,
 * caching, and provider selection.
 *
 * Implements Disposable for proper DI container cleanup.
 */
export class TTSGateway implements ITTSGateway {
  private readonly provider: ITTSProvider;
  private readonly cache: ITTSCache | null;
  private readonly audioFormat: AudioFormat;
  private readonly maxNonStreamingLength: number;
  private readonly enableTracing: boolean;

  // Statistics
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private processingTimes: number[] = [];
  private readonly maxTimingSamples = 100;

  // Recent traces (for debugging)
  private readonly recentTraces: TTSTrace[] = [];
  private readonly maxTraces = 50;

  constructor(config: TTSGatewayConfig) {
    this.provider = config.provider;
    this.cache = config.cache ?? null;
    this.audioFormat = config.audioFormat ?? DEFAULT_AUDIO_FORMAT;
    this.maxNonStreamingLength = config.maxNonStreamingLength ?? DEFAULT_MAX_NON_STREAMING_LENGTH;
    this.enableTracing = config.enableTracing ?? true;

    log.info(
      {
        provider: this.provider.name,
        hasCache: !!this.cache,
        audioFormat: this.audioFormat,
        maxNonStreamingLength: this.maxNonStreamingLength,
      },
      '🚀 TTS Gateway initialized'
    );
  }

  /**
   * Synthesize text to audio
   *
   * Main entry point for TTS operations. Handles:
   * 1. SSML parsing and prosody extraction
   * 2. Cache lookup
   * 3. Provider call (on cache miss)
   * 4. Cache storage (on generation)
   * 5. Cost tracking
   *
   * @param request - TTS request
   * @returns TTS result with audio
   */
  async synthesize(request: TTSRequest): Promise<TTSResult> {
    this.totalRequests++;
    const trace = this.enableTracing ? createTrace(request) : null;

    try {
      // 1. Parse SSML and extract prosody
      const ssmlProcessor = getSSMLProcessor();
      const parseResult = ssmlProcessor.parse(request.text);

      if (trace) {
        addTraceEvent(trace, 'request_received', {
          text: truncateForLog(request.text, 100),
          voiceId: request.voiceId,
          sessionId: request.sessionId,
        });

        addTraceEvent(trace, 'ssml_parsed', {
          hadSSML: parseResult.hadSSML,
          cleanText: truncateForLog(parseResult.cleanText, 100),
          prosody: parseResult.prosody,
          warnings: parseResult.warnings,
        });
      }

      // Merge request prosody with parsed prosody (request takes precedence)
      const prosody = this.mergeProsody(parseResult.prosody, request.prosody);
      const cleanText = parseResult.cleanText;

      if (!cleanText.trim()) {
        log.debug(
          { originalText: truncateForLog(request.text, 50) },
          'Empty text after SSML processing, returning empty result'
        );
        return this.createEmptyResult(trace);
      }

      // 2. Try cache first
      if (this.cache && request.allowCache !== false) {
        if (trace) {
          addTraceEvent(trace, 'cache_lookup', {
            text: truncateForLog(cleanText, 50),
            voiceId: request.voiceId,
          });
        }

        const cached = await this.cache.get(cleanText, request.voiceId, prosody);

        if (cached) {
          this.successfulRequests++;

          if (trace) {
            addTraceEvent(trace, 'cache_hit', {
              audioBytes: cached.audio.byteLength,
              durationMs: cached.durationMs,
            });
            completeTrace(trace, true);
            this.storeTrace(trace);
          }

          log.info(
            {
              traceId: trace?.traceId,
              text: truncateForLog(cleanText, 50),
              voiceId: request.voiceId,
              cached: true,
              audioBytes: cached.audio.byteLength,
            },
            '🎯 TTS Cache HIT'
          );

          return {
            audio: cached.audio,
            durationMs: cached.durationMs,
            cached: true,
            cacheSource: 'unified',
            appliedProsody: cached.prosody,
            processingTimeMs: Date.now() - (trace?.startTime ?? Date.now()),
            provider: this.provider.name,
            traceId: trace?.traceId ?? generateTraceId(),
          };
        }

        if (trace) {
          addTraceEvent(trace, 'cache_miss', {});
        }
      }

      // 3. Call provider
      if (trace) {
        addTraceEvent(trace, 'provider_call', {
          provider: this.provider.name,
          text: truncateForLog(cleanText, 50),
          voiceId: request.voiceId,
          prosody,
        });
      }

      const providerStartTime = Date.now();
      const audio = await this.provider.synthesize(cleanText, request.voiceId, prosody);
      const providerDurationMs = Date.now() - providerStartTime;

      // Calculate audio duration
      const audioDurationMs = this.calculateAudioDuration(audio);

      if (trace) {
        addTraceEvent(trace, 'provider_complete', {
          audioBytes: audio.byteLength,
          audioDurationMs,
          providerDurationMs,
        });
      }

      // 4. Store in cache (if enabled and audio was generated)
      if (this.cache && request.allowCache !== false && audio.byteLength > 0) {
        try {
          await this.cache.set(cleanText, request.voiceId, audio, audioDurationMs, prosody);
        } catch (cacheError) {
          log.warn({ error: String(cacheError) }, 'Failed to cache TTS result');
        }
      }

      // 5. Track cost
      finops.recordTTSCost({
        provider: this.provider.name,
        characters: cleanText.length,
        sessionId: request.sessionId,
      });

      // Complete
      const totalDurationMs = Date.now() - (trace?.startTime ?? Date.now());
      this.recordProcessingTime(totalDurationMs);
      this.successfulRequests++;

      if (trace) {
        addTraceEvent(trace, 'complete', {
          totalDurationMs,
          cached: false,
        });
        completeTrace(trace, true);
        this.storeTrace(trace);
      }

      log.info(
        {
          traceId: trace?.traceId,
          text: truncateForLog(cleanText, 50),
          voiceId: request.voiceId,
          cached: false,
          audioBytes: audio.byteLength,
          audioDurationMs,
          processingTimeMs: totalDurationMs,
        },
        '✅ TTS Synthesized'
      );

      return {
        audio,
        durationMs: audioDurationMs,
        cached: false,
        appliedProsody: prosody,
        processingTimeMs: totalDurationMs,
        provider: this.provider.name,
        traceId: trace?.traceId ?? generateTraceId(),
      };
    } catch (error) {
      this.failedRequests++;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (trace) {
        addTraceEvent(trace, 'error', { error: errorMessage });
        completeTrace(trace, false, errorMessage);
        this.storeTrace(trace);
      }

      log.error(
        {
          traceId: trace?.traceId,
          error: errorMessage,
          text: truncateForLog(request.text, 50),
          voiceId: request.voiceId,
        },
        '❌ TTS Synthesis failed'
      );

      throw error;
    }
  }

  /**
   * Speak to an audio sink
   *
   * Synthesizes audio and sends it to the specified sink.
   */
  async speakTo(request: TTSRequest, sink: IAudioSink): Promise<void> {
    if (!sink.isReady()) {
      throw new Error('Audio sink is not ready');
    }

    const result = await this.synthesize(request);

    if (result.audio.byteLength === 0) {
      log.debug({}, 'Empty audio result, nothing to send to sink');
      return;
    }

    await sink.sendAudio(result.audio, this.audioFormat);
    await sink.flush();
  }

  /**
   * Create a streaming text pipeline
   *
   * Returns a function that transforms text streams by:
   * 1. Buffering complete SSML tags
   * 2. Parsing and extracting prosody
   * 3. Emitting clean text
   *
   * Note: This doesn't generate audio - it prepares text for downstream TTS.
   */
  createTextPipeline(
    _voiceId: string,
    _prosody?: SSMLProsodyConfig
  ): (textStream: NodeReadableStream<string>) => NodeReadableStream<string> {
    const ssmlProcessor = getSSMLProcessor();

    return (textStream: NodeReadableStream<string>) => {
      // First, buffer complete SSML tags
      const bufferTransform = ssmlProcessor.createBufferTransform();

      // Then, parse and extract clean text
      const parseTransform = new TransformStream<string, string>({
        transform: (chunk, controller) => {
          const result = ssmlProcessor.parse(chunk);
          if (result.cleanText.trim()) {
            controller.enqueue(result.cleanText);
          }
        },
      });

      return textStream
        .pipeThrough(bufferTransform)
        .pipeThrough(parseTransform);
    };
  }

  /**
   * Warmup the gateway
   *
   * Checks provider health and warms up caches.
   */
  async warmup(): Promise<void> {
    log.info({}, '🔥 Warming up TTS Gateway');

    // Check provider health
    const providerAvailable = await this.provider.isAvailable();
    if (!providerAvailable) {
      log.warn({ provider: this.provider.name }, 'TTS Provider not available');
    } else {
      log.info({ provider: this.provider.name }, '✅ TTS Provider available');
    }

    // Log cache stats
    if (this.cache) {
      const stats = this.cache.getStats();
      log.info(
        { cacheSize: stats.size, hitRate: stats.hitRate },
        '📊 TTS Cache stats'
      );
    }
  }

  /**
   * Get gateway statistics
   */
  getStats(): GatewayStats {
    const avgProcessingTimeMs =
      this.processingTimes.length > 0
        ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
        : 0;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      cache: this.cache ? this.cache.getStats() : null,
      avgProcessingTimeMs,
      provider: this.provider.name,
      healthy: this.failedRequests / Math.max(this.totalRequests, 1) < 0.1,
    };
  }

  /**
   * Shutdown gateway cleanly
   */
  async shutdown(): Promise<void> {
    log.info({}, '🛑 Shutting down TTS Gateway');

    // Log final stats
    const stats = this.getStats();
    log.info(
      {
        totalRequests: stats.totalRequests,
        successfulRequests: stats.successfulRequests,
        failedRequests: stats.failedRequests,
        cacheHitRate: stats.cache?.hitRate,
      },
      '📊 Final TTS Gateway stats'
    );
  }

  /**
   * Dispose (alias for shutdown, implements Disposable pattern)
   */
  async dispose(): Promise<void> {
    return this.shutdown();
  }

  /**
   * Get recent traces (for debugging)
   */
  getRecentTraces(): TTSTrace[] {
    return [...this.recentTraces];
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Merge prosody configurations
   */
  private mergeProsody(
    parsed: SSMLProsodyConfig,
    override?: SSMLProsodyConfig
  ): SSMLProsodyConfig {
    if (!override) {
      return parsed;
    }

    return {
      speed: override.speed ?? parsed.speed,
      volume: override.volume ?? parsed.volume,
      emotion: override.emotion ?? parsed.emotion,
      emotionIntensity: override.emotionIntensity ?? parsed.emotionIntensity,
    };
  }

  /**
   * Calculate audio duration from buffer
   *
   * Assumes 16-bit PCM at the configured sample rate.
   */
  private calculateAudioDuration(audio: ArrayBuffer): number {
    if (audio.byteLength === 0) return 0;

    const bytesPerSample = this.audioFormat.bitsPerSample / 8;
    const totalSamples = audio.byteLength / bytesPerSample / this.audioFormat.channels;
    const durationSeconds = totalSamples / this.audioFormat.sampleRate;

    return Math.round(durationSeconds * 1000);
  }

  /**
   * Create empty result
   */
  private createEmptyResult(trace: TTSTrace | null): TTSResult {
    if (trace) {
      completeTrace(trace, true);
      this.storeTrace(trace);
    }

    return {
      audio: new ArrayBuffer(0),
      durationMs: 0,
      cached: false,
      processingTimeMs: 0,
      provider: this.provider.name,
      traceId: trace?.traceId ?? generateTraceId(),
    };
  }

  /**
   * Record processing time for statistics
   */
  private recordProcessingTime(timeMs: number): void {
    this.processingTimes.push(timeMs);
    if (this.processingTimes.length > this.maxTimingSamples) {
      this.processingTimes.shift();
    }
  }

  /**
   * Store trace for debugging
   */
  private storeTrace(trace: TTSTrace): void {
    this.recentTraces.push(trace);
    if (this.recentTraces.length > this.maxTraces) {
      this.recentTraces.shift();
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let gatewayInstance: TTSGateway | null = null;

/**
 * Get the singleton TTS Gateway instance
 *
 * Note: Must be initialized first with initTTSGateway()
 */
export function getTTSGateway(): ITTSGateway {
  if (!gatewayInstance) {
    throw new Error('TTS Gateway not initialized. Call initTTSGateway() first.');
  }
  return gatewayInstance;
}

/**
 * Initialize the TTS Gateway
 */
export function initTTSGateway(config: TTSGatewayConfig): ITTSGateway {
  if (gatewayInstance) {
    log.warn({}, 'TTS Gateway already initialized, returning existing instance');
    return gatewayInstance;
  }

  gatewayInstance = new TTSGateway(config);
  return gatewayInstance;
}

/**
 * Create a new TTS Gateway instance (for testing or custom configs)
 */
export function createTTSGateway(config: TTSGatewayConfig): ITTSGateway {
  return new TTSGateway(config);
}

/**
 * Reset the gateway (for testing)
 */
export function resetTTSGateway(): void {
  if (gatewayInstance) {
    gatewayInstance.shutdown().catch(() => {});
    gatewayInstance = null;
  }
}
