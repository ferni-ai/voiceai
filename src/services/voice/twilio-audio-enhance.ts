/**
 * Twilio Audio Enhancement
 *
 * Applies Rust-accelerated audio processing to Twilio 8kHz audio:
 * - Bandwidth extension (8kHz → 16kHz) with harmonic regeneration
 * - AGC normalization for consistent volume
 * - Noise suppression for cleaner STT input
 *
 * This significantly improves STT accuracy for telephone audio compared
 * to simple linear interpolation upsampling.
 *
 * @module services/voice/twilio-audio-enhance
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  PreSTTProcessor,
  PreSTTPresets,
} from '../../utils/audio/pre-stt-transform.js';

const log = createLogger({ module: 'twilio-audio-enhance' });

// ============================================================================
// TYPES
// ============================================================================

export interface TwilioEnhanceConfig {
  /** Session ID for logging and caching */
  sessionId: string;
  /** Enable AGC normalization */
  enableAgc?: boolean;
  /** Enable noise suppression */
  enableNoiseSuppression?: boolean;
  /** Enable bandwidth extension (8kHz → 16kHz) */
  enableBandwidthExtension?: boolean;
  /** Enable high-pass filter (DC removal) */
  enableHighpass?: boolean;
}

export interface TwilioEnhanceResult {
  /** Enhanced audio samples (16kHz Float32) */
  samples: Float32Array;
  /** Whether Rust processing was used */
  usedRust: boolean;
  /** Processing time in ms */
  processingTimeMs: number;
}

export interface TwilioEnhancer {
  /** Enhance a frame of 8kHz audio */
  enhanceFrame: (samples8kHz: Int16Array, isSpeech?: boolean) => TwilioEnhanceResult;
  /** Get current AGC gain level */
  getAgcGain: () => number;
  /** Reset the processor state */
  reset: () => void;
  /** Check if using Rust */
  isUsingRust: () => boolean;
  /** Cleanup resources */
  cleanup: () => void;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const enhancers = new Map<string, { processor: PreSTTProcessor; initialized: boolean }>();

/**
 * Get or create a Twilio audio enhancer for a session.
 *
 * The enhancer is session-scoped and maintains state between frames
 * for optimal audio enhancement (AGC envelope tracking, noise estimation).
 *
 * @example
 * ```typescript
 * const enhancer = await getTwilioEnhancer({ sessionId: callSid });
 *
 * // Process each audio frame from Twilio
 * const result = enhancer.enhanceFrame(pcm8kHz);
 * const enhanced16kHz = result.samples;
 * ```
 */
export async function getTwilioEnhancer(config: TwilioEnhanceConfig): Promise<TwilioEnhancer> {
  // Defaults measured against Cartesia Ink-2 (scripts/audio-eval/stt-accuracy.ts,
  // 2026-09-29, 15 utterances): on 8 kHz phone audio every stage on gave 83.8%
  // word errors vs 2.2% raw; noise suppression alone 51.1%, bandwidth
  // extension alone 4.8%. AGC + high-pass matched raw (2.6%) and cut a quiet
  // caller's errors from 36.7% to 3.1%. So: AGC + high-pass, nothing else.
  const {
    sessionId,
    enableAgc = true,
    enableNoiseSuppression = false,
    enableBandwidthExtension = false,
    enableHighpass = true,
  } = config;

  // Check for existing enhancer
  let entry = enhancers.get(sessionId);

  if (!entry) {
    // Create new processor with Twilio preset
    const processor = new PreSTTProcessor({
      ...PreSTTPresets.twilio,
      sessionId,
      enableAgc,
      enableNoiseSuppression,
      enableBandwidthExtension,
      enableHighpass,
    });

    // Initialize asynchronously (loads Rust module)
    await processor.initialize();

    entry = { processor, initialized: true };
    enhancers.set(sessionId, entry);

    log.info(
      {
        sessionId,
        usingRust: processor.isUsingRust(),
        config: { enableAgc, enableNoiseSuppression, enableBandwidthExtension, enableHighpass },
      },
      '🎤 Twilio audio enhancer initialized'
    );
  }

  const processor = entry.processor;

  return {
    enhanceFrame: (samples8kHz: Int16Array, isSpeech = true): TwilioEnhanceResult => {
      const startTime = performance.now();

      // Bandwidth extension outputs 16 kHz; without it the processor stays at
      // 8 kHz and is upsampled here, so callers always get 16 kHz.
      const processed = processor.processFrameI16(samples8kHz, isSpeech);
      const enhanced = enableBandwidthExtension ? processed : upsample2x(processed);

      const processingTimeMs = performance.now() - startTime;

      return {
        samples: enhanced,
        usedRust: processor.isUsingRust(),
        processingTimeMs,
      };
    },

    getAgcGain: () => {
      const stats = processor.getStats();
      return stats.agcGain;
    },

    reset: () => {
      processor.reset();
    },

    isUsingRust: () => processor.isUsingRust(),

    cleanup: () => {
      const stats = processor.getStats();
      log.info(
        {
          sessionId,
          framesProcessed: stats.framesProcessed,
          finalAgcGain: stats.agcGain.toFixed(2),
          usedRust: processor.isUsingRust(),
        },
        '🎤 Twilio audio enhancer cleanup'
      );
      processor.reset();
      enhancers.delete(sessionId);
    },
  };
}

/** 8 kHz → 16 kHz by linear interpolation (what the bridge's fallback does). */
export function upsample2x(x: Float32Array): Float32Array {
  const out = new Float32Array(x.length * 2);
  for (let i = 0; i < x.length; i++) {
    out[2 * i] = x[i];
    out[2 * i + 1] = i + 1 < x.length ? (x[i] + x[i + 1]) / 2 : x[i];
  }
  return out;
}

/**
 * Remove a Twilio enhancer for a session.
 */
export function removeTwilioEnhancer(sessionId: string): boolean {
  const entry = enhancers.get(sessionId);
  if (entry) {
    entry.processor.reset();
    enhancers.delete(sessionId);
    log.debug({ sessionId }, 'Removed Twilio audio enhancer');
    return true;
  }
  return false;
}

/**
 * Get count of active enhancers.
 */
export function getActiveEnhancerCount(): number {
  return enhancers.size;
}

/**
 * Clear all enhancers (emergency cleanup).
 */
export function clearAllEnhancers(): number {
  const count = enhancers.size;
  for (const [sessionId, entry] of enhancers) {
    entry.processor.reset();
  }
  enhancers.clear();
  log.info({ clearedCount: count }, 'Cleared all Twilio audio enhancers');
  return count;
}

// ============================================================================
// STANDALONE FUNCTIONS
// ============================================================================

/**
 * Simple bandwidth extension using Rust (one-shot, no session state).
 *
 * Use this for one-off enhancement without maintaining session state.
 * For streaming audio, prefer `getTwilioEnhancer()` for stateful processing.
 *
 * @param samples8kHz - Int16Array of 8kHz audio samples
 * @returns Enhanced 16kHz Float32 samples
 */
export async function enhanceTwilioAudio(samples8kHz: Int16Array): Promise<Float32Array> {
  const processor = new PreSTTProcessor({
    ...PreSTTPresets.twilio,
    sessionId: 'one-shot',
  });

  await processor.initialize();

  const enhanced = processor.processFrameI16(samples8kHz, true);

  return enhanced;
}

/**
 * Convert Int16 samples to Buffer for Twilio bridge compatibility.
 */
export function float32ToInt16Buffer(samples: Float32Array): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1, 1] range
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    // Convert to Int16
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, i * 2);
  }
  return buffer;
}

/**
 * Convert Int16 Buffer to Float32 array.
 */
export function int16BufferToFloat32(buffer: Buffer): Float32Array {
  const samples = new Float32Array(buffer.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buffer.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getTwilioEnhancer,
  removeTwilioEnhancer,
  getActiveEnhancerCount,
  clearAllEnhancers,
  enhanceTwilioAudio,
  float32ToInt16Buffer,
  int16BufferToFloat32,
};
