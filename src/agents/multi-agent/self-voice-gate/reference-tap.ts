/**
 * The self-voice gate's reference: Ferni's voice at the moment it plays. Wraps the
 * instance captureFrame/clearQueue of the room output's rtc AudioSource (and the
 * clip source) and keeps each frame at its SCHEDULED PLAYOUT time, capture time
 * plus what is queued ahead; clearQueue drops what never plays. The queue is
 * tracked here because rtc-node's clearQueue doesn't reset `queuedDuration`.
 * Wrappers fail open: errors are logged once and the original always runs.
 *
 * @module agents/multi-agent/self-voice-gate/reference-tap
 */
import type { AudioFrame } from '@livekit/rtc-node';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SelfVoiceReferenceTap' });

/** The mic's rate. 2 s covers a stalled mic frame (~0.4 s back) and a queued reply (≤1.4 s on). */
const REF_RATE = 16_000;
const PER_MS = REF_RATE / 1000;
const RING = 2 * REF_RATE;
/** Longest frame the tap schedules; TTS frames are 10–100 ms. */
const MAX_FRAME_MS = 1000;

/** One source's reference, decimated to 16 kHz mono, indexed by media sample (ms × 16). */
export class RefRing {
  private readonly ring = new Int16Array(RING);
  /** One past the newest written index; reads at or past it are silence. */
  private end = 0;

  write(frame: AudioFrame, atMs: number): void {
    // Every loop below must stay bounded on the audio path: a 0, NaN or tiny
    // rate or a huge sample count makes n unbounded, and past 2^53 i++ stops
    // moving i. A real frame is far under one ring (2 s), so skip anything else.
    if (!(frame.sampleRate > 0) || !Number.isFinite(atMs)) return;
    const start = Math.round(atMs * PER_MS);
    const n = Math.floor((frame.samplesPerChannel * REF_RATE) / frame.sampleRate);
    if (!(n > 0 && n <= RING) || start < 0 || !Number.isSafeInteger(start + n)) return;
    // Silence between the last write and this one (a gap between replies).
    for (let i = Math.max(this.end, start - RING); i < start; i++) this.ring[i % RING] = 0;
    const step = frame.sampleRate / REF_RATE;
    for (let k = 0; k < n; k++) {
      this.ring[(start + k) % RING] = frame.data[Math.floor(k * step) * frame.channels] ?? 0;
    }
    this.end = Math.max(this.end, start + n);
  }

  /** Forget everything scheduled from `ms` on. */
  clearAfter(ms: number): void {
    this.end = Math.min(this.end, Math.max(0, Math.ceil(ms * PER_MS)));
  }

  /** Mean square (0..1 of full scale) over [startMs, startMs + durMs). */
  meanSquare(startMs: number, durMs: number): number {
    const s = Math.round(startMs * PER_MS);
    const n = Math.round(durMs * PER_MS);
    const lo = Math.max(s, this.end - RING, 0);
    const hi = Math.min(s + n, this.end);
    let sum = 0;
    for (let i = lo; i < hi; i++) {
      const x = this.ring[i % RING];
      sum += x * x;
    }
    return n > 0 ? sum / n / 32768 ** 2 : 0;
  }
}

interface Tappable {
  captureFrame: (frame: AudioFrame) => Promise<void>;
  clearQueue: () => void;
}

const isTappable = (s: unknown): s is Tappable =>
  typeof (s as Tappable | null)?.captureFrame === 'function' &&
  typeof (s as Tappable | null)?.clearQueue === 'function';

const tapped = new WeakSet<object>();

/** Tap a source into `ring`, once: false when already tapped or not an audio source. */
export function tapAudioSource(
  source: unknown,
  ring: RefRing,
  opts: { now: () => number; onClear?: () => void }
): boolean {
  if (!isTappable(source) || tapped.has(source)) return false;
  tapped.add(source);
  const capture = source.captureFrame;
  const clear = source.clearQueue;
  let queueEnd = 0;
  let warned = false;
  const fail = (where: string, error: unknown): void => {
    if (warned) return;
    warned = true;
    log.warn({ where, error: String(error) }, 'self-voice reference tap failed open');
  };
  source.captureFrame = async function (this: Tappable, frame: AudioFrame): Promise<void> {
    try {
      // NaN fails both tests, so a malformed frame never moves queueEnd.
      const durMs = (frame.samplesPerChannel / frame.sampleRate) * 1000;
      if (durMs > 0 && durMs <= MAX_FRAME_MS) {
        const at = Math.max(queueEnd, opts.now());
        queueEnd = at + durMs;
        ring.write(frame, at);
      }
    } catch (error) {
      fail('captureFrame', error);
    }
    return capture.call(this, frame);
  };
  source.clearQueue = function (this: Tappable): void {
    try {
      const now = opts.now();
      queueEnd = now;
      ring.clearAfter(now);
      opts.onClear?.();
    } catch (error) {
      fail('clearQueue', error);
    }
    clear.call(this);
  };
  return true;
}
