/**
 * LiveKit Track Audio Sink
 *
 * Sends raw audio frames directly to a LiveKit audio track.
 * This bypasses session.say() and allows sending pre-generated audio.
 *
 * Use this sink when:
 * - You have pre-generated audio from the TTS gateway
 * - You want to use cached audio
 * - You need direct control over audio output
 *
 * @module speech/tts-gateway/sinks/livekit-track
 */

import type { AudioFrame, LocalAudioTrack } from '@livekit/rtc-node';
import { createRequire } from 'node:module';
import { createLogger } from '../../../utils/safe-logger.js';
import type { AudioFormat, IAudioSink } from '../types.js';

// FIX (Jan 2026): Create require for ESM compatibility
// ESM doesn't have global require, so we create one for dynamic imports
const require = createRequire(import.meta.url);

const log = createLogger({ module: 'LiveKitTrackSink' });

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default frame size in samples (40ms at 24kHz) */
const DEFAULT_FRAME_SIZE_SAMPLES = 960;

/** Default sample rate */
const DEFAULT_SAMPLE_RATE = 24000;

/** Default channels */
const DEFAULT_CHANNELS = 1;

// ============================================================================
// AUDIO FRAME UTILITIES
// ============================================================================

/**
 * Convert ArrayBuffer to AudioFrame array
 *
 * @param buffer - Raw PCM audio buffer (16-bit signed LE)
 * @param sampleRate - Sample rate in Hz
 * @param channels - Number of channels
 * @param samplesPerFrame - Samples per frame
 * @returns Array of AudioFrame objects
 */
export function bufferToAudioFrames(
  buffer: ArrayBuffer,
  sampleRate = DEFAULT_SAMPLE_RATE,
  channels = DEFAULT_CHANNELS,
  samplesPerFrame = DEFAULT_FRAME_SIZE_SAMPLES
): AudioFrame[] {
  // Import dynamically to avoid issues when AudioFrame isn't available
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AudioFrame } = require('@livekit/rtc-node') as {
    AudioFrame: typeof import('@livekit/rtc-node').AudioFrame;
  };

  const frames: AudioFrame[] = [];
  const data = new Int16Array(buffer);
  let offset = 0;

  while (offset < data.length) {
    const frameData = data.slice(offset, offset + samplesPerFrame * channels);
    if (frameData.length === 0) break;

    frames.push(new AudioFrame(frameData, sampleRate, channels, frameData.length / channels));

    offset += samplesPerFrame * channels;
  }

  return frames;
}

/**
 * Create an async generator from AudioFrame array
 */
async function* framesToAsyncIterable(frames: AudioFrame[]): AsyncIterable<AudioFrame> {
  for (const frame of frames) {
    yield frame;
  }
}

// ============================================================================
// TRACK SINK CLASS
// ============================================================================

/**
 * LiveKit Track Sink configuration
 */
export interface LiveKitTrackSinkConfig {
  /** Sample rate for audio frames */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Samples per frame */
  samplesPerFrame?: number;
  /** Inter-frame delay in ms (for pacing) */
  frameDelayMs?: number;
}

/**
 * LiveKit Track Audio Sink
 *
 * Sends raw audio frames directly to a LiveKit LocalAudioTrack.
 * This allows outputting pre-generated audio without going through session.say().
 */
export class LiveKitTrackSink implements IAudioSink {
  readonly name = 'livekit-track';

  private readonly track: LocalAudioTrack;
  private readonly sampleRate: number;
  private readonly channels: number;
  private readonly samplesPerFrame: number;
  private readonly frameDelayMs: number;
  private isReady_ = false;
  private isSending = false;

  constructor(track: LocalAudioTrack, config: LiveKitTrackSinkConfig = {}) {
    this.track = track;
    this.sampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.channels = config.channels ?? DEFAULT_CHANNELS;
    this.samplesPerFrame = config.samplesPerFrame ?? DEFAULT_FRAME_SIZE_SAMPLES;
    // Frame delay = frame duration in ms (for real-time playback pacing)
    this.frameDelayMs = config.frameDelayMs ?? (this.samplesPerFrame / this.sampleRate) * 1000;
    this.isReady_ = true;
  }

  /**
   * Send audio buffer to track
   *
   * Converts the buffer to AudioFrames and sends them with proper pacing.
   */
  async sendAudio(audio: ArrayBuffer, format: AudioFormat): Promise<void> {
    if (audio.byteLength === 0) {
      log.debug({}, 'Empty audio buffer, skipping');
      return;
    }

    if (this.isSending) {
      log.warn({}, 'Already sending audio, queuing not supported yet');
      // For now, just continue - in production might want a queue
    }

    this.isSending = true;

    try {
      const frames = bufferToAudioFrames(
        audio,
        format.sampleRate,
        format.channels,
        this.samplesPerFrame
      );

      log.debug(
        {
          audioBytes: audio.byteLength,
          frameCount: frames.length,
          sampleRate: format.sampleRate,
          channels: format.channels,
        },
        '🎵 Sending audio frames to track'
      );

      await this.sendFrames(framesToAsyncIterable(frames));
    } finally {
      this.isSending = false;
    }
  }

  /**
   * Send audio frames to track
   *
   * Sends frames with proper pacing for real-time playback.
   */
  async sendFrames(frames: AsyncIterable<AudioFrame>): Promise<void> {
    let frameCount = 0;
    const startTime = Date.now();

    for await (const frame of frames) {
      // Capture the frame to the track
      // Note: The exact method depends on LiveKit's API version
      // This is a placeholder - actual implementation may vary
      try {
        await this.captureFrame(frame);
        frameCount++;

        // Pace the frames for real-time playback
        if (this.frameDelayMs > 0) {
          await this.sleep(this.frameDelayMs);
        }
      } catch (error) {
        log.error({ error: String(error), frameCount }, 'Error capturing frame to track');
        break;
      }
    }

    const duration = Date.now() - startTime;
    log.debug({ frameCount, durationMs: duration }, '✅ Finished sending audio frames');
  }

  /**
   * Capture a single frame to the track
   *
   * Note: This method depends on LiveKit's LocalAudioTrack API.
   * The exact implementation may vary based on SDK version.
   */
  private async captureFrame(frame: AudioFrame): Promise<void> {
    // LocalAudioTrack has a captureFrame method in recent versions
    // If not available, we need to use a different approach
    if ('captureFrame' in this.track && typeof this.track.captureFrame === 'function') {
      await (this.track as { captureFrame: (frame: AudioFrame) => Promise<void> }).captureFrame(
        frame
      );
    } else {
      // Fallback: log warning and skip
      // In a real implementation, we'd need to handle this differently
      log.warn({}, 'Track does not support captureFrame - audio output not available');
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Check if sink is ready
   */
  isReady(): boolean {
    return this.isReady_;
  }

  /**
   * Flush - wait for pending audio to complete
   */
  async flush(): Promise<void> {
    // Wait for any pending send to complete
    while (this.isSending) {
      await this.sleep(10);
    }
  }

  /**
   * Mark sink as not ready
   */
  setNotReady(): void {
    this.isReady_ = false;
  }
}

/**
 * Create a LiveKit track sink
 */
export function createTrackSink(
  track: LocalAudioTrack,
  config?: LiveKitTrackSinkConfig
): LiveKitTrackSink {
  return new LiveKitTrackSink(track, config);
}
