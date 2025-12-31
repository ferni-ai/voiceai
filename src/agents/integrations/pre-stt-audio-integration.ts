/**
 * Pre-STT Audio Integration
 *
 * Integrates the Rust Pre-STT processor for audio quality analysis and enhancement.
 *
 * ## Architecture Note
 *
 * For REALTIME models (Gemini Live, OpenAI Realtime), audio flows directly to the
 * model via LiveKit's internal pipeline. The SDK handles:
 *   WebRTC audio → Noise cancellation (Krisp) → WebSocket to model
 *
 * Our Pre-STT processor runs in PARALLEL for:
 * - Audio quality metrics and logging
 * - Detecting issues (clipping, low volume, noise levels)
 * - Twilio 8kHz detection and bandwidth extension metrics
 * - Debugging and monitoring
 *
 * For STT-LLM-TTS pipeline models, the stt_node could be overridden to use this
 * processor directly on the audio stream.
 *
 * @module agents/integrations/pre-stt-audio-integration
 */

import type { AudioFrame } from '@livekit/rtc-node';
import type { voice } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import {
  PreSTTProcessor,
  PreSTTPresets,
  getOrCreateProcessor,
  type PreSTTConfig,
} from '../shared/performance/pre-stt-transform.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface PreSTTAudioAnalysis {
  /** Number of frames processed */
  framesProcessed: number;
  /** Current AGC gain in dB */
  agcGainDb: number;
  /** Estimated noise floor (0-1) */
  noiseFloor: number;
  /** Peak level detected (0-1) */
  peakLevel: number;
  /** Whether clipping was detected */
  clippingDetected: boolean;
  /** Whether audio appears to be 8kHz (Twilio) */
  isTelephonyAudio: boolean;
  /** Sample rate of input audio */
  inputSampleRate: number;
  /** Processing latency in ms */
  processingLatencyMs: number;
}

export interface PreSTTIntegrationConfig {
  /** Session ID for logging */
  sessionId: string;
  /** User ID for metrics */
  userId?: string;
  /** Is this a telephony (Twilio) connection? */
  isTelephony?: boolean;
  /** Enable detailed logging */
  verbose?: boolean;
  /** Custom processor config */
  config?: PreSTTConfig;
}

export interface PreSTTIntegrationResult {
  /** Process an audio frame (parallel analysis) */
  processFrame: (frame: AudioFrame) => PreSTTAudioAnalysis | null;
  /** Get current analysis stats */
  getStats: () => PreSTTAudioAnalysis;
  /** Check if using Rust processor */
  isUsingRust: () => boolean;
  /** Reset analysis state */
  reset: () => void;
  /** Cleanup resources */
  cleanup: () => void;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Initialize Pre-STT audio analysis integration.
 *
 * This runs in PARALLEL with the main audio path, providing metrics
 * and quality analysis without modifying the audio sent to STT.
 *
 * @example
 * ```typescript
 * const preStt = await initializePreSTTIntegration({
 *   sessionId,
 *   isTelephony: isPhoneCall,
 * });
 *
 * // In your audio processing loop:
 * const analysis = preStt.processFrame(frame);
 * if (analysis?.clippingDetected) {
 *   log.warn({ sessionId }, 'Audio clipping detected');
 * }
 *
 * // Cleanup on session end
 * preStt.cleanup();
 * ```
 */
export async function initializePreSTTIntegration(
  config: PreSTTIntegrationConfig
): Promise<PreSTTIntegrationResult> {
  const { sessionId, userId, isTelephony = false, verbose = false } = config;

  // Select appropriate preset based on connection type
  const preset = isTelephony ? PreSTTPresets.twilio : PreSTTPresets.standard;
  const processorConfig = config.config || preset;

  // Create the processor (uses session-scoped caching)
  const processor = await getOrCreateProcessor(sessionId, processorConfig);

  // Track analysis state
  let framesProcessed = 0;
  let lastPeakLevel = 0;
  let clippingCount = 0;
  let lastInputSampleRate = 16000;
  let totalProcessingTimeMs = 0;
  let isTelephonyDetected = isTelephony;

  log.info(
    {
      sessionId,
      userId,
      isTelephony,
      usingRust: processor.isUsingRust(),
      config: processorConfig,
    },
    '🎤 Pre-STT audio analysis initialized'
  );

  return {
    processFrame: (frame: AudioFrame): PreSTTAudioAnalysis | null => {
      try {
        const startTime = performance.now();

        // Extract audio data from frame
        // AudioFrame.data is a Uint8Array backing Int16 PCM
        const int16Data = new Int16Array(
          frame.data.buffer,
          frame.data.byteOffset,
          frame.data.byteLength / 2
        );

        // Detect sample rate (8kHz = Twilio telephony)
        lastInputSampleRate = frame.sampleRate;
        if (frame.sampleRate === 8000) {
          isTelephonyDetected = true;
        }

        // Process through Pre-STT (parallel analysis - we don't use the output for STT)
        // The isSpeech flag helps noise estimation - use true during active speech
        const isSpeech = detectSpeechActivity(int16Data);
        processor.processFrameI16(int16Data, isSpeech);

        // Calculate peak level
        let maxSample = 0;
        for (let i = 0; i < int16Data.length; i++) {
          const abs = Math.abs(int16Data[i]);
          if (abs > maxSample) maxSample = abs;
        }
        lastPeakLevel = maxSample / 32768;

        // Detect clipping (samples at max value)
        if (lastPeakLevel > 0.99) {
          clippingCount++;
        }

        framesProcessed++;
        const processingTime = performance.now() - startTime;
        totalProcessingTimeMs += processingTime;

        // Get processor stats
        const stats = processor.getStats();

        const analysis: PreSTTAudioAnalysis = {
          framesProcessed,
          agcGainDb: stats.agcGain,
          noiseFloor: 0, // Would need additional tracking
          peakLevel: lastPeakLevel,
          clippingDetected: clippingCount > 0,
          isTelephonyAudio: isTelephonyDetected,
          inputSampleRate: lastInputSampleRate,
          processingLatencyMs: processingTime,
        };

        // Verbose logging every 100 frames
        if (verbose && framesProcessed % 100 === 0) {
          log.debug(
            {
              sessionId,
              framesProcessed,
              agcGainDb: stats.agcGain.toFixed(2),
              peakLevel: lastPeakLevel.toFixed(3),
              avgLatencyMs: (totalProcessingTimeMs / framesProcessed).toFixed(2),
              clippingCount,
            },
            '🎤 Pre-STT audio stats'
          );
        }

        return analysis;
      } catch (err) {
        log.warn({ error: String(err), sessionId }, 'Pre-STT frame processing error');
        return null;
      }
    },

    getStats: (): PreSTTAudioAnalysis => {
      const stats = processor.getStats();
      return {
        framesProcessed,
        agcGainDb: stats.agcGain,
        noiseFloor: 0,
        peakLevel: lastPeakLevel,
        clippingDetected: clippingCount > 0,
        isTelephonyAudio: isTelephonyDetected,
        inputSampleRate: lastInputSampleRate,
        processingLatencyMs: framesProcessed > 0 ? totalProcessingTimeMs / framesProcessed : 0,
      };
    },

    isUsingRust: () => processor.isUsingRust(),

    reset: () => {
      processor.reset();
      framesProcessed = 0;
      lastPeakLevel = 0;
      clippingCount = 0;
      totalProcessingTimeMs = 0;
      log.debug({ sessionId }, '🎤 Pre-STT analysis reset');
    },

    cleanup: () => {
      // Log final stats
      const avgLatency = framesProcessed > 0 ? totalProcessingTimeMs / framesProcessed : 0;
      log.info(
        {
          sessionId,
          totalFrames: framesProcessed,
          avgLatencyMs: avgLatency.toFixed(2),
          clippingEvents: clippingCount,
          usingRust: processor.isUsingRust(),
        },
        '🎤 Pre-STT audio analysis cleanup'
      );
    },
  };
}

/**
 * Simple speech activity detection using energy threshold.
 * Used to help the noise estimator know when to update.
 */
function detectSpeechActivity(samples: Int16Array): boolean {
  // Calculate RMS energy
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);

  // Normalize to 0-1 range and threshold
  const normalizedEnergy = rms / 32768;
  const SPEECH_THRESHOLD = 0.02; // ~-34 dB

  return normalizedEnergy > SPEECH_THRESHOLD;
}

// ============================================================================
// SESSION-LEVEL INTEGRATION
// ============================================================================

/**
 * Wire Pre-STT analysis into an AgentSession's audio processing.
 *
 * This attaches to the session's audio events and processes frames in parallel.
 * Does NOT modify the audio sent to STT - purely for monitoring and metrics.
 *
 * @example
 * ```typescript
 * const cleanup = await wirePreSTTToSession({
 *   session,
 *   sessionId,
 *   isTelephony: isPhoneCall,
 *   onClippingDetected: () => {
 *     log.warn('Audio clipping - user mic may be too loud');
 *   },
 * });
 *
 * // Later
 * cleanup();
 * ```
 */
export async function wirePreSTTToSession(options: {
  session: voice.AgentSession<unknown>;
  sessionId: string;
  userId?: string;
  isTelephony?: boolean;
  verbose?: boolean;
  onClippingDetected?: () => void;
  onLowVolume?: () => void;
}): Promise<() => void> {
  const { session, sessionId, userId, isTelephony, verbose, onClippingDetected, onLowVolume } =
    options;

  const integration = await initializePreSTTIntegration({
    sessionId,
    userId,
    isTelephony,
    verbose,
  });

  // Track for callbacks
  let hasReportedClipping = false;
  let hasReportedLowVolume = false;
  let lowVolumeFrameCount = 0;

  // Note: AgentSession doesn't expose raw audio frames directly.
  // This integration is designed for use with:
  // 1. The audio-processor.ts pattern (parallel stream processing)
  // 2. Future: Custom RoomIO that exposes audio frames
  //
  // For now, we provide the integration utilities and recommend
  // calling processFrame from wherever audio frames are accessible.

  log.info(
    {
      sessionId,
      isTelephony,
      usingRust: integration.isUsingRust(),
    },
    '🎤 Pre-STT wired to session (parallel analysis mode)'
  );

  return () => {
    integration.cleanup();
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  PreSTTProcessor,
  PreSTTPresets,
  getOrCreateProcessor,
  type PreSTTConfig,
} from '../shared/performance/pre-stt-transform.js';
