/**
 * TTS Gateway Types and Interfaces
 *
 * Clean architecture interfaces for the Text-to-Speech Gateway.
 * All components depend on these abstractions, not concrete implementations.
 *
 * @module speech/tts-gateway/types
 */

import type { AudioFrame } from '@livekit/rtc-node';
import type {
  TransformStream as NodeTransformStream,
  ReadableStream as NodeReadableStream,
} from 'node:stream/web';

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Audio format specification
 */
export interface AudioFormat {
  /** Sample rate in Hz (e.g., 24000) */
  sampleRate: number;
  /** Number of audio channels (1 = mono, 2 = stereo) */
  channels: number;
  /** Bits per sample (e.g., 16 for PCM s16le) */
  bitsPerSample: number;
  /** Encoding format */
  encoding: 'pcm_s16le' | 'pcm_f32le' | 'mp3' | 'wav';
}

/**
 * Default audio format (matches LiveKit/Cartesia standard)
 */
export const DEFAULT_AUDIO_FORMAT: AudioFormat = {
  sampleRate: 24000,
  channels: 1,
  bitsPerSample: 16,
  encoding: 'pcm_s16le',
};

/**
 * SSML prosody configuration extracted from tags
 */
export interface SSMLProsodyConfig {
  /** Speech speed multiplier (0.6 to 1.5) */
  speed?: number;
  /** Volume multiplier (0.5 to 2.0) */
  volume?: number;
  /** Emotion for voice modulation */
  emotion?: string;
  /** Emotion intensity (0.0 to 1.0) */
  emotionIntensity?: number;
  /** Speaking style (e.g. "whisper", "storytelling", "sarcastic", "news-anchor") */
  style?: string;
  /** Social register (e.g. "professional", "casual", "intimate", "parental") */
  register?: string;
  /** Physiological state affecting voice (e.g. "tired", "crying", "hoarse", "breathless") */
  physiologicalState?: string;
  /** Paralinguistic sound to inject (e.g. "sigh", "throat_clear", "chuckle") */
  paralinguistic?: string;
}

/**
 * Result of SSML parsing
 */
export interface SSMLParseResult {
  /** Clean text with SSML tags processed/removed */
  cleanText: string;
  /** Extracted prosody configuration */
  prosody: SSMLProsodyConfig;
  /** Whether any SSML was found */
  hadSSML: boolean;
  /** Original tags found (for debugging) */
  originalTags: string[];
  /** Warnings encountered during parsing */
  warnings: string[];
}

/**
 * TTS request to be processed
 */
export interface TTSRequest {
  /** Text to synthesize (may contain SSML) */
  text: string;
  /** Voice identifier (Cartesia UUID or persona name) */
  voiceId: string;
  /** Optional prosody overrides */
  prosody?: SSMLProsodyConfig;
  /** Session ID for tracking */
  sessionId?: string;
  /** Persona ID for context */
  personaId?: string;
  /** Priority level */
  priority?: 'high' | 'normal' | 'low';
  /** Whether to allow caching */
  allowCache?: boolean;
  /** Request metadata for tracing */
  metadata?: Record<string, unknown>;
}

/**
 * TTS generation result
 */
export interface TTSResult {
  /** Generated audio data */
  audio: ArrayBuffer;
  /** Audio duration in milliseconds */
  durationMs: number;
  /** Whether result came from cache */
  cached: boolean;
  /** Cache source if cached */
  cacheSource?: string;
  /** Prosody config that was applied */
  appliedProsody?: SSMLProsodyConfig;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Provider that generated the audio */
  provider: string;
  /** Trace ID for debugging */
  traceId: string;
}

/**
 * Audio frame stream result (for streaming to LiveKit)
 */
export interface AudioFrameStream {
  /** Async iterator of audio frames */
  frames: AsyncIterable<AudioFrame>;
  /** Total duration in milliseconds (if known) */
  durationMs?: number;
  /** Audio format */
  format: AudioFormat;
}

// ============================================================================
// VOICE BIOMARKERS (matches Rust protocol)
// ============================================================================

/**
 * Real-time voice analysis metrics from the Rust pipeline.
 * Used by HiggsPipelineProvider for STT biomarker data.
 */
export interface VoiceBiomarkers {
  pitch_hz: number;
  energy: number;
  jitter: number;
  shimmer: number;
  breathiness: number;
  speech_rate: number;
  is_speech: boolean;
}

/**
 * Humanization info returned by the Rust TTS pipeline.
 * Describes which humanization stages were applied to synthesized audio.
 */
export interface HumanizationInfo {
  stages_applied: string[];
  breath_count: number;
  filler_count: number;
}

/**
 * Transcription result from STT-capable providers.
 */
export interface TranscriptResult {
  text: string;
  biomarkers?: VoiceBiomarkers;
  latencyMs: number;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * TTS Provider interface
 *
 * Abstraction for different TTS backends (Cartesia, ElevenLabs, etc.)
 * Implementations handle the actual audio generation.
 */
export interface ITTSProvider {
  /** Provider identifier */
  readonly name: string;

  /**
   * Generate audio from text (non-streaming)
   *
   * @param text - Clean text to synthesize (no SSML)
   * @param voiceId - Voice identifier
   * @param prosody - Optional prosody configuration
   * @returns Generated audio buffer
   */
  synthesize(text: string, voiceId: string, prosody?: SSMLProsodyConfig): Promise<ArrayBuffer>;

  /**
   * Stream audio generation from a text stream (collects text, then streams audio)
   *
   * @param textStream - Stream of text chunks
   * @param voiceId - Voice identifier
   * @param prosody - Optional prosody configuration
   * @returns Stream of audio frames
   */
  synthesizeStream?(
    textStream: AsyncIterable<string>,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): AsyncIterable<ArrayBuffer>;

  /**
   * Stream audio generation from a complete text string.
   * Unlike synthesize() which waits for all audio, this yields audio chunks
   * as they are generated by the model — enabling low-latency playback.
   *
   * @param text - Complete text to synthesize
   * @param voiceId - Voice identifier
   * @param prosody - Optional prosody configuration
   * @returns Async iterable of audio chunks (s16le PCM)
   */
  synthesizeStreaming?(
    text: string,
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): AsyncIterable<ArrayBuffer>;

  /**
   * Check if provider is available/healthy
   */
  isAvailable(): Promise<boolean>;

  /**
   * Estimate audio duration from text
   *
   * @param text - Text to estimate
   * @returns Estimated duration in milliseconds
   */
  estimateDuration(text: string): number;
}

/**
 * Extended TTS Provider with STT capabilities
 *
 * Used by providers like HiggsPipelineProvider that support both
 * text-to-speech and speech-to-text over the same connection.
 */
export interface ITTSProviderWithSTT extends ITTSProvider {
  /** Send raw user audio (i16 LE PCM) for STT buffering */
  sendUserAudio(frames: Int16Array): Promise<void>;
  /** Trigger server-side transcription of buffered audio */
  triggerTranscription(): Promise<TranscriptResult>;
  /** Register a callback for push-based transcript events */
  onTranscript(cb: (result: TranscriptResult) => void): void;
  /** Disconnect from the server and clean up */
  disconnect(): Promise<void>;
}

// ============================================================================
// CACHE INTERFACE
// ============================================================================

/**
 * Cache entry metadata
 */
export interface CacheEntry {
  /** Audio data */
  audio: ArrayBuffer;
  /** Duration in milliseconds */
  durationMs: number;
  /** When entry was created */
  createdAt: number;
  /** Voice ID used */
  voiceId: string;
  /** Prosody config used (affects cache key) */
  prosody?: SSMLProsodyConfig;
  /** Hit count for LRU tracking */
  hitCount: number;
}

/**
 * TTS Cache interface
 *
 * Abstraction for caching generated audio.
 * Supports multiple cache tiers (greeting, conversational, speculative).
 */
export interface ITTSCache {
  /**
   * Look up cached audio
   *
   * @param text - Text to look up (will be normalized)
   * @param voiceId - Voice identifier
   * @param prosody - Optional prosody (affects cache key)
   * @returns Cached entry or null
   */
  get(text: string, voiceId: string, prosody?: SSMLProsodyConfig): Promise<CacheEntry | null>;

  /**
   * Store audio in cache
   *
   * @param text - Text that was synthesized
   * @param voiceId - Voice identifier
   * @param audio - Generated audio data
   * @param durationMs - Audio duration
   * @param prosody - Prosody config used
   */
  set(
    text: string,
    voiceId: string,
    audio: ArrayBuffer,
    durationMs: number,
    prosody?: SSMLProsodyConfig
  ): Promise<void>;

  /**
   * Check if text is cached (without retrieving)
   */
  has(text: string, voiceId: string, prosody?: SSMLProsodyConfig): Promise<boolean>;

  /**
   * Clear specific entry
   */
  delete(text: string, voiceId: string, prosody?: SSMLProsodyConfig): Promise<void>;

  /**
   * Clear all entries
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): CacheStats;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries in cache */
  size: number;
  /** Total cache lookups */
  lookups: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Memory usage estimate in bytes */
  memoryBytes: number;
}

// ============================================================================
// AUDIO SINK INTERFACE
// ============================================================================

/**
 * Audio Sink interface
 *
 * Abstraction for where audio gets sent (LiveKit session, track, file, etc.)
 * Decouples audio generation from delivery.
 */
export interface IAudioSink {
  /** Sink identifier */
  readonly name: string;

  /**
   * Send audio buffer to sink
   *
   * @param audio - Audio data to send
   * @param format - Audio format specification
   */
  sendAudio(audio: ArrayBuffer, format: AudioFormat): Promise<void>;

  /**
   * Send audio frames to sink (for streaming)
   *
   * @param frames - Async iterable of audio frames
   */
  sendFrames(frames: AsyncIterable<AudioFrame>): Promise<void>;

  /**
   * Check if sink is ready to receive audio
   */
  isReady(): boolean;

  /**
   * Signal that no more audio is coming
   */
  flush(): Promise<void>;
}

// ============================================================================
// SSML PROCESSOR INTERFACE
// ============================================================================

/**
 * SSML Processor interface
 *
 * Handles SSML parsing, buffering, and transformation.
 */
export interface ISSMLProcessor {
  /**
   * Parse SSML from text
   *
   * @param text - Text potentially containing SSML tags
   * @returns Parse result with clean text and extracted config
   */
  parse(text: string): SSMLParseResult;

  /**
   * Create a transform stream that buffers complete SSML tags
   *
   * @returns TransformStream that ensures SSML tags aren't fragmented
   */
  createBufferTransform(): NodeTransformStream<string, string>;

  /**
   * Normalize text for cache key generation
   *
   * @param text - Text to normalize
   * @returns Normalized text (lowercase, SSML stripped, whitespace collapsed)
   */
  normalizeForCache(text: string): string;
}

// ============================================================================
// GATEWAY INTERFACE
// ============================================================================

/**
 * Gateway options for initialization
 */
export interface TTSGatewayConfig {
  /** TTS provider to use */
  provider: ITTSProvider;
  /** Cache implementation (optional) */
  cache?: ITTSCache;
  /** Default audio format */
  audioFormat?: AudioFormat;
  /** Enable tracing */
  enableTracing?: boolean;
  /** Maximum text length for non-streaming */
  maxNonStreamingLength?: number;
}

/**
 * TTS Gateway interface
 *
 * Main entry point for all TTS operations.
 * Coordinates SSML processing, caching, and audio generation.
 */
export interface ITTSGateway {
  /**
   * Synthesize text to audio
   *
   * Handles SSML parsing, cache lookup, and provider selection.
   *
   * @param request - TTS request
   * @returns TTS result with audio
   */
  synthesize(request: TTSRequest): Promise<TTSResult>;

  /**
   * Speak to an audio sink
   *
   * Convenience method that synthesizes and sends to a sink.
   *
   * @param request - TTS request
   * @param sink - Audio sink to send to
   */
  speakTo(request: TTSRequest, sink: IAudioSink): Promise<void>;

  /**
   * Create a streaming pipeline for text-to-audio
   *
   * @param voiceId - Voice identifier
   * @param prosody - Optional prosody config
   * @returns Transform that converts text stream to processed text stream
   */
  createTextPipeline(
    voiceId: string,
    prosody?: SSMLProsodyConfig
  ): (textStream: NodeReadableStream<string>) => NodeReadableStream<string>;

  /**
   * Warmup the gateway (prewarm caches, check provider health)
   */
  warmup(): Promise<void>;

  /**
   * Get gateway statistics
   */
  getStats(): GatewayStats;

  /**
   * Shutdown gateway cleanly
   */
  shutdown(): Promise<void>;
}

/**
 * Gateway statistics
 */
export interface GatewayStats {
  /** Total requests processed */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Cache statistics */
  cache: CacheStats | null;
  /** Average processing time in ms */
  avgProcessingTimeMs: number;
  /** Provider name */
  provider: string;
  /** Whether gateway is healthy */
  healthy: boolean;
}

// ============================================================================
// TRACING TYPES
// ============================================================================

/**
 * Trace event types
 */
export type TraceEventType =
  | 'request_received'
  | 'ssml_parsed'
  | 'cache_lookup'
  | 'cache_hit'
  | 'cache_miss'
  | 'provider_call'
  | 'provider_complete'
  | 'sink_send'
  | 'complete'
  | 'error';

/**
 * Trace event
 */
export interface TraceEvent {
  type: TraceEventType;
  timestamp: number;
  durationMs?: number;
  data?: Record<string, unknown>;
}

/**
 * Complete trace for a TTS request
 */
export interface TTSTrace {
  traceId: string;
  request: TTSRequest;
  events: TraceEvent[];
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  outcome: 'success' | 'error' | 'pending';
  error?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Voice ID resolver function type
 */
export type VoiceIdResolver = (personaOrVoiceId: string) => string;

/**
 * Duration estimator function type
 */
export type DurationEstimator = (text: string) => number;

/**
 * Logger interface (subset of our safe-logger)
 */
export interface ILogger {
  debug(data: Record<string, unknown>, message: string): void;
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

/**
 * Disposable interface for cleanup
 * Matches the DI container's Disposable pattern
 */
export interface Disposable {
  dispose(): void | Promise<void>;
}

// VoiceBiomarkers is defined above in this file (line ~146).
// higgs-pipeline.ts re-exports it FROM here, so no circular re-export needed.
