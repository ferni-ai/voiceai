/**
 * STT_AUDIO_DIAGNOSTICS: what each STT stream was fed and what came back, so
 * "the caller talked but nothing was transcribed" can be read from prod logs.
 *
 * 2026-10-30 ~18:02Z: the VAD saw five ~0.5 s speaking bursts and Cartesia STT
 * returned no transcript, not even an interim, for the rest of the call. The
 * logs could not tell STT being fed silence (a client mic problem) from speech
 * it did not transcribe. With the flag on, each STT stream logs:
 *   - STT_AUDIO (info) every 30 s: frames, share of all-zero frames, peak and
 *     RMS dBFS, sample rate, and how many interim/final transcripts came back;
 *   - STT_HEARD_NO_WORDS (warn) when the VAD reports 3 speaking bursts within
 *     20 s and no transcript follows any of them, with the levels since the
 *     first burst (`audio`: silent / near_silent / present);
 *   - STT_INPUT_DISCARD (warn) when the SDK starts or stops sending STT silence
 *     in place of the caller's audio (AEC warm-up, uninterruptible speech).
 * No transcript text. Per frame: one pass over its samples, then O(1) sums.
 *
 * @module agents/model-provider/stt-audio-diagnostics
 */
import { stt } from '@livekit/agents';
import { flagOn, type Env } from '../../config/env-flag.js';
import { registerInterval } from '../../utils/interval-manager.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  AudioLevels,
  NO_WORDS_BURSTS,
  NO_WORDS_SPAN_MS,
  NoWordsDetector,
} from './stt-audio-levels.js';

const log = createLogger({ module: 'SttAudioDiagnostics' });

const WINDOW_MS = 30_000;
const { INTERIM_TRANSCRIPT, PREFLIGHT_TRANSCRIPT, FINAL_TRANSCRIPT } = stt.SpeechEventType;

export interface AudioFrameLike {
  data: Int16Array;
  sampleRate: number;
}
interface DiagnosticsSink {
  info: (fields: object, msg: string) => void;
  warn: (fields: object, msg: string) => void;
}
export interface DiagnosticsOptions {
  env?: Env;
  sink?: DiagnosticsSink;
  now?: () => number;
  /** Runs `fn` every `ms`; returns a stop. */
  every?: (ms: number, fn: () => void) => () => void;
}
type Resolved = Required<DiagnosticsOptions>;
export type DiscardReason = 'aec_warmup' | 'uninterruptible_speech';

let intervalSeq = 0;
function resolve(o: DiagnosticsOptions): Resolved {
  return {
    env: o.env ?? process.env,
    sink: o.sink ?? log,
    now: o.now ?? Date.now,
    every: o.every ?? ((ms, fn) => registerInterval(`stt-audio-window-${++intervalSeq}`, fn, ms)),
  };
}

interface Hub {
  current?: StreamWatch;
  discardReason?: () => DiscardReason | null;
}
const hubs = new WeakMap<object, Hub>();
function hubFor(sttInstance: object): Hub {
  let hub = hubs.get(sttInstance);
  if (!hub) hubs.set(sttInstance, (hub = {}));
  return hub;
}

class StreamWatch {
  #window = new AudioLevels();
  #sinceBurst = new AudioLevels();
  #windowStart: number;
  #sampleRate = 0;
  #interim = 0;
  #final = 0;
  #noWords = new NoWordsDetector();
  #discard: DiscardReason | null = null;
  #discardSince = 0;
  #stop: () => void;

  constructor(
    private readonly stream: number,
    private readonly hub: Hub,
    private readonly o: Resolved
  ) {
    this.#windowStart = o.now();
    this.#stop = o.every(WINDOW_MS, () => this.flush());
  }

  onFrame(frame: AudioFrameLike): void {
    const { data } = frame;
    if (!data?.length) return;
    let peak = 0;
    let sum = 0;
    for (const s of data) {
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
      sum += s * s;
    }
    this.#sampleRate = frame.sampleRate;
    this.#window.add(peak, sum, data.length);
    this.#sinceBurst.add(peak, sum, data.length);
    this.#checkDiscard();
  }

  onEvent(type: unknown): void {
    if (type === INTERIM_TRANSCRIPT || type === PREFLIGHT_TRANSCRIPT) this.#interim += 1;
    else if (type === FINAL_TRANSCRIPT) this.#final += 1;
    else return;
    this.#noWords.onWords();
  }

  onUserSpeaking(): void {
    const now = this.o.now();
    if (this.#noWords.idle(now)) this.#sinceBurst = new AudioLevels();
    if (!this.#noWords.onSpeaking(now)) return;
    this.o.sink.warn(
      {
        stream: this.stream,
        bursts: NO_WORDS_BURSTS,
        spanMs: NO_WORDS_SPAN_MS,
        sampleRate: this.#sampleRate,
        ...this.#sinceBurst.summary(),
      },
      'STT_HEARD_NO_WORDS'
    );
  }

  flush(): void {
    const now = this.o.now();
    this.o.sink.info(
      {
        stream: this.stream,
        windowMs: now - this.#windowStart,
        sampleRate: this.#sampleRate,
        ...this.#window.summary(),
        interim: this.#interim,
        final: this.#final,
      },
      'STT_AUDIO'
    );
    this.#window = new AudioLevels();
    this.#windowStart = now;
    this.#interim = 0;
    this.#final = 0;
  }

  close(): void {
    this.#stop();
    this.flush();
  }

  #checkDiscard(): void {
    let reason: DiscardReason | null = null;
    try {
      reason = this.hub.discardReason?.() ?? null;
    } catch (error) {
      // SDK internals moved: stop probing (STT_AUDIO's zero share still shows the silence).
      this.hub.discardReason = undefined;
      this.o.sink.warn(
        { stream: this.stream, error: String(error) },
        'STT_INPUT_DISCARD_UNREADABLE'
      );
      return;
    }
    if (reason === this.#discard) return;
    const now = this.o.now();
    const fields = reason
      ? { stream: this.stream, discarding: true, reason }
      : {
          stream: this.stream,
          discarding: false,
          reason: this.#discard,
          durationMs: now - this.#discardSince,
        };
    this.o.sink.warn(fields, 'STT_INPUT_DISCARD');
    this.#discard = reason;
    this.#discardSince = now;
  }
}

interface WatchableStream {
  pushFrame: (frame: AudioFrameLike) => void;
  next: () => Promise<IteratorResult<{ type?: unknown }>>;
  close: () => void;
}
function isWatchable(s: unknown): s is WatchableStream {
  const w = s as Partial<WatchableStream> | null;
  return (
    typeof w?.pushFrame === 'function' &&
    typeof w.next === 'function' &&
    typeof w.close === 'function'
  );
}

/** Wraps a new STT stream's input, output and close (flag off: does nothing). */
export function watchSttStream(
  sttInstance: object,
  stream: unknown,
  streamNumber: number,
  options: DiagnosticsOptions = {}
): void {
  const o = resolve(options);
  if (!flagOn('STT_AUDIO_DIAGNOSTICS', o.env) || !isWatchable(stream)) return;
  const hub = hubFor(sttInstance);
  const watch = new StreamWatch(streamNumber, hub, o);
  hub.current = watch;
  const { pushFrame, next, close } = stream;
  stream.pushFrame = (frame) => {
    watch.onFrame(frame);
    pushFrame.call(stream, frame);
  };
  stream.next = async () => {
    const result = await next.call(stream);
    if (!result.done) watch.onEvent(result.value?.type);
    return result;
  };
  stream.close = () => {
    watch.close();
    if (hub.current === watch) hub.current = undefined;
    close.call(stream);
  };
}

interface SessionAudioView {
  on?: (event: string, fn: (ev: { newState?: string }) => void) => unknown;
  agentState?: string;
  _aecWarmupRemaining?: number;
  _activity?: { shouldDiscardInputAudio?: () => boolean };
}

/**
 * Why the SDK is sending STT silence right now, or null. Reads the SDK's own
 * predicate (AgentActivity.shouldDiscardInputAudio, TS-private) rather than
 * copying it; the reason comes from the public AEC warm-up state.
 */
export function inputAudioDiscardReason(session: unknown): DiscardReason | null {
  const s = session as SessionAudioView;
  const activity = s._activity;
  if (typeof activity?.shouldDiscardInputAudio !== 'function') return null;
  if (!activity.shouldDiscardInputAudio()) return null;
  return s.agentState === 'speaking' && (s._aecWarmupRemaining ?? 0) > 0
    ? 'aec_warmup'
    : 'uninterruptible_speech';
}

/** Feeds the session's VAD speaking bursts and discard state to the STT's watch (flag off: nothing). */
export function watchSessionSttAudio(
  session: unknown,
  sttInstance: unknown,
  options: DiagnosticsOptions = {}
): void {
  const o = resolve(options);
  const on = (session as SessionAudioView | null)?.on;
  if (!flagOn('STT_AUDIO_DIAGNOSTICS', o.env) || typeof on !== 'function') return;
  if (typeof sttInstance !== 'object' || sttInstance === null) return;
  const hub = hubFor(sttInstance);
  hub.discardReason = () => inputAudioDiscardReason(session);
  on.call(session, 'user_state_changed', (ev) => {
    if (ev?.newState === 'speaking') hub.current?.onUserSpeaking();
  });
}
