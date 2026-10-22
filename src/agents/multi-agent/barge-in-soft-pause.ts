/**
 * BARGE_IN_SOFT_PAUSE=on (off by default): when the caller has talked over
 * Ferni for SUSTAINED_SPEECH_MS, pause his audio instead of cutting the reply,
 * then wait for proof (barge-in-fastpath.ts runs the decision).
 *
 * Prod iPhone calls, 2026-10-21: the sustained-speech fast path fired 6 times
 * on iOS and never on web or phone. Each time no transcript words had arrived,
 * and LiveKit's barge-in model judged 4 of the 6 not an interruption. A
 * speakerphone hearing Ferni or the room keeps the voice detector "speaking",
 * and the hard interrupt ended his reply mid-sentence for good. Waiting for
 * words instead is too slow (Ink-2's first word comes about 1.6 s in), so the
 * fast path stops Ferni's audio at once and then decides:
 * - a real word that is neither a backchannel nor Ferni's own echo, or the
 *   barge-in model's isInterruption, cuts the reply as before;
 * - nothing within BARGE_IN_SOFT_PAUSE_CONFIRM_MS (1200 ms), or the caller
 *   going quiet first, resumes the reply where it paused.
 *
 * The pause is the one LiveKit uses for its own false interruptions: the
 * session's audio output pause()/resume(). The room output clears its queued
 * audio on pause (room_io/_output.js), so the resume buffer (resume-buffer.ts)
 * sits in front of it and replays what was cleared: the caller hears no gap.
 *
 * @module agents/multi-agent/barge-in-soft-pause
 */
import { voice } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { speechPausedForCaller } from './interruption-config.js';
import type { LiveCallBehaviorsInput } from './live-call-behaviors.js';
import { ensureResumeBuffer } from './resume-buffer.js';

const log = getLogger();

/** How long a soft pause waits for proof before Ferni goes on. */
export const SOFT_PAUSE_CONFIRM_MS = 1200;

export interface SoftPause {
  /** Pause Ferni's audio; false when the output can't pause (then the fast path interrupts). */
  pause: () => boolean;
  /** Play on from where the pause stopped. */
  resume: () => void;
  confirmMs: number;
  /** One line per decision: BARGE_IN_SOFT_PAUSE {outcome, why, pausedMs}. */
  log?: (fields: Record<string, unknown>) => void;
}

type Env = Record<string, string | undefined>;

export function softPauseConfirmMs(env: Env = process.env): number {
  const ms = Number(env.BARGE_IN_SOFT_PAUSE_CONFIRM_MS);
  return Number.isInteger(ms) && ms >= 200 && ms <= 5000 ? ms : SOFT_PAUSE_CONFIRM_MS;
}

/** The soft pause when BARGE_IN_SOFT_PAUSE=on, else undefined (the fast path interrupts). */
export function softPauseFromEnv(
  env: Env,
  io: Omit<SoftPause, 'confirmMs'>
): SoftPause | undefined {
  if (env.BARGE_IN_SOFT_PAUSE !== 'on') return undefined;
  return { ...io, confirmMs: softPauseConfirmMs(env) };
}

type Handler = (...args: unknown[]) => void;

/**
 * The soft pause for a live call, on its session's audio output, or undefined
 * with the flag off. Keeps a resume buffer in front of the room output (as
 * NEVER_SILENT=on does; the room sets its output after this runs).
 */
export function liveCallSoftPause(
  input: LiveCallBehaviorsInput,
  env: Env = process.env
): SoftPause | undefined {
  const { session, sessionId, sessionEventHandlers } = input;
  const output = session as unknown as { output: { audio: voice.AudioOutput | null } };
  const soft = softPauseFromEnv(env, {
    pause: () => {
      const audio = output.output.audio;
      if (!audio?.canPause) return false;
      audio.pause();
      return true;
    },
    resume: () => {
      // LiveKit paused this reply itself in the meantime: its resume or cut owns it.
      if (speechPausedForCaller(session)) return;
      output.output.audio?.resume();
    },
    log: (fields) => log.info({ sessionId, ...fields }, 'BARGE_IN_SOFT_PAUSE'),
  });
  if (!soft) return undefined;
  const events = input.sessionWithEvents as { on: (event: string, handler: Handler) => void };
  const wrap = () =>
    ensureResumeBuffer(output, (fields) => log.info({ sessionId, ...fields }, 'REPLY_RESUME'), env);
  wrap();
  for (const event of ['speech_created', 'agent_state_changed', 'user_state_changed']) {
    events.on(event, wrap);
    sessionEventHandlers.push({ event, handler: wrap });
  }
  return soft;
}

/** Send the barge-in model's verdicts (BARGE_IN_DECISION) to a soft pause. */
export function onBargeInVerdict(
  input: LiveCallBehaviorsInput,
  handler: (ev: unknown) => void
): void {
  const events = input.sessionWithEvents as { on: (event: string, handler: Handler) => void };
  const event = voice.AgentSessionEventTypes.OverlappingSpeech;
  events.on(event, handler as Handler);
  input.sessionEventHandlers.push({ event, handler: handler as Handler });
}
