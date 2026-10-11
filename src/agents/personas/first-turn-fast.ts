/**
 * FIRST_TURN_FAST=on: end the caller's first turn on local silence when Ink is late.
 *
 * Ink-2 ends the first turn of a stream much later than later turns: on dev
 * (245 calls, 2026-10-08..10) eouDelayMs p50 was 1,047 ms on turn 1 vs 383 ms
 * after. Its transcript is usually complete well before that (the eval calls'
 * user captions had every word p50 342 ms after the caller stopped on turn 1),
 * so on turn 1 only the turn also ends once ALL of these hold:
 *
 * - the caller has been silent for SILENCE_MS (audio time, frame energy),
 * - the speech before it lasted at least MIN_SPEECH_MS,
 * - Ink's running transcript is non-empty and has not changed for STABLE_MS.
 *
 * Ink's last words can still arrive ~1.2 s late on a long first sentence
 * ("...kind of a" then "long day"); the stability wait is what keeps those
 * words in. Replaying 100 eval turns, SILENCE_MS 800 + STABLE_MS 500 ended
 * turn 1 at p50 842 ms after speech with no turn-1 transcript cut short (1 of
 * 100 turns overall); 600 + 500 cut 1 of 27 turn-1s for a 10 ms gain.
 *
 * Whichever comes first wins. When this ends the turn, Ink's own end of that
 * turn is dropped; words Ink adds after it (the caller kept going) go out as
 * a new turn, which the session handles as the caller speaking again.
 * Turns 2+ are never touched.
 *
 * @module agents/personas/first-turn-fast
 */

import { stt } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream, TransformStream } from 'node:stream/web';
import { createLogger } from '../../utils/safe-logger.js';
import {
  eotContinuedMergeEnabled,
  isMergeableTail,
  lateWordsMerger,
  type LateWordsMerger,
} from './late-words.js';

const log = createLogger({ module: 'FirstTurnFast' });

export const SILENCE_MS = 800;
export const STABLE_MS = 500;
export const MIN_SPEECH_MS = 1500;

type Event = stt.SpeechEvent | string;

export function firstTurnFastEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.FIRST_TURN_FAST === 'on';
}

const words = (text: string): string[] => text.split(/\s+/).filter((w) => /\w/.test(w));

/** How far back the noise floor looks. Longer than a first sentence, so the floor is the line's quiet. */
const FLOOR_WINDOW_MS = 5000;

/**
 * Voice from frame energy: louder than 150 and 10 dB over the quietest frame
 * of the last FLOOR_WINDOW_MS (our Cartesia plugin patch's rule, over a longer
 * window: with 1.5 s, steady speech longer than that set its own floor).
 */
export class VoiceClock {
  audioMs = 0;
  private levels: Array<[rms: number, ms: number]> = [];
  private runStartMs: number | null = null;
  private lastVoicedMs: number | null = null;

  push(samples: Int16Array, ms: number): void {
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = Math.sqrt(sum / Math.max(1, samples.length));
    const start = this.audioMs;
    this.audioMs += ms;
    this.levels.push([rms, ms]);
    let windowMs = this.levels.reduce((a, [, d]) => a + d, 0);
    while (windowMs > FLOOR_WINDOW_MS && this.levels.length > 1) {
      windowMs -= this.levels.shift()?.[1] ?? 0;
    }
    const floor = Math.min(...this.levels.map(([r]) => r));
    if (rms <= 150 || rms <= floor * 3.16) return;
    // A pause shorter than SILENCE_MS stays inside one stretch of speech.
    if (this.lastVoicedMs === null || start - this.lastVoicedMs >= SILENCE_MS)
      this.runStartMs = start;
    this.lastVoicedMs = this.audioMs;
  }

  /** Silence since the last voiced frame, and how long the speech before it ran. */
  get silenceMs(): number {
    return this.lastVoicedMs === null ? 0 : this.audioMs - this.lastVoicedMs;
  }

  get speechMs(): number {
    return this.lastVoicedMs === null || this.runStartMs === null
      ? 0
      : this.lastVoicedMs - this.runStartMs;
  }
}

/**
 * The turn-1 decision over one STT stream. `onFrame` and `onEvent` return the
 * events to pass downstream.
 */
export class FirstTurnGate {
  private state: 'waiting' | 'inTurn' | 'ahead' | 'done' = 'waiting';
  private latest: stt.SpeechData | undefined;
  private changedAt = 0;
  private committed = 0;
  private continued = false;
  private endedAt = 0;
  private said = '';
  /** Late words held back while they may still join turn 1 (EOT_CONTINUED_MERGE). */
  private held: { tail: string[]; alt: stt.SpeechData } | null = null;
  readonly voice = new VoiceClock();
  /** Set when EOT_CONTINUED_MERGE=on: late words may join turn 1 (late-words.ts). */
  lateWords: LateWordsMerger | undefined;

  constructor(private readonly now: () => number = Date.now) {}

  onFrame(samples: Int16Array, ms: number): Event[] {
    this.voice.push(samples, ms);
    const latest = this.latest;
    const text = latest?.text ?? '';
    if (
      !latest ||
      this.state !== 'inTurn' ||
      !words(text).length ||
      this.voice.silenceMs < SILENCE_MS ||
      this.voice.speechMs < MIN_SPEECH_MS ||
      this.now() - this.changedAt < STABLE_MS
    ) {
      return [];
    }
    this.state = 'ahead';
    this.committed = words(text).length;
    this.said = text;
    this.endedAt = this.now();
    log.info(
      { silenceMs: Math.round(this.voice.silenceMs), words: this.committed },
      'FIRST_TURN_FAST ended turn 1'
    );
    return [
      { type: stt.SpeechEventType.FINAL_TRANSCRIPT, alternatives: [{ ...latest, text }] },
      { type: stt.SpeechEventType.END_OF_SPEECH },
    ];
  }

  onEvent(ev: Event): Event[] {
    if (typeof ev === 'string' || this.state === 'done') return [ev];
    const T = stt.SpeechEventType;
    if (this.state === 'waiting') {
      if (ev.type === T.START_OF_SPEECH) this.state = 'inTurn';
      return [ev];
    }
    if (this.state === 'inTurn') {
      if (ev.type === T.END_OF_SPEECH) this.state = 'done';
      const alt = ev.alternatives?.[0];
      if (alt && alt.text !== this.latest?.text) {
        if (words(alt.text).join(' ') !== words(this.latest?.text ?? '').join(' ')) {
          this.changedAt = this.now();
        }
        this.latest = alt;
      }
      return [ev];
    }
    return this.afterEarlyEnd(ev);
  }

  /** Ink is still in the turn we ended: pass on only words it adds. */
  private afterEarlyEnd(ev: stt.SpeechEvent): Event[] {
    const T = stt.SpeechEventType;
    if (ev.type === T.END_OF_SPEECH) {
      this.state = 'done';
      log.info(
        { inkLaterMs: this.now() - this.endedAt, continued: this.continued || !!this.held },
        'FIRST_TURN_FAST ink end'
      );
      if (this.held) return this.settleHeld(ev);
      return this.continued ? [ev] : [];
    }
    if (ev.type === T.START_OF_SPEECH) return [];
    const alt = ev.alternatives?.[0];
    if (!alt) return [ev]; // usage reports
    const extra = words(alt.text).slice(this.committed);
    if (!extra.length) return [];
    if (!this.continued && this.lateWords?.open() && isMergeableTail(extra, this.said)) {
      this.held = { tail: extra, alt };
      return [];
    }
    const out: Event[] = [];
    if (!this.continued) {
      this.continued = true;
      this.held = null;
      out.push({ type: T.START_OF_SPEECH });
    }
    out.push({ ...ev, alternatives: [{ ...alt, text: extra.join(' ') }] });
    return out;
  }

  /** At Ink's end: join the held words to turn 1, or pass them on as a new turn. */
  private settleHeld(end: stt.SpeechEvent): Event[] {
    const { tail, alt } = this.held!;
    this.held = null;
    const text = tail.join(' ');
    if (this.lateWords?.merge(text, this.said)) return [];
    this.continued = true;
    log.info({ words: tail.length }, 'EOT_CONTINUED_MERGE fell back to a new turn');
    const T = stt.SpeechEventType;
    return [
      { type: T.START_OF_SPEECH },
      { type: T.FINAL_TRANSCRIPT, alternatives: [{ ...alt, text }] },
      end,
    ];
  }
}

interface SessionLike {
  readonly userData?: unknown;
  readonly agentState?: string;
  /** The agent running this STT stream; late words of turn 1 may join its chat context. */
  readonly currentAgent?: Parameters<typeof lateWordsMerger>[0];
}

const used = new WeakSet<object>();

/**
 * Run `sttNode` with the turn-1 gate when FIRST_TURN_FAST=on, once per
 * session: a later STT stream (a handoff back to Ferni) is never turn 1.
 */
export async function sttWithFirstTurnFast(
  session: SessionLike | undefined,
  audio: ReadableStream<AudioFrame>,
  sttNode: (audio: ReadableStream<AudioFrame>) => Promise<ReadableStream<Event> | null>,
  env: Record<string, string | undefined> = process.env,
  gate: FirstTurnGate = new FirstTurnGate()
): Promise<ReadableStream<Event> | null> {
  if (!firstTurnFastEnabled(env) || !session || used.has(session)) return sttNode(audio);
  used.add(session);
  if (eotContinuedMergeEnabled(env)) {
    try {
      const agent = session.currentAgent; // throws when the session is not running
      if (agent) gate.lateWords = lateWordsMerger(agent, session);
    } catch (error) {
      log.warn({ error: String(error) }, 'late words merge unavailable');
    }
  }

  let emit: (events: Event[]) => void = () => undefined;
  const observed = audio.pipeThrough(
    new TransformStream<AudioFrame, AudioFrame>({
      transform(frame, controller) {
        try {
          emit(gate.onFrame(frame.data, (frame.samplesPerChannel / frame.sampleRate) * 1000));
        } catch (error) {
          log.warn({ error: String(error) }, 'first turn gate skipped a frame');
        }
        controller.enqueue(frame);
      },
    })
  );
  const events = await sttNode(observed);
  if (!events) return null;

  const reader = events.getReader();
  return new ReadableStream<Event>({
    start(controller) {
      let open = true;
      emit = (out) => {
        for (const ev of out) if (open) controller.enqueue(ev);
      };
      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            emit(gate.onEvent(value));
          }
          open = false;
          controller.close();
        } catch (error) {
          open = false;
          controller.error(error);
        }
      })();
    },
    async cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
