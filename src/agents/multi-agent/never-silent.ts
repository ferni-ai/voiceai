/**
 * A friend never just goes silent.
 *
 * Dev, 2026-10-11: every agent built since #886 threw ERR_MODULE_NOT_FOUND
 * inside the turn. Ferni joined calls, heard every caller turn and said
 * nothing; only a smoke call caught it (#989). Nothing in the call noticed:
 * the empty-response watchdog only logs, and the turn keeper retries through
 * the same broken model.
 *
 * With NEVER_SILENT=on, a caller turn that got a reply attempt but no speech
 * gets a short human line instead ("Sorry, I lost my train of thought there.
 * Say that again?"):
 * - at once when the reply is abandoned: the agent went thinking -> listening
 *   without speaking and nobody interrupted it (the LLM failed after the hedge
 *   and retries, TTS failed, llmNode/ttsNode threw);
 * - NEVER_SILENT_HANG_MS after the turn when nothing was heard at all (a hung
 *   model, or a failure after a tool ran); a running tool holds the clock.
 *
 * The turn is armed when LiveKit commits the caller's message, which it does
 * only for a turn it is about to answer: a StopResponse (screening,
 * roundtable), an unfinished-turn hold or a backchannel never arms it.
 *
 * The lines are rendered once with the session's own TTS after the first
 * reply, so they still play when TTS is what failed; without them the line
 * goes through TTS like any say(). Nothing here uses the LLM.
 *
 * NEVER_SILENT=shadow logs NEVER_SILENT_FALLBACK without speaking.
 *
 * @module agents/multi-agent/never-silent
 */
import { ReadableStream } from 'node:stream/web';

export type NeverSilentMode = 'off' | 'shadow' | 'on';
export type SilenceReason = 'abandoned' | 'hang';

export function neverSilentMode(
  env: Record<string, string | undefined> = process.env
): NeverSilentMode {
  const mode = env.NEVER_SILENT?.trim().toLowerCase();
  return mode === 'on' ? 'on' : mode === 'shadow' ? 'shadow' : 'off';
}

/** From the caller's committed turn to the fallback when nothing was heard. */
export const NEVER_SILENT_HANG_MS = 5000;
/** Longest a running tool holds the clock. */
export const NEVER_SILENT_TOOL_HOLD_MS = 15_000;
/** Longest pre-rendered line kept (about 6 s of 24 kHz audio). */
const MAX_PRERENDER_SAMPLES = 24_000 * 6;

export function hangMs(env: Record<string, string | undefined> = process.env): number {
  const ms = Number(env.NEVER_SILENT_HANG_MS);
  return Number.isFinite(ms) && ms >= 1000 ? ms : NEVER_SILENT_HANG_MS;
}

export const FALLBACK_LINES = [
  'Sorry, I lost my train of thought there. Say that again?',
  'Hm, sorry, my mind wandered for a second. What was that?',
  'Sorry, I totally blanked. Can you say that one more time?',
] as const;

interface SpeechLike {
  readonly interrupted: boolean;
  done(): boolean;
}
interface FrameLike {
  readonly samplesPerChannel: number;
}

export interface NeverSilentSession {
  readonly agentState: string;
  readonly userState: string;
  readonly output?: { readonly audio?: unknown; readonly audioEnabled?: boolean };
  readonly tts?: { synthesize(text: string): AsyncIterable<{ frame: FrameLike }> } | null;
  say(
    text: string,
    options?: { audio?: ReadableStream<never>; allowInterruptions?: boolean }
  ): unknown;
  interrupt(): unknown;
}

export interface NeverSilentGuard {
  onItemAdded(event: unknown): void;
  onAgentState(event: unknown): void;
  onUserState(event: unknown): void;
  onSpeechCreated(event: unknown): void;
  onToolsRequested(): void;
  onToolsExecuted(): void;
  stop(): void;
}

export function createNeverSilentGuard(deps: {
  session: NeverSilentSession;
  mode: 'on' | 'shadow';
  hangMs?: number;
  toolHoldMs?: number;
  /** Music playing, call closing: a fallback would be wrong, not just late. */
  stayQuiet?: () => boolean;
  /** A reply paused for caller audio that may still resume (resume-buffer.ts): wait for it. */
  replyPaused?: () => boolean;
  log: (fields: Record<string, unknown>) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
}): NeverSilentGuard {
  const { session } = deps;
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  const hang = deps.hangMs ?? NEVER_SILENT_HANG_MS;
  const toolHold = deps.toolHoldMs ?? NEVER_SILENT_TOOL_HOLD_MS;

  interface Turn {
    committedAt: number;
    speech: SpeechLike | null;
    thinking: boolean;
    toolPending: boolean;
    toolsRan: boolean;
  }
  let turn: Turn | null = null;
  let latestSpeech: SpeechLike | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let spokeOnce = false;
  let prerenderStarted = false;
  const rendered = new Map<string, FrameLike[]>();
  let fallbacks = 0;
  let stopped = false;

  const hasAudio = (): boolean =>
    Boolean(session.output?.audio) && session.output?.audioEnabled !== false;
  const clear = (): void => {
    if (timer) clearTimer(timer);
    timer = undefined;
  };
  const disarm = (): void => {
    clear();
    turn = null;
  };
  const schedule = (ms: number): void => {
    clear();
    timer = setTimer(() => {
      timer = undefined;
      check('hang'); // also when a tool's hold ran out
    }, ms);
  };

  /** A reply was attempted for this turn, nobody interrupted it and the caller isn't talking. */
  const check = (reason: SilenceReason): void => {
    if (!turn) return;
    if (session.userState === 'speaking' || session.agentState === 'speaking') return disarm();
    // Paused for noise: the reply resumes ~1 s later; the hang deadline still stands.
    if (deps.replyPaused?.()) {
      if (reason === 'hang' && !timer) schedule(hang);
      return;
    }
    if (!turn.speech && !turn.thinking) return disarm(); // no reply attempted (AMD, paused, closing)
    if (turn.speech?.interrupted) return disarm(); // cancelled on purpose (barge-in, noise filter)
    fallback(reason);
  };

  const fallback = (reason: SilenceReason): void => {
    const t = turn;
    disarm();
    if (!t) return;
    const text = FALLBACK_LINES[fallbacks % FALLBACK_LINES.length];
    const frames = rendered.get(text);
    const fields = {
      reason,
      sinceCommitMs: now() - t.committedAt,
      agentState: session.agentState,
      toolsRan: t.toolsRan,
      prerendered: Boolean(frames),
      mode: deps.mode,
    };
    if (deps.stayQuiet?.()) return deps.log({ ...fields, skipped: 'stay_quiet' });
    deps.log(fields);
    if (deps.mode !== 'on') return;
    fallbacks += 1;
    try {
      // A reply still being generated would otherwise play after the apology.
      if (session.agentState === 'thinking') session.interrupt();
    } catch {
      // nothing to interrupt
    }
    try {
      session.say(text, {
        allowInterruptions: true,
        ...(frames && { audio: ReadableStream.from(frames) as ReadableStream<never> }),
      });
    } catch (error) {
      deps.log({ ...fields, sayFailed: String(error) });
    }
  };

  /** Render the lines once, after the first reply, so they play even with TTS down. */
  const prerender = async (): Promise<void> => {
    const tts = session.tts;
    if (prerenderStarted || deps.mode !== 'on' || typeof tts?.synthesize !== 'function') return;
    prerenderStarted = true;
    for (const text of FALLBACK_LINES) {
      try {
        const frames: FrameLike[] = [];
        let samples = 0;
        for await (const { frame } of tts.synthesize(text)) {
          frames.push(frame);
          samples += frame.samplesPerChannel;
          if (samples > MAX_PRERENDER_SAMPLES) break;
        }
        if (frames.length) rendered.set(text, frames);
      } catch (error) {
        deps.log({ prerenderFailed: String(error) });
        return;
      }
    }
  };

  return {
    onItemAdded(event) {
      const role = (event as { item?: { role?: string } })?.item?.role;
      // With audio on, a reply counts once it is heard ('speaking'): when TTS
      // fails LiveKit still records the text it never played.
      if (role === 'assistant' && !hasAudio()) return disarm();
      if (role !== 'user' || stopped) return;
      turn = {
        committedAt: now(),
        // LiveKit creates the reply's speech before it commits the caller's message.
        speech: latestSpeech && !latestSpeech.done() ? latestSpeech : null,
        thinking: false,
        toolPending: false,
        toolsRan: false,
      };
      schedule(hang);
    },
    onAgentState(event) {
      const state = (event as { newState?: string })?.newState;
      if (state === 'speaking') {
        spokeOnce = true;
        return disarm();
      }
      if (state === 'listening' && spokeOnce) void prerender();
      if (!turn) return;
      if (state === 'thinking') turn.thinking = true;
      // After a tool the reply is a new generation: leave it to the clock.
      if (state === 'listening' && turn.thinking && !turn.toolsRan && !turn.toolPending) {
        check('abandoned');
      }
    },
    onUserState(event) {
      // The caller went on; their next committed turn arms the clock again.
      if ((event as { newState?: string })?.newState === 'speaking') disarm();
    },
    onSpeechCreated(event) {
      const handle = (event as { speechHandle?: SpeechLike })?.speechHandle ?? null;
      latestSpeech = handle;
      if (turn && !turn.speech) turn.speech = handle;
    },
    onToolsRequested() {
      if (!turn) return;
      turn.toolPending = true;
      schedule(toolHold);
    },
    onToolsExecuted() {
      if (!turn) return;
      turn.toolPending = false;
      turn.toolsRan = true;
      schedule(hang);
    },
    stop() {
      stopped = true;
      disarm();
    },
  };
}
