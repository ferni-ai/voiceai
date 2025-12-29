/**
 * Post-TTS Audio Transform ("Better Than Human" Enhancement)
 *
 * Applies Rust-accelerated audio processing to Cartesia TTS output BEFORE WebRTC
 * to make Ferni's voice sound more human and natural than any human could be.
 *
 * Pipeline:
 * ```
 * Cartesia TTS → [THIS TRANSFORM] → WebRTC → User
 *                     ↓
 *               Rust DSP:
 *               - Breath injection at phrase boundaries
 *               - Spectral warmth (low-shelf EQ)
 *               - Micro-pitch modulation
 *               - Soft attack/release (phrase rounding)
 *               - Dynamic compression
 *               - Presence EQ boost
 * ```
 *
 * Performance Target: <1ms per 20ms frame (real-time safe)
 *
 * @module agents/shared/performance/post-tts-transform
 */

import { AudioFrame } from '@livekit/rtc-node';
import { TransformStream as NodeTransformStream } from 'node:stream/web';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'PostTTSTransform' });

// ============================================================================
// RUST NATIVE MODULE (Lazy loaded to avoid startup crash if not built)
// ============================================================================

/**
 * Post-TTS Enhancement Config matching the Rust struct PostTtsEnhancementConfig
 */
interface PostTtsEnhancementConfig {
  sampleRate: number;
  enableBreath: boolean;
  enableWarmth: boolean;
  enableMicroPitch: boolean;
  enableSoftEdges: boolean;
  enableCompression: boolean;
  enablePresence: boolean;
  breathProbability: number;
  warmthAmount: number;
  pitchModulationCents: number;
  softEdgeMs: number;
  compressionRatio: number;
  compressionThresholdDb: number;
  presenceBoostDb: number;
}

/**
 * Enhancement result from Rust PostTtsEnhancementResult
 */
interface PostTtsEnhancementResult {
  breathsInjected: number;
  edgesSoftened: number;
  warmthApplied: boolean;
  pitchModApplied: boolean;
  compressionApplied: boolean;
  presenceApplied: boolean;
}

/**
 * Rust audio module interface matching the actual NAPI exports
 */
interface RustAudioModule {
  // Main enhancement function
  enhanceTtsAudioInplace: (
    samples: Float32Array,
    config: PostTtsEnhancementConfig
  ) => Float32Array;

  // Enhancement with result stats
  enhanceTtsAudio: (samples: Float32Array, config: PostTtsEnhancementConfig) => PostTtsEnhancementResult;

  // Individual processing functions
  applySoftAttack: (samples: Float32Array, attackMs: number, sampleRate: number) => Float32Array;
  applySoftRelease: (samples: Float32Array, releaseMs: number, sampleRate: number) => Float32Array;
  applyWarmth: (samples: Float32Array, sampleRate: number, amount: number) => Float32Array;
  applyPresence: (samples: Float32Array, sampleRate: number, boostDb: number) => Float32Array;
  applyCompression: (
    samples: Float32Array,
    sampleRate: number,
    thresholdDb: number,
    ratio: number
  ) => Float32Array;

  // Utility functions
  getDefaultPostTtsConfig: () => PostTtsEnhancementConfig;
}

let rustModule: RustAudioModule | null = null;
let rustLoadAttempted = false;

/**
 * Lazily load the Rust native module
 */
async function getRustModule(): Promise<RustAudioModule | null> {
  if (rustModule) return rustModule;
  if (rustLoadAttempted) return null;

  rustLoadAttempted = true;

  try {
    // Dynamic import of the native addon
    // Cast through unknown because TypeScript doesn't know about NAPI exports
    const native = (await import('@ferni/audio')) as unknown;
    const module = native as RustAudioModule;

    // Verify the module has the expected functions
    if (typeof module.enhanceTtsAudioInplace !== 'function') {
      log.warn('Rust module loaded but missing enhanceTtsAudioInplace function');
      return null;
    }

    rustModule = module;
    log.info('🦀 Rust post-TTS module loaded successfully');
    return rustModule;
  } catch (error) {
    log.warn(
      { error: String(error) },
      '⚠️ Rust post-TTS module not available - using JavaScript fallback'
    );
    return null;
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface PostTTSConfig {
  /** Sample rate of the TTS output (Cartesia uses 24kHz) */
  sampleRate?: number;

  /** Enable breath injection at phrase boundaries */
  enableBreath?: boolean;
  /** Probability of breath injection (0-1) */
  breathProbability?: number;

  /** Enable spectral warmth (low-shelf EQ boost at ~300Hz) */
  enableWarmth?: boolean;
  /** Warmth amount (0-1, 0.3 = subtle, 0.7 = very warm) */
  warmthAmount?: number;

  /** Enable micro-pitch modulation for naturalness */
  enableMicroPitch?: boolean;
  /** Pitch modulation range in cents (±5-15 typical) */
  pitchModulationCents?: number;

  /** Enable soft attack/release for phrase rounding */
  enableSoftEdges?: boolean;
  /** Soft edge duration in milliseconds */
  softEdgeMs?: number;

  /** Enable dynamic compression */
  enableCompression?: boolean;
  /** Compression ratio (2:1 typical for voice) */
  compressionRatio?: number;
  /** Compression threshold in dB */
  compressionThresholdDb?: number;

  /** Enable presence EQ boost (2-4kHz) */
  enablePresence?: boolean;
  /** Presence boost in dB */
  presenceBoostDb?: number;

  /** Session ID for logging */
  sessionId?: string;

  /** Persona ID for logging */
  personaId?: string;

  /** Enable metrics tracking */
  enableMetrics?: boolean;
}

// Default config optimized for "Better Than Human" voice quality
const DEFAULT_CONFIG: Required<PostTTSConfig> = {
  sampleRate: 24000, // Cartesia output rate
  enableBreath: true,
  breathProbability: 0.15, // 15% chance at phrase boundaries
  enableWarmth: true,
  warmthAmount: 0.35, // Subtle warmth
  enableMicroPitch: false, // Disabled by default - can sound unnatural
  pitchModulationCents: 8, // Very subtle
  enableSoftEdges: true,
  softEdgeMs: 15, // 15ms attack/release for natural phrase edges
  enableCompression: true,
  compressionRatio: 2.0, // 2:1 gentle compression
  compressionThresholdDb: -18, // Catch peaks
  enablePresence: true,
  presenceBoostDb: 2.0, // Subtle clarity boost
  sessionId: 'unknown',
  personaId: 'ferni',
  enableMetrics: true,
};

// ============================================================================
// METRICS
// ============================================================================

export interface PostTTSMetrics {
  totalFramesProcessed: number;
  totalProcessingTimeMs: number;
  avgProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  breathsInjected: number;
  framesWithBreath: number;
  bypassedFrames: number;
}

const metrics: PostTTSMetrics = {
  totalFramesProcessed: 0,
  totalProcessingTimeMs: 0,
  avgProcessingTimeMs: 0,
  maxProcessingTimeMs: 0,
  breathsInjected: 0,
  framesWithBreath: 0,
  bypassedFrames: 0,
};

/**
 * Get post-TTS processing metrics
 */
export function getPostTTSMetrics(): PostTTSMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetPostTTSMetrics(): void {
  metrics.totalFramesProcessed = 0;
  metrics.totalProcessingTimeMs = 0;
  metrics.avgProcessingTimeMs = 0;
  metrics.maxProcessingTimeMs = 0;
  metrics.breathsInjected = 0;
  metrics.framesWithBreath = 0;
  metrics.bypassedFrames = 0;
}

// ============================================================================
// AUDIO CONVERSION UTILITIES
// ============================================================================

/**
 * Convert Int16 PCM samples to Float32 (-1.0 to 1.0 range)
 */
function int16ToFloat32(int16Samples: Int16Array): Float32Array {
  const float32Samples = new Float32Array(int16Samples.length);
  for (let i = 0; i < int16Samples.length; i++) {
    // Int16 range: -32768 to 32767
    // Float32 range: -1.0 to 1.0
    float32Samples[i] = int16Samples[i] / 32768;
  }
  return float32Samples;
}

/**
 * Convert Float32 samples back to Int16 PCM with clipping
 */
function float32ToInt16(float32Samples: Float32Array): Int16Array {
  const int16Samples = new Int16Array(float32Samples.length);
  for (let i = 0; i < float32Samples.length; i++) {
    // Clip to [-1, 1] range then scale
    const clipped = Math.max(-1, Math.min(1, float32Samples[i]));
    int16Samples[i] = Math.round(clipped * 32767);
  }
  return int16Samples;
}

// ============================================================================
// JAVASCRIPT FALLBACK IMPLEMENTATIONS
// ============================================================================

/**
 * JavaScript fallback for soft attack (raised cosine fade-in)
 */
function jsApplySoftAttack(samples: Float32Array, attackMs: number, sampleRate: number): void {
  const attackSamples = Math.floor((attackMs / 1000) * sampleRate);
  for (let i = 0; i < attackSamples && i < samples.length; i++) {
    // Raised cosine: 0.5 * (1 - cos(π * i / N))
    const envelope = 0.5 * (1 - Math.cos(Math.PI * (i / attackSamples)));
    samples[i] *= envelope;
  }
}

/**
 * JavaScript fallback for soft release (raised cosine fade-out)
 */
function jsApplySoftRelease(samples: Float32Array, releaseMs: number, sampleRate: number): void {
  const releaseSamples = Math.floor((releaseMs / 1000) * sampleRate);
  const startIdx = Math.max(0, samples.length - releaseSamples);
  for (let i = startIdx; i < samples.length; i++) {
    const position = i - startIdx;
    // Raised cosine: 0.5 * (1 + cos(π * position / N))
    const envelope = 0.5 * (1 + Math.cos(Math.PI * (position / releaseSamples)));
    samples[i] *= envelope;
  }
}

/**
 * Simple JavaScript RMS compression (not as good as Rust but works)
 */
function jsApplySimpleCompression(
  samples: Float32Array,
  thresholdDb: number,
  ratio: number
): void {
  const thresholdLinear = Math.pow(10, thresholdDb / 20);

  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > thresholdLinear) {
      // Apply compression above threshold
      const over = abs - thresholdLinear;
      const compressed = thresholdLinear + over / ratio;
      samples[i] = samples[i] > 0 ? compressed : -compressed;
    }
  }
}

// ============================================================================
// MAIN PROCESSING FUNCTION
// ============================================================================

/**
 * Process an audio frame with "Better Than Human" enhancements
 *
 * @param frame - Input AudioFrame from Cartesia TTS
 * @param config - Enhancement configuration
 * @returns Enhanced AudioFrame (or original if processing unavailable)
 */
async function processFrame(
  frame: AudioFrame,
  config: Required<PostTTSConfig>,
  rust: RustAudioModule | null
): Promise<AudioFrame> {
  const startTime = performance.now();

  // Get raw sample data from frame
  // AudioFrame stores Int16 PCM in frame.data (Uint8Array backing buffer)
  // We need to interpret it as Int16Array
  const frameData = frame.data;
  const int16Samples = new Int16Array(
    frameData.buffer,
    frameData.byteOffset,
    frameData.byteLength / 2
  );

  // Convert to Float32 for processing
  let float32Samples = int16ToFloat32(int16Samples);

  // Apply enhancements using Rust or JavaScript fallback
  if (rust) {
    // Use Rust for full enhancement pipeline (fastest)
    // Note: Rust config uses camelCase to match NAPI-RS conversion from snake_case
    const rustConfig: PostTtsEnhancementConfig = {
      sampleRate: config.sampleRate,
      enableBreath: config.enableBreath,
      enableWarmth: config.enableWarmth,
      enableMicroPitch: config.enableMicroPitch,
      enableSoftEdges: config.enableSoftEdges,
      enableCompression: config.enableCompression,
      enablePresence: config.enablePresence,
      breathProbability: config.breathProbability,
      warmthAmount: config.warmthAmount,
      pitchModulationCents: config.pitchModulationCents,
      softEdgeMs: config.softEdgeMs,
      compressionRatio: config.compressionRatio,
      compressionThresholdDb: config.compressionThresholdDb,
      presenceBoostDb: config.presenceBoostDb,
    };
    float32Samples = rust.enhanceTtsAudioInplace(float32Samples, rustConfig);
  } else {
    // JavaScript fallback (subset of features)
    if (config.enableSoftEdges) {
      jsApplySoftAttack(float32Samples, config.softEdgeMs, config.sampleRate);
      jsApplySoftRelease(float32Samples, config.softEdgeMs, config.sampleRate);
    }
    if (config.enableCompression) {
      jsApplySimpleCompression(
        float32Samples,
        config.compressionThresholdDb,
        config.compressionRatio
      );
    }
    // Note: warmth, presence, breath, micro-pitch require Rust
  }

  // Convert back to Int16
  const enhancedInt16 = float32ToInt16(float32Samples);

  // Create new AudioFrame with enhanced data
  const enhancedFrame = new AudioFrame(
    enhancedInt16,
    config.sampleRate,
    1, // mono
    enhancedInt16.length
  );

  // Track metrics
  const processingTime = performance.now() - startTime;
  metrics.totalFramesProcessed++;
  metrics.totalProcessingTimeMs += processingTime;
  metrics.avgProcessingTimeMs = metrics.totalProcessingTimeMs / metrics.totalFramesProcessed;
  if (processingTime > metrics.maxProcessingTimeMs) {
    metrics.maxProcessingTimeMs = processingTime;
  }

  return enhancedFrame;
}

// ============================================================================
// TRANSFORM STREAM
// ============================================================================

/**
 * Create a post-TTS transform stream that enhances audio frames
 *
 * Usage:
 * ```typescript
 * const audioStream = await someTTSFunction(text);
 * const enhancedStream = audioStream.pipeThrough(
 *   createPostTTSTransform({ sessionId, personaId })
 * );
 * ```
 */
export function createPostTTSTransform(
  config: PostTTSConfig = {}
): NodeTransformStream<AudioFrame, AudioFrame> {
  const fullConfig: Required<PostTTSConfig> = { ...DEFAULT_CONFIG, ...config };
  let rust: RustAudioModule | null = null;
  let isFirstFrame = true;
  let frameCount = 0;

  return new NodeTransformStream<AudioFrame, AudioFrame>({
    async start() {
      // Load Rust module during stream initialization
      rust = await getRustModule();

      if (rust) {
        log.info(
          { sessionId: fullConfig.sessionId, personaId: fullConfig.personaId },
          '🦀 Post-TTS Rust enhancement pipeline initialized'
        );
      } else {
        log.info(
          { sessionId: fullConfig.sessionId },
          '📦 Post-TTS JavaScript fallback initialized (limited features)'
        );
      }
    },

    async transform(frame, controller) {
      frameCount++;

      // Log first frame info
      if (isFirstFrame) {
        isFirstFrame = false;
        log.debug(
          {
            sessionId: fullConfig.sessionId,
            sampleRate: fullConfig.sampleRate,
            config: {
              breath: fullConfig.enableBreath,
              warmth: fullConfig.enableWarmth,
              softEdges: fullConfig.enableSoftEdges,
              compression: fullConfig.enableCompression,
              presence: fullConfig.enablePresence,
            },
          },
          '🎙️ Post-TTS processing first frame'
        );
      }

      try {
        const enhancedFrame = await processFrame(frame, fullConfig, rust);
        controller.enqueue(enhancedFrame);
      } catch (error) {
        // On error, pass through original frame
        log.warn(
          { error: String(error), sessionId: fullConfig.sessionId, frame: frameCount },
          'Post-TTS processing error - passing through original'
        );
        metrics.bypassedFrames++;
        controller.enqueue(frame);
      }
    },

    flush() {
      // Log final metrics
      if (fullConfig.enableMetrics && frameCount > 0) {
        log.info(
          {
            sessionId: fullConfig.sessionId,
            personaId: fullConfig.personaId,
            framesProcessed: frameCount,
            avgProcessingTimeMs: metrics.avgProcessingTimeMs.toFixed(2),
            maxProcessingTimeMs: metrics.maxProcessingTimeMs.toFixed(2),
            breathsInjected: metrics.breathsInjected,
            bypassedFrames: metrics.bypassedFrames,
            rustEnabled: rust !== null,
          },
          '📊 Post-TTS enhancement metrics'
        );
      }
    },
  });
}

// ============================================================================
// STREAM WRAPPER FUNCTION
// ============================================================================

/**
 * Wrap an audio stream with post-TTS enhancement
 *
 * This is the main entry point for integrating with tts-wrapper.ts
 *
 * @param audioStream - Input audio stream from TTS
 * @param config - Enhancement configuration
 * @returns Enhanced audio stream
 */
export async function applyPostTTSEnhancement(
  audioStream: NodeReadableStream<AudioFrame>,
  config: PostTTSConfig = {}
): Promise<NodeReadableStream<AudioFrame>> {
  // Check if post-TTS enhancement is enabled
  if (process.env.POST_TTS_ENHANCEMENT_ENABLED === 'false') {
    log.debug({ sessionId: config.sessionId }, 'Post-TTS enhancement disabled by env');
    return audioStream;
  }

  const transform = createPostTTSTransform(config);
  return audioStream.pipeThrough(transform as unknown as NodeTransformStream<AudioFrame, AudioFrame>);
}

/**
 * Check if post-TTS enhancement is available
 */
export async function isPostTTSAvailable(): Promise<boolean> {
  const rust = await getRustModule();
  return rust !== null;
}

// ============================================================================
// PRESETS FOR DIFFERENT SCENARIOS
// ============================================================================

/**
 * Preset configurations for different voice scenarios
 */
export const PostTTSPresets = {
  /** Default "Better Than Human" preset - all enhancements */
  betterThanHuman: {
    enableBreath: true,
    breathProbability: 0.15,
    enableWarmth: true,
    warmthAmount: 0.35,
    enableSoftEdges: true,
    softEdgeMs: 15,
    enableCompression: true,
    compressionRatio: 2.0,
    compressionThresholdDb: -18,
    enablePresence: true,
    presenceBoostDb: 2.0,
  } satisfies Partial<PostTTSConfig>,

  /** Minimal processing - just soft edges for smooth transitions */
  minimal: {
    enableBreath: false,
    enableWarmth: false,
    enableSoftEdges: true,
    softEdgeMs: 10,
    enableCompression: false,
    enablePresence: false,
  } satisfies Partial<PostTTSConfig>,

  /** Warm and intimate - for emotional/supportive content */
  warmIntimate: {
    enableBreath: true,
    breathProbability: 0.2,
    enableWarmth: true,
    warmthAmount: 0.5,
    enableSoftEdges: true,
    softEdgeMs: 20,
    enableCompression: true,
    compressionRatio: 2.5,
    compressionThresholdDb: -20,
    enablePresence: false, // Less presence for softer sound
    presenceBoostDb: 0,
  } satisfies Partial<PostTTSConfig>,

  /** Clear and energetic - for action-oriented content */
  clearEnergetic: {
    enableBreath: true,
    breathProbability: 0.1,
    enableWarmth: true,
    warmthAmount: 0.2,
    enableSoftEdges: true,
    softEdgeMs: 12,
    enableCompression: true,
    compressionRatio: 3.0, // More compression for punchier sound
    compressionThresholdDb: -15,
    enablePresence: true,
    presenceBoostDb: 3.0, // More presence for clarity
  } satisfies Partial<PostTTSConfig>,

  /** Bypass - no processing (for debugging) */
  bypass: {
    enableBreath: false,
    enableWarmth: false,
    enableMicroPitch: false,
    enableSoftEdges: false,
    enableCompression: false,
    enablePresence: false,
  } satisfies Partial<PostTTSConfig>,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createPostTTSTransform,
  applyPostTTSEnhancement,
  isPostTTSAvailable,
  getPostTTSMetrics,
  resetPostTTSMetrics,
  PostTTSPresets,
};
