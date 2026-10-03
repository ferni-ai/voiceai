/**
 * The Speech Director on the live gateway path.
 *
 * `directSpeech()` wraps the Cartesia reply stream (and observes the raw LLM
 * text) for one spoken reply. With SPEECH_DIRECTOR off it returns the very
 * same objects, so the path is untouched. In shadow every push is forwarded
 * verbatim first and the plan is computed beside it; in live the pushes are
 * the Director's. Either way one aggregate line is logged per reply: counts,
 * the emotion and speed chosen, pause count and total, latency. Never text.
 *
 * Any Director error falls back to forwarding pushes verbatim for the rest
 * of the reply. A phrasing hold never lasts more than HOLD_RELEASE_MS: if no
 * new piece arrives by then, the held text goes to Cartesia anyway.
 *
 * @module speech/tts-gateway/director/reply-director
 */

import { TransformStream, type ReadableStream as NodeReadableStream } from 'node:stream/web';

import { createLogger } from '../../../utils/safe-logger.js';
import type { ReplyStream } from '../providers/cartesia-reply-stream.js';
import { prosodyTags } from '../providers/cartesia.js';
import { DirectorEngine } from './engine.js';
import { leverModes, speechDirectorMode } from './gate.js';
import { RawCues } from './raw-cues.js';
import { directorSessions, type DirectorSessions } from './session-state.js';
import type { DirectorMode, LeverModes, SpeechPlan } from './types.js';

const log = createLogger({ module: 'SpeechDirector' });

/**
 * Longest a phrasing hold may keep text from Cartesia (review M5). Cartesia
 * runs with max_buffer_delay_ms=0, so a hold longer than the audio already
 * queued would be heard as a gap.
 */
export const HOLD_RELEASE_MS = 250;

/** Timer seam so tests can fire the hold release deterministically. */
export interface HoldTimer {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimer: HoldTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The one log line per reply. Counts and decisions only, never text. */
export interface PlanSummary {
  mode: DirectorMode;
  levers: string;
  sessionId?: string;
  personaId?: string;
  pushesIn: number;
  pushesOut: number;
  segments: number;
  heldPhrases: number;
  normalizations: number;
  /** Mid-sentence "..." taken out (the measured cause of mid-sentence breaks). */
  ellipsesRemoved: number;
  /** Commas per 100 words in the planned text; each is a ~310 ms Sonic pause. */
  commasPer100Words: number;
  emotion?: string;
  emotionSource: string;
  speed: number;
  pauses: number;
  pauseMs: number;
  breaths: number;
  sighs: number;
  latencyUs: number;
  cancelled: boolean;
  failed: boolean;
}

export interface DirectSpeechOptions {
  textStream: NodeReadableStream<string>;
  voiceId: string;
  sessionId?: string;
  personaId?: string;
  /** Session emotion hint. */
  emotion?: string;
  env?: Record<string, string | undefined>;
  sessions?: DirectorSessions;
  onPlan?: (summary: PlanSummary, plan: SpeechPlan) => void;
  /** Defaults to setTimeout; tests inject a manual timer. */
  holdTimer?: HoldTimer;
}

const describeLevers = (modes: LeverModes): string =>
  Object.entries(modes)
    .map(([lever, mode]) => `${lever}:${mode}`)
    .join(',');

function summarize(engine: DirectorEngine): Pick<PlanSummary, 'pauses' | 'pauseMs'> {
  let pauses = 0;
  let pauseMs = 0;
  for (const segment of engine.plan.segments) {
    for (const event of segment.rustEvents) {
      if (event.type !== 'pause') continue;
      pauses++;
      pauseMs += Number(event.params.durationMs) || 0;
    }
  }
  return { pauses, pauseMs };
}

class DirectedReply implements ReplyStream {
  private readonly engine: DirectorEngine;
  private elapsedNs = 0n;
  private failed = false;
  private done = false;
  private holdHandle: unknown = undefined;

  constructor(
    private readonly inner: ReplyStream,
    private readonly mode: 'shadow' | 'live',
    private readonly modes: LeverModes,
    private readonly opts: DirectSpeechOptions,
    private readonly cues: RawCues
  ) {
    const sessions = opts.sessions ?? directorSessions;
    this.engine = new DirectorEngine({
      modes,
      voiceId: opts.voiceId,
      sessionHint: opts.emotion,
      carry: opts.sessionId ? sessions.get(opts.sessionId, opts.personaId) : { speed: 1 },
      cues,
      renderTags: prosodyTags,
    });
  }

  /** Run Director work, timing it; on error stop directing this reply. */
  private direct(work: () => string[]): string[] | null {
    if (this.failed) return null;
    const start = process.hrtime.bigint();
    try {
      return work();
    } catch (error) {
      this.failed = true;
      log.warn({ err: String(error), sessionId: this.opts.sessionId }, 'Speech director failed');
      return null;
    } finally {
      this.elapsedNs += process.hrtime.bigint() - start;
    }
  }

  push(text: string): void {
    if (this.done) return;
    if (this.mode === 'shadow') {
      this.inner.push(text);
      this.direct(() => this.engine.take(text));
      return;
    }
    const out = this.direct(() => this.engine.take(text));
    if (out === null) {
      this.stopHoldTimer();
      for (const held of this.engine.releaseHeld()) this.inner.push(held);
      this.inner.push(text);
      return;
    }
    for (const piece of out) this.inner.push(piece);
    // A new hold starts when nothing was held or this push released the last one.
    if (!this.engine.holding) this.stopHoldTimer();
    else if (out.length > 0 || this.holdHandle === undefined) this.startHoldTimer();
  }

  end(): void {
    if (this.done) return;
    this.stopHoldTimer();
    const rest = this.direct(() => this.engine.finish()) ?? this.engine.releaseHeld();
    if (this.mode === 'live') for (const piece of rest) this.inner.push(piece);
    this.report(false);
    this.inner.end();
  }

  cancel(): void {
    this.stopHoldTimer();
    if (!this.done) this.report(true);
    this.inner.cancel();
  }

  private get timer(): HoldTimer {
    return this.opts.holdTimer ?? realTimer;
  }

  private startHoldTimer(): void {
    this.stopHoldTimer();
    this.holdHandle = this.timer.set(() => this.releaseHold(), HOLD_RELEASE_MS);
  }

  private stopHoldTimer(): void {
    if (this.holdHandle === undefined) return;
    this.timer.clear(this.holdHandle);
    this.holdHandle = undefined;
  }

  /** No new piece within HOLD_RELEASE_MS: let Cartesia have the held text. */
  private releaseHold(): void {
    this.holdHandle = undefined;
    if (this.done || this.failed || this.mode !== 'live') return;
    const out = this.direct(() => this.engine.releaseHold()) ?? this.engine.releaseHeld();
    for (const piece of out) this.inner.push(piece);
  }

  [Symbol.asyncIterator](): AsyncIterator<ArrayBuffer> {
    return this.inner[Symbol.asyncIterator]();
  }

  private report(cancelled: boolean): void {
    this.done = true;
    const { engine, opts } = this;
    const summary: PlanSummary = {
      mode: this.mode,
      levers: describeLevers(this.modes),
      sessionId: opts.sessionId,
      personaId: opts.personaId,
      pushesIn: engine.stats.pushesIn,
      pushesOut: engine.stats.pushesOut,
      segments: engine.plan.segments.length,
      heldPhrases: engine.stats.held,
      normalizations: engine.stats.normalizations,
      ellipsesRemoved: engine.stats.ellipsesRemoved,
      commasPer100Words: engine.stats.words
        ? Math.round((engine.stats.commas / engine.stats.words) * 1000) / 10
        : 0,
      emotion: engine.emotion.emotion,
      emotionSource: engine.emotion.source,
      speed: engine.speed,
      ...summarize(engine),
      breaths: engine.stats.breaths,
      sighs: engine.stats.sighs,
      latencyUs: Math.round(Number(this.elapsedNs + this.cues.elapsedNs) / 100) / 10,
      cancelled,
      failed: this.failed,
    };
    if (opts.sessionId && engine.stats.pushesIn > 0) {
      (opts.sessions ?? directorSessions).update(opts.sessionId, opts.personaId, {
        emotion: engine.emotion.emotion,
        speed: engine.speed,
      });
    }
    if (opts.onPlan) opts.onPlan(summary, engine.plan);
    else log.info(summary, 'Speech director plan');
  }
}

/**
 * Put the Director between continuation-tts and the Cartesia reply stream.
 * Off: returns `reply` and `opts.textStream` unchanged (the same objects).
 */
export function directSpeech(
  reply: ReplyStream,
  opts: DirectSpeechOptions
): { reply: ReplyStream; textStream: NodeReadableStream<string> } {
  const mode = speechDirectorMode(opts.env);
  if (mode === 'off') return { reply, textStream: opts.textStream };

  const cues = new RawCues();
  const textStream = opts.textStream.pipeThrough(
    new TransformStream<string, string>({
      transform(chunk, controller) {
        cues.see(chunk); // never throws; see raw-cues.ts
        controller.enqueue(chunk);
      },
    })
  );
  const directed = new DirectedReply(reply, mode, leverModes(opts.env), opts, cues);
  return { reply: directed, textStream };
}
