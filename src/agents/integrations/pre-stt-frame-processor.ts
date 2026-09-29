/**
 * Pre-STT Frame Processor for LiveKit
 *
 * Implements LiveKit's FrameProcessor<AudioFrame> to process user audio before
 * STT (use as session inputOptions.noiseCancellation). NOT WIRED: nothing
 * uses it. Browser callers already get AGC/noise suppression from the browser,
 * and server-side noise suppression measurably hurts Ink-2 (see
 * pre-stt-audio-integration.ts). The one case it could help is callers with no
 * browser processing, e.g. LiveKit SIP phone participants: AGC + high-pass cut
 * a quiet caller's word errors from 36.7% to 3.1% without hurting normal
 * speech. Wire it for those participants only, with the standard preset
 * (AGC + high-pass; noise suppression off).
 *
 * @module agents/integrations/pre-stt-frame-processor
 */

import { AudioFrame, FrameProcessor } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import {
  getOrCreateProcessor,
  PreSTTPresets,
  type PreSTTProcessor,
} from '../shared/performance/pre-stt-transform.js';

const log = getLogger();

/** Convert Float32 [-1,1] to Int16 for AudioFrame.data */
function float32ToInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Simple VAD: true if RMS above threshold */
function isSpeech(int16: Int16Array, threshold = 0.02): boolean {
  let sum = 0;
  for (let i = 0; i < int16.length; i++) {
    sum += int16[i]! * int16[i]!;
  }
  const rms = Math.sqrt(sum / int16.length) / 32768;
  return rms > threshold;
}

/**
 * LiveKit FrameProcessor that runs each input frame through Pre-STT (AGC, noise suppression).
 * The returned frame is what gets sent to the LLM/STT.
 */
export class PreSTTFrameProcessor extends FrameProcessor<AudioFrame> {
  private enabled = true;
  private processor: PreSTTProcessor;
  private sessionId: string;
  private closed = false;

  constructor(processor: PreSTTProcessor, sessionId: string) {
    super();
    this.processor = processor;
    this.sessionId = sessionId;
  }

  isEnabled(): boolean {
    return this.enabled && !this.closed;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  process(frame: AudioFrame): AudioFrame {
    if (this.closed || !this.enabled) {
      return frame;
    }
    try {
      // Pre-STT expects Int16Array; AudioFrame.data is Int16Array
      const int16 = frame.data;
      const speech = isSpeech(int16);
      const enhancedF32 = this.processor.processFrameI16(int16, speech);
      const enhancedInt16 = float32ToInt16(enhancedF32);
      return new AudioFrame(
        enhancedInt16,
        frame.sampleRate,
        frame.channels,
        frame.samplesPerChannel
      );
    } catch (err) {
      log.warn({ error: String(err), sessionId: this.sessionId }, 'Pre-STT frame process failed, passing through');
      return frame;
    }
  }

  close(): void {
    this.closed = true;
    this.enabled = false;
    // Processor is session-scoped and cleaned up by removeSessionProcessor elsewhere
  }
}

/**
 * Create a Pre-STT FrameProcessor for the given session.
 * Use as inputOptions.noiseCancellation when starting the session.
 * Session should use audioSampleRate: 16000 when using this (Pre-STT preset is 16k).
 *
 * @param sessionId - Session ID for processor caching
 * @returns PreSTTFrameProcessor instance, or null if Pre-STT unavailable
 */
export async function createPreSTTFrameProcessor(
  sessionId: string
): Promise<PreSTTFrameProcessor | null> {
  try {
    const processor = await getOrCreateProcessor(sessionId, PreSTTPresets.standard);
    const fp = new PreSTTFrameProcessor(processor, sessionId);
    log.info(
      { sessionId, usingRust: processor.isUsingRust() },
      '🎤 Pre-STT FrameProcessor created (enhanced audio → STT)'
    );
    return fp;
  } catch (err) {
    log.warn({ error: String(err), sessionId }, 'Pre-STT FrameProcessor not available');
    return null;
  }
}
