/**
 * Pre-STT Frame Processor for phone (LiveKit SIP) callers
 *
 * A LiveKit FrameProcessor<AudioFrame> that runs the caller's audio through
 * automatic gain control + high-pass before STT, attached as the session's
 * inputOptions.noiseCancellation for SIP participants only.
 *
 * Why SIP only: browser callers already get AGC/noise suppression from the
 * browser; phone audio arrives with none. Measured on Cartesia Ink-2 with
 * phone-band audio as LiveKit SIP delivers it (60 utterances over 4 noise
 * realizations, scripts/audio-eval/stt-accuracy.ts, 2026-09-29):
 *
 *   caller              raw     AGC + high-pass
 *   normal line         2.2%    2.2%
 *   quiet (-22 dB)      27%     2.7%
 *   noisy (10 dB SNR)   9.2%    7.1%
 *
 * Noise suppression stays off: it hurts Ink-2 badly (see
 * pre-stt-audio-integration.ts). The AGC is the native (Rust) one; the
 * JavaScript fallback is a different design that was not measured, so
 * without the native module audio passes through untouched.
 *
 * @module agents/integrations/pre-stt-frame-processor
 */

import { AudioFrame, FrameProcessor, ParticipantKind } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { PreSTTPresets, PreSTTProcessor } from '../shared/performance/pre-stt-transform.js';

const log = getLogger();

/** The room input's audio rate unless the session sets another (LiveKit Agents default). */
export const ROOM_INPUT_SAMPLE_RATE = 24_000;

function float32ToInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export class PreSTTFrameProcessor extends FrameProcessor<AudioFrame> {
  private enabled = true;
  private closed = false;
  private warnedRate = false;

  constructor(
    private readonly processor: PreSTTProcessor,
    private readonly sampleRate: number,
    private readonly sessionId: string
  ) {
    super();
  }

  isEnabled(): boolean {
    return this.enabled && !this.closed;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  process(frame: AudioFrame): AudioFrame {
    if (!this.isEnabled() || frame.channels !== 1) return frame;
    if (frame.sampleRate !== this.sampleRate) {
      // The high-pass and AGC time constants are set for one rate.
      if (!this.warnedRate) {
        this.warnedRate = true;
        log.warn(
          { sessionId: this.sessionId, got: frame.sampleRate, expected: this.sampleRate },
          'Pre-STT: unexpected input rate, passing audio through'
        );
      }
      return frame;
    }
    try {
      // The AGC finds speech itself (it tracks the noise floor), so the
      // speech flag, used only by noise suppression, doesn't matter here.
      const out = float32ToInt16(this.processor.processFrameI16(frame.data, true));
      return new AudioFrame(out, frame.sampleRate, frame.channels, frame.samplesPerChannel);
    } catch (err) {
      log.warn(
        { error: String(err), sessionId: this.sessionId },
        'Pre-STT frame failed, passing through'
      );
      return frame;
    }
  }

  close(): void {
    this.closed = true;
    this.enabled = false;
    this.processor.reset();
  }
}

/** Phone callers reach the room as SIP participants. PRE_STT_SIP=off turns this off. */
export function wantsPhonePreStt(
  participant: { kind?: ParticipantKind } | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  return participant?.kind === ParticipantKind.SIP && env.PRE_STT_SIP !== 'off';
}

/**
 * The frame processor for a phone caller, or null when the native processor
 * isn't available (audio then goes to STT as before).
 */
export async function createPreSTTFrameProcessor(
  sessionId: string,
  sampleRate = ROOM_INPUT_SAMPLE_RATE
): Promise<PreSTTFrameProcessor | null> {
  try {
    const processor = new PreSTTProcessor({ ...PreSTTPresets.standard, sampleRate, sessionId });
    await processor.initialize();
    if (!processor.isUsingRust()) {
      log.warn({ sessionId }, 'Pre-STT: native processor unavailable, phone audio left as is');
      return null;
    }
    log.info({ sessionId, sampleRate }, 'Pre-STT: AGC + high-pass on phone caller audio');
    return new PreSTTFrameProcessor(processor, sampleRate, sessionId);
  } catch (err) {
    log.warn({ error: String(err), sessionId }, 'Pre-STT frame processor not available');
    return null;
  }
}
