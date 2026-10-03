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

import { voiceHonorsProsodyTags } from '../../../config/voice-capabilities.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { setReplyAudioPlan } from '../../reply-audio-plan.js';
import type { ReplyStream } from '../providers/cartesia-reply-stream.js';
import { prosodyTags } from '../providers/cartesia.js';
import { DirectorEngine } from './engine.js';
import { leverModes, speechDirectorMode } from './gate.js';
import { RawCues } from './raw-cues.js';
import { directorSessions, type DirectorSessions } from './session-state.js';
import type { DirectorMode, LeverModes, SpeechPlan, TurnContext } from './types.js';

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
  /** Stage 2 tempo planned for this turn (a voice that ignores <speed>). */
  tempo?: number;
  /** Prosody tags were taken off every push (the voice ignores them). */
  tagsStripped: boolean;
  /** The opening breath/sigh decided (nonverbal lever not off), and why. */
  opening?: string;
  openingReason: string;
  /** Where [laughter] was added (or would be, in shadow). */
  laughter?: string;
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
  /** The turn being answered: keys the Stage 2 plan; the user's words. */
  turnContext?: TurnContext;
  /** Rapport 0-1 for the laughter rules (overrides turnContext.comfortLevel). */
  comfortLevel?: number;
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
  private planned = false;
  private readonly stripProsody: boolean;

  constructor(
    private readonly inner: ReplyStream,
    private readonly mode: 'shadow' | 'live',
    private readonly modes: LeverModes,
    private readonly opts: DirectSpeechOptions,
    private readonly cues: RawCues
  ) {
    const sessions = opts.sessions ?? directorSessions;
    this.stripProsody = mode === 'live' && !voiceHonorsProsodyTags(opts.voiceId);
    this.engine = new DirectorEngine({
      modes,
      voiceId: opts.voiceId,
      sessionHint: opts.emotion,
      carry: opts.sessionId ? sessions.get(opts.sessionId, opts.personaId) : { speed: 1 },
      cues,
      renderTags: prosodyTags,
      stripProsody: this.stripProsody,
      userText: opts.turnContext?.userRequest,
      laughter: {
        sessionId: opts.sessionId,
        personaId: opts.personaId,
        turn: opts.turnContext?.turnNumber,
        userEmotion: opts.turnContext?.userEmotion?.primary,
        comfortLevel: opts.comfortLevel ?? opts.turnContext?.comfortLevel,
      },
    });
  }

  /**
   * Hand this reply's Stage 2 plan to the post-TTS stage, once, as soon as the
   * opening is decided and before its text goes to Cartesia (so the plan is
   * there before any of the reply's audio). Never throws.
   */
  private planStage2(): void {
    if (this.planned || this.mode !== 'live' || this.failed || !this.engine.decided) return;
    this.planned = true;
    try {
      const plan = this.engine.audioPlan();
      if (plan) setReplyAudioPlan(this.opts.sessionId, this.opts.turnContext?.turnNumber, plan);
    } catch (error) {
      log.warn({ err: String(error), sessionId: this.opts.sessionId }, 'Stage 2 plan failed');
    }
  }

  /** Run Director work, timing it; on error stop directing this reply. */
  private direct(work: () => string[]): string[] | null {
    if (this.failed) return null;
    const start = process.hrtime.bigint();
    try {
      return work();
    } catch (error) {
      this.fail(error);
      return null;
    } finally {
      this.elapsedNs += process.hrtime.bigint() - start;
    }
  }

  /** Stop directing this reply; logged once. */
  private fail(error: unknown): void {
    if (!this.failed) {
      log.warn({ err: String(error), sessionId: this.opts.sessionId }, 'Speech director failed');
    }
    this.failed = true;
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
    this.planStage2();
    for (const piece of out) this.inner.push(piece);
    // A new hold starts when nothing was held or this push released the last one.
    if (!this.engine.holding) this.stopHoldTimer();
    else if (out.length > 0 || this.holdHandle === undefined) this.startHoldTimer();
  }

  end(): void {
    if (this.done) return;
    this.stopHoldTimer();
    const rest = this.direct(() => this.engine.finish()) ?? this.engine.releaseHeld();
    this.planStage2();
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

  /**
   * No new piece within HOLD_RELEASE_MS: let Cartesia have the held text.
   * Runs from a timer, so nothing may escape it: a throw here would be an
   * uncaught exception, not an error the reply's caller handles. On a throw
   * the reply stops being directed (later pushes go out verbatim) and the
   * rest of what was released is still offered to Cartesia, once.
   */
  private releaseHold(): void {
    this.holdHandle = undefined;
    if (this.done || this.failed || this.mode !== 'live') return;
    let pending: string[] = [];
    try {
      pending = this.direct(() => this.engine.releaseHold()) ?? this.engine.releaseHeld();
      while (pending.length > 0) {
        const piece = pending[0];
        pending = pending.slice(1);
        this.inner.push(piece);
      }
    } catch (error) {
      this.fail(error);
      for (const piece of [...pending, ...this.engine.releaseHeld()]) {
        try {
          this.inner.push(piece);
        } catch {
          // The reply stream itself is broken; end() or cancel() will report it.
        }
      }
    }
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
      tempo: engine.tempo,
      tagsStripped: this.stripProsody,
      opening: engine.opening.opening?.kind,
      openingReason: engine.opening.reason,
      laughter: engine.laughter,
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
        ...engine.nonverbalCarry(),
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
