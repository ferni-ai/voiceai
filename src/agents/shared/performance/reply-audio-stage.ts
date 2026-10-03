/**
 * Stage 2 reply audio: an opening breath or sigh, and per-reply tempo,
 * applied to Cartesia's PCM after post-TTS enhancement.
 *
 * One TTS stream is one reply (one Cartesia context per reply). When the
 * stream is built (the reply's TTS start, before Cartesia's first byte) this
 * takes the plan for (sessionId, replyId) (`speech/reply-audio-plan.ts`) and:
 * - SPEECH_STAGE2_NONVERBAL=live + plan.opening: renders the breath/sigh in
 *   Rust at the configured output rate and enqueues it right away, so it
 *   plays while we wait for Cartesia instead of delaying the first word. It
 *   is never mixed over speech. A breath is followed by 60 ms of silence, as
 *   a speaker inhales and then starts; a sigh runs straight into speech.
 * - SPEECH_STAGE2_TEMPO=live + plan.tempo != 1: runs every frame through a
 *   streaming pitch-preserving stretcher (WSOLA) and re-frames its output
 *   to the incoming frame size.
 *
 * Late plan: the director decides on the reply's first text, which is
 * usually after TTS start. With no plan at TTS start the stage waits for one
 * (`onReplyAudioPlan`) until the first speech frame; a plan with no opening
 * may be followed by ONE update (the director's late long-sentence breath,
 * merged with the tempo), which is handled the same way. A plan that arrives
 * first has its opening enqueued at once (it plays during the rest of the
 * Cartesia wait) and speech queues after it. If the first speech frame
 * arrives first, the stage stops waiting: the opening is skipped (by then the
 * wait is over, and a breath there would only push speech back) and only a
 * plan already in the store by then supplies a tempo. The stage also stops
 * waiting when the reply ends or is cancelled.
 *
 * Lead (opening) frames are marked; `isReplyAudioLeadFrame` lets latency
 * checkpoints tell them from speech.
 *
 * With both gates off, or without a real session id and reply id (no id at
 * all means no Director ran on this stream: a filler, `say()`, a pre-tool
 * phrase, or a cached clip — review H2), `applyReplyAudioStage` returns the
 * input stream itself; with a gate on but no plan, frames pass through
 * untouched (the same AudioFrame objects).
 *
 * @module agents/shared/performance/reply-audio-stage
 */

import { AudioFrame } from '@livekit/rtc-node';
import {
  TransformStream as NodeTransformStream,
  type ReadableStream as NodeReadableStream,
  type Transformer,
  type TransformStreamDefaultController,
} from 'node:stream/web';

import {
  getStage2Gates,
  isPlannableSession,
  isReplyId,
  onReplyAudioPlan,
  takeReplyAudioPlan,
  type ReplyAudioPlan,
  type Stage2Gates,
} from '../../../speech/reply-audio-plan.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'ReplyAudioStage' });

/** Silence between an opening breath and the first word. */
export const BREATH_TO_SPEECH_GAP_MS = 60;
/** Frame size for the opening clip (the TTS frame size isn't known before speech). */
const LEAD_FRAME_MS = 20;
/** Cartesia's output rate: the opening's rate when the caller doesn't say. */
export const DEFAULT_OUTPUT_SAMPLE_RATE = 24000;
/** Crossfade from the last stretched sample into unstretched audio if the stretcher fails. */
export const TEMPO_FAILOVER_FADE_MS = 5;

const leadFrames = new WeakSet<AudioFrame>();

/** True for opening breath/sigh (and its gap) frames, false for speech. */
export function isReplyAudioLeadFrame(frame: AudioFrame): boolean {
  return leadFrames.has(frame);
}

interface TempoStretcherInstance {
  process: (frame: Float32Array) => Float32Array;
  flush: () => Float32Array;
}

/** The slice of `@ferni/audio` this stage uses. */
export interface ReplyAudioNative {
  /** (kind, durationMs, intensity, seed, sampleRate, f0Hz?) → mono PCM. */
  renderNonverbal: (
    ...args: [
      kind: string,
      durationMs: number,
      intensity: number,
      seed: number,
      sampleRate: number,
      f0Hz?: number,
    ]
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
  sessionId: string | undefined;
  /**
   * The id the gateway TTS node tagged this stream with
   * (`tts-gateway/reply-audio-id.ts`); a plan for a different reply never
   * applies, even in the same session or turn (review H2).
   */
  replyId: string | undefined;
  native: ReplyAudioNative;
  /** Defaults to the env gates read when the stream starts. */
  gates?: Stage2Gates;
  /** Rate the opening is rendered at (the TTS output rate). Default 24 kHz. */
  outputSampleRate?: number;
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

/** Render the opening (+ breath gap) as marked mono frames of LEAD_FRAME_MS. */
function renderLead(
  native: ReplyAudioNative,
  opening: NonNullable<ReplyAudioPlan['opening']>,
  sr: number
): AudioFrame[] {
  const { kind, intensity, durationMs, f0Hz } = opening;
  seedCounter = (seedCounter + 1) >>> 0;
  // f0Hz only when known, so an older binary (5 params) is called as before.
  const args = [kind, durationMs ?? 0, intensity, seedCounter, sr] as const;
  const pcm =
    f0Hz === undefined ? native.renderNonverbal(...args) : native.renderNonverbal(...args, f0Hz);
  const clip = float32ToInt16(pcm);
  const gap = kind === 'breath' ? Math.round((sr * BREATH_TO_SPEECH_GAP_MS) / 1000) : 0;
  const lead = new Int16Array(clip.length + gap);
  lead.set(clip);
  const frames: AudioFrame[] = [];
  const reframer = new Reframer(Math.round((sr * LEAD_FRAME_MS) / 1000), sr);
  reframer.push(lead, (f) => frames.push(f));
  reframer.end((f) => frames.push(f));
  for (const f of frames) leadFrames.add(f);
  return frames;
}

/** Fade the first TEMPO_FAILOVER_FADE_MS of `frame` in from `from` (a sample value). */
function fadeFrom(from: number, frame: AudioFrame): AudioFrame {
  const x = frameSamples(frame);
  const n = Math.min(x.length, Math.round((frame.sampleRate * TEMPO_FAILOVER_FADE_MS) / 1000));
  if (n === 0) return frame;
  const y = x.slice();
  for (let i = 0; i < n; i++) {
    const w = (i + 1) / (n + 1);
    y[i] = Math.round(from * (1 - w) + x[i] * w);
  }
  return new AudioFrame(y, frame.sampleRate, 1, y.length);
}

type Emit = (f: AudioFrame) => void;
type Controller = TransformStreamDefaultController<AudioFrame>;

/** One reply's speech through the stretcher, re-framed to the incoming frame size. */
class TempoPath {
  private stretcher: TempoStretcherInstance | null;
  private readonly reframer: Reframer;
  /** Last stretched sample emitted: where a failover crossfade starts. */
  private lastOut = 0;

  constructor(
    native: ReplyAudioNative,
    ratio: number,
    private readonly sr: number,
    private readonly size: number,
    private readonly sessionId: string | undefined
  ) {
    this.stretcher = new native.NativeTempoStretcher(sr, ratio);
    this.reframer = new Reframer(size, sr);
  }

  get active(): boolean {
    return this.stretcher !== null;
  }

  /** Stretch `frame`; returns the frame to pass through instead if tempo turned off on it. */
  process(frame: AudioFrame, emit: Emit): AudioFrame | null {
    const { sr, size, sessionId } = this;
    if (frame.sampleRate !== sr || frame.channels !== 1 || frame.samplesPerChannel > size) {
      const got = [frame.sampleRate, frame.channels, frame.samplesPerChannel];
      log.warn(
        { sessionId, sr, size, got },
        'Stage 2 tempo: frame format changed; passing through'
      );
      return this.stop(frame, emit, false);
    }
    let out: Float32Array;
    try {
      out = (this.stretcher as TempoStretcherInstance).process(int16ToFloat32(frameSamples(frame)));
    } catch (error) {
      // Stage 2 must not stop speech. Logged once: the stretcher is dropped.
      log.warn({ sessionId, error: String(error) }, 'Stage 2 tempo failed; passing through');
      return this.stop(frame, emit, true);
    }
    this.push(out, emit);
    return null;
  }

  /** End of reply: emit the stretcher's held-back tail. */
  flush(emit: Emit): void {
    try {
      if (this.stretcher) this.push(this.stretcher.flush(), emit);
    } catch (error) {
      log.warn({ sessionId: this.sessionId, error: String(error) }, 'Stage 2 tempo flush failed');
    }
    this.stretcher = null;
    this.reframer.end(emit);
  }

  private push(out: Float32Array, emit: Emit): void {
    const pcm = float32ToInt16(out);
    if (pcm.length) this.lastOut = pcm[pcm.length - 1];
    this.reframer.push(pcm, emit);
  }

  /** Stop stretching before `frame`; returns what to emit in its place. */
  private stop(frame: AudioFrame, emit: Emit, failed: boolean): AudioFrame {
    const { stretcher } = this;
    this.stretcher = null;
    if (!failed && stretcher) {
      try {
        this.push(stretcher.flush(), emit); // clean end: the tail lines up with `frame`
        this.reframer.end(emit);
        return frame;
      } catch {
        // flush failed too: crossfade below
      }
    }
    this.reframer.end(emit);
    // The stretcher's held-back ~45 ms is lost: fade in from where stretched audio stopped.
    return frame.channels === 1 ? fadeFrom(this.lastOut, frame) : frame;
  }
}

/** The stretcher for this reply's speech, or null (no tempo, 1, or not mono). */
function startTempo(
  native: ReplyAudioNative,
  ratio: number | undefined,
  first: AudioFrame,
  sessionId: string | undefined
): TempoPath | null {
  if (ratio === undefined || Math.abs(ratio - 1) <= 1e-3) return null;
  if (first.channels !== 1) {
    log.warn({ sessionId, channels: first.channels }, 'Stage 2 tempo needs mono; skipped');
    return null;
  }
  const sr = first.sampleRate;
  const size = first.samplesPerChannel || Math.round((sr * LEAD_FRAME_MS) / 1000);
  log.debug({ sessionId, tempo: ratio, sr }, 'Stage 2 tempo engaged');
  return new TempoPath(native, ratio, sr, size, sessionId);
}

/** One stream = one reply. */
export function createReplyAudioStage(
  options: ReplyAudioStageOptions
): NodeTransformStream<AudioFrame, AudioFrame> {
  const { sessionId, replyId, native } = options;
  const gates = options.gates ?? getStage2Gates();
  const outRate = options.outputSampleRate ?? DEFAULT_OUTPUT_SAMPLE_RATE;
  let plan: ReplyAudioPlan | undefined;
  let leadRate = 0;
  let started = false;
  let tempo: TempoPath | null = null;

  const begin = (first: AudioFrame): void => {
    started = true;
    if (!plan) {
      plan = takeReplyAudioPlan(sessionId, replyId);
      if (plan?.opening && gates.nonverbal) {
        log.debug(
          { sessionId, replyId },
          'Stage 2 plan arrived after TTS start; opening skipped'
        );
      }
    }
    if (leadRate && first.sampleRate !== leadRate) {
      log.warn({ sessionId, leadRate, speech: first.sampleRate }, 'Stage 2 opening rate mismatch');
    }
    if (gates.tempo) tempo = startTempo(native, plan?.tempo, first, sessionId);
  };

  let stopWaiting: (() => void) | null = null;
  const stopListening = (): void => {
    stopWaiting?.();
    stopWaiting = null;
  };
  /** Enqueue the plan's opening now (nothing of the reply's speech is out yet). */
  const playOpening = (controller: Controller): void => {
    if (!plan?.opening || !gates.nonverbal) return;
    try {
      for (const f of renderLead(native, plan.opening, outRate)) controller.enqueue(f);
      leadRate = outRate;
      log.debug({ sessionId, replyId, kind: plan.opening.kind, sr: outRate }, 'Stage 2 opening');
    } catch (error) {
      log.warn({ sessionId, error: String(error) }, 'Stage 2 opening failed; skipped');
    }
  };

  // `cancel` (Node 21+) ends the wait on playback stop; else TTL / first frame / end do.
  /** Wait for the plan; a plan with no opening may get `updates` more (a late breath). */
  const waitForPlan = (controller: Controller, updates: number): void => {
    stopWaiting = onReplyAudioPlan(sessionId, replyId, () => {
      stopWaiting = null;
      if (started) return;
      plan = { ...plan, ...takeReplyAudioPlan(sessionId, replyId) }; // an update keeps the tempo
      playOpening(controller);
      if (!plan?.opening && gates.nonverbal && updates > 0) waitForPlan(controller, updates - 1);
    });
  };
  const transformer: Transformer<AudioFrame, AudioFrame> & { cancel?: () => void } = {
    start(controller) {
      plan = takeReplyAudioPlan(sessionId, replyId);
      if (!plan) return waitForPlan(controller, 1);
      playOpening(controller);
      if (!plan.opening && gates.nonverbal) waitForPlan(controller, 0);
    },
    transform(frame, controller) {
      if (!started) {
        const awaitingUpdate = stopWaiting !== null;
        stopListening();
        // An opening that lands after speech started is skipped (it would delay speech);
        // consume and log it so a stale plan never lingers and misses are countable.
        if (awaitingUpdate && gates.nonverbal) {
          stopWaiting = onReplyAudioPlan(sessionId, replyId, () => {
            stopWaiting = null;
            const late = takeReplyAudioPlan(sessionId, replyId);
            if (late?.opening) {
              log.info(
                { sessionId, replyId, kind: late.opening.kind },
                'Stage 2 opening arrived after speech started; skipped'
              );
            }
          });
        }
        try {
          begin(frame);
        } catch (error) {
          log.warn({ sessionId, error: String(error) }, 'Stage 2 tempo setup failed; off');
          tempo = null;
        }
      }
      const pass = tempo?.active ? tempo.process(frame, (f) => controller.enqueue(f)) : frame;
      if (pass) controller.enqueue(pass);
    },
    flush(controller) {
      stopListening();
      tempo?.flush((f) => controller.enqueue(f));
      tempo = null;
    },
    cancel: stopListening,
  };
  return new NodeTransformStream<AudioFrame, AudioFrame>(transformer);
}

/**
 * Add Stage 2 after post-TTS enhancement. Returns `stream` itself when both
 * gates are off, without a real session id and reply id (no reply id means
 * no Director ran on this stream, so no plan could ever apply — review H2),
 * or when the native module can't load.
 */
export async function applyReplyAudioStage(
  stream: NodeReadableStream<AudioFrame>,
  sessionId: string | undefined,
  replyId: string | undefined,
  outputSampleRate?: number
): Promise<NodeReadableStream<AudioFrame>> {
  const gates = getStage2Gates();
  if (!gates.nonverbal && !gates.tempo) return stream;
  if (!isPlannableSession(sessionId) || !isReplyId(replyId)) return stream;
  const native = await loadNative();
  if (!native) return stream;
  return stream.pipeThrough(
    createReplyAudioStage({ sessionId, replyId, native, gates, outputSampleRate })
  );
}

/** For tests: forget the cached native module. */
export function resetReplyAudioNativeForTests(): void {
  nativeModule = null;
  nativeLoadAttempted = false;
}
