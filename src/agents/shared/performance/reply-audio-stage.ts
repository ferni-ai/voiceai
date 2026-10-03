/**
 * Stage 2 reply audio: an opening breath or sigh, and per-reply tempo,
 * applied to Cartesia's PCM after post-TTS enhancement.
 *
 * One TTS stream is one reply (one Cartesia context per reply), so on the
 * stream's first frame this takes the session's pending ReplyAudioPlan
 * (`speech/reply-audio-plan.ts`) and:
 * - SPEECH_STAGE2_NONVERBAL=live + plan.opening: renders the breath/sigh in
 *   Rust at the stream's sample rate and emits it BEFORE the first speech
 *   frame (never mixed over speech). A breath is followed by 60 ms of
 *   silence, as a speaker inhales and then starts; a sigh runs straight into
 *   speech.
 * - SPEECH_STAGE2_TEMPO=live + plan.tempo != 1: runs every frame through a
 *   streaming pitch-preserving stretcher (WSOLA) and re-frames its output
 *   to the incoming frame size.
 *
 * With both gates off, `applyReplyAudioStage` returns the input stream
 * itself; with a gate on but no plan, frames pass through untouched (the
 * same AudioFrame objects).
 *
 * @module agents/shared/performance/reply-audio-stage
 */

import { AudioFrame } from '@livekit/rtc-node';
import {
  TransformStream as NodeTransformStream,
  type ReadableStream as NodeReadableStream,
} from 'node:stream/web';

import {
  getStage2Gates,
  takeReplyAudioPlan,
  type ReplyAudioPlan,
  type Stage2Gates,
} from '../../../speech/reply-audio-plan.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ReplyAudioStage' });

/** Silence between an opening breath and the first word. */
export const BREATH_TO_SPEECH_GAP_MS = 60;
/** Frame size used for the prepended clip when the stream's is unknown. */
const DEFAULT_FRAME_MS = 20;

interface TempoStretcherInstance {
  process: (frame: Float32Array) => Float32Array;
  flush: () => Float32Array;
}

/** The slice of `@ferni/audio` this stage uses. */
export interface ReplyAudioNative {
  renderNonverbal: (
    kind: string,
    durationMs: number,
    intensity: number,
    seed: number,
    sampleRate: number
  ) => Float32Array;
  NativeTempoStretcher: new (sampleRate: number, ratio: number) => TempoStretcherInstance;
}

let nativeModule: ReplyAudioNative | null = null;
let nativeLoadAttempted = false;

async function loadNative(): Promise<ReplyAudioNative | null> {
  if (nativeLoadAttempted) return nativeModule;
  nativeLoadAttempted = true;
  try {
    const mod = (await import('@ferni/audio')) as unknown as Partial<ReplyAudioNative> & {
      default?: Partial<ReplyAudioNative>;
    };
    const m = typeof mod.renderNonverbal === 'function' ? mod : mod.default;
    if (
      m &&
      typeof m.renderNonverbal === 'function' &&
      typeof m.NativeTempoStretcher === 'function'
    ) {
      nativeModule = m as ReplyAudioNative;
    } else {
      log.warn('@ferni/audio has no renderNonverbal/NativeTempoStretcher (stale binary?)');
    }
  } catch (error) {
    log.warn({ error: String(error) }, '@ferni/audio unavailable; Stage 2 reply audio off');
  }
  return nativeModule;
}

let seedCounter = (Date.now() >>> 0) ^ 0x5eed;

export function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
  }
  return out;
}

export function int16ToFloat32(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] / 32768;
  return out;
}

function frameSamples(frame: AudioFrame): Int16Array {
  return new Int16Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 2);
}

export interface ReplyAudioStageOptions {
  sessionId: string;
  native: ReplyAudioNative;
  /** Defaults to the env gates read when the stream starts. */
  gates?: Stage2Gates;
}

/**
 * Splits PCM into frames of `size` samples; the remainder waits for more
 * input or `end()`.
 */
class Reframer {
  private pending: Int16Array = new Int16Array(0);
  constructor(
    private readonly size: number,
    private readonly sampleRate: number
  ) {}

  push(samples: Int16Array, emit: (f: AudioFrame) => void): void {
    let buf = samples;
    if (this.pending.length) {
      buf = new Int16Array(this.pending.length + samples.length);
      buf.set(this.pending);
      buf.set(samples, this.pending.length);
    }
    let off = 0;
    for (; off + this.size <= buf.length; off += this.size) {
      emit(new AudioFrame(buf.slice(off, off + this.size), this.sampleRate, 1, this.size));
    }
    this.pending = buf.slice(off);
  }

  end(emit: (f: AudioFrame) => void): void {
    if (this.pending.length) {
      emit(new AudioFrame(this.pending, this.sampleRate, 1, this.pending.length));
      this.pending = new Int16Array(0);
    }
  }
}

/** One stream = one reply. */
export function createReplyAudioStage(
  options: ReplyAudioStageOptions
): NodeTransformStream<AudioFrame, AudioFrame> {
  const { sessionId, native } = options;
  let started = false;
  let stretcher: TempoStretcherInstance | null = null;
  let reframer: Reframer | null = null;

  const begin = (first: AudioFrame, emit: (f: AudioFrame) => void): void => {
    started = true;
    const plan: ReplyAudioPlan | undefined = takeReplyAudioPlan(sessionId);
    if (!plan) return;
    const gates = options.gates ?? getStage2Gates();
    if (first.channels !== 1) {
      log.warn({ sessionId, channels: first.channels }, 'Stage 2 reply audio needs mono; skipped');
      return;
    }
    const sr = first.sampleRate;
    const size = first.samplesPerChannel || Math.round((sr * DEFAULT_FRAME_MS) / 1000);

    if (gates.nonverbal && plan.opening) {
      const { kind, intensity, durationMs } = plan.opening;
      seedCounter = (seedCounter + 1) >>> 0;
      const clip = float32ToInt16(
        native.renderNonverbal(kind, durationMs ?? 0, intensity, seedCounter, sr)
      );
      const gap = kind === 'breath' ? Math.round((sr * BREATH_TO_SPEECH_GAP_MS) / 1000) : 0;
      const lead = new Int16Array(clip.length + gap);
      lead.set(clip);
      const leadFrames = new Reframer(size, sr);
      leadFrames.push(lead, emit);
      leadFrames.end(emit);
      log.debug(
        { sessionId, kind, intensity, samples: clip.length, sr },
        'Stage 2 opening rendered'
      );
    }

    if (gates.tempo && plan.tempo !== undefined && Math.abs(plan.tempo - 1) > 1e-3) {
      stretcher = new native.NativeTempoStretcher(sr, plan.tempo);
      reframer = new Reframer(size, sr);
      log.debug({ sessionId, tempo: plan.tempo, sr }, 'Stage 2 tempo engaged');
    }
  };

  return new NodeTransformStream<AudioFrame, AudioFrame>({
    transform(frame, controller) {
      const emit = (f: AudioFrame): void => controller.enqueue(f);
      try {
        if (!started) begin(frame, emit);
        if (stretcher && reframer) {
          const out = stretcher.process(int16ToFloat32(frameSamples(frame)));
          reframer.push(float32ToInt16(out), emit);
          return;
        }
      } catch (error) {
        // Stage 2 must not stop speech: drop it and pass the rest through (only
        // the ~45 ms the stretcher was holding is lost).
        log.warn(
          { sessionId, error: String(error) },
          'Stage 2 reply audio failed; passing through'
        );
        stretcher = null;
        reframer?.end(emit);
        reframer = null;
      }
      controller.enqueue(frame);
    },
    flush(controller) {
      const emit = (f: AudioFrame): void => controller.enqueue(f);
      try {
        if (stretcher && reframer) reframer.push(float32ToInt16(stretcher.flush()), emit);
      } catch (error) {
        log.warn({ sessionId, error: String(error) }, 'Stage 2 tempo flush failed');
      }
      reframer?.end(emit);
      stretcher = null;
      reframer = null;
    },
  });
}

/**
 * Add Stage 2 after post-TTS enhancement. Returns `stream` itself when both
 * gates are off or the native module can't load.
 */
export async function applyReplyAudioStage(
  stream: NodeReadableStream<AudioFrame>,
  sessionId: string | undefined
): Promise<NodeReadableStream<AudioFrame>> {
  const gates = getStage2Gates();
  if (!gates.nonverbal && !gates.tempo) return stream;
  const native = await loadNative();
  if (!native) return stream;
  return stream.pipeThrough(
    createReplyAudioStage({ sessionId: sessionId ?? 'unknown', native, gates })
  );
}

/** For tests: forget the cached native module. */
export function resetReplyAudioNativeForTests(): void {
  nativeModule = null;
  nativeLoadAttempted = false;
}
