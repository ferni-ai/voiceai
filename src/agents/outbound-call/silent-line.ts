/**
 * Ends a call Ferni placed when the other end stays silent.
 *
 * Hanging up was left to the model (the endCall tool, call-control.ts). On a
 * call to Seth's sister (dev, 2026-10-11) her leg sent no audio at all after
 * pickup. Ferni gave its opener, made one remark into the silence (a kind
 * goodbye), and never called endCall. The session's generic idle timers then
 * kept it on the line: "Just hanging out in the background, Mindy" 90 s into
 * the silence, and a disconnect at 120 s (the leg dropped 158 s in). A person
 * who hears nothing back says goodbye and hangs up.
 *
 * The session's "away" event fires once per silence, so a check made only
 * then never sees the silence grow. Instead the first "away" on a placed call
 * arms a timer here, due SILENT_LINE_HANGUP_SEC after the other end last
 * spoke (or after the call began, if they never did). Words from the other
 * end (a final transcript, not line noise) disarm it. When it comes due it
 * waits until Ferni has been quiet for QUIET_BEFORE_HANG_UP_MS, so a remark
 * or a goodbye is never cut off, then ends the call by deleting its room.
 * With no words from the other end, the requester's report says nobody came
 * on the line (on-behalf-call-lifecycle.ts).
 *
 * On by default; SILENT_LINE_HANGUP=off turns it off.
 *
 * @module agents/outbound-call/silent-line
 */
import { createLogger } from '../../utils/safe-logger.js';
import { isAgentSpeaking } from '../shared/response-orchestrator.js';
import { deleteRoom, onBehalfCallRoom, type HangUp } from './call-control.js';

const log = createLogger({ module: 'silent-line' });

/** Silence from the other end of a placed call after which Ferni hangs up. */
export const SILENT_LINE_HANGUP_SEC = 35;
/** How long Ferni must have been quiet, once due, before the line is dropped. */
export const QUIET_BEFORE_HANG_UP_MS = 6_000;
/** How often the due timer re-checks whether Ferni is quiet. */
export const RECHECK_MS = 2_000;
/** Re-checks before hanging up anyway, so a looping monologue can't hold the line open. */
export const MAX_RECHECKS = 30;

export function isSilentLineHangupOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SILENT_LINE_HANGUP !== 'off';
}

export interface SilentLineDeps {
  /** The room of the call Ferni placed in this session; undefined otherwise. */
  callRoom: (sessionId: string) => string | undefined;
  /** Ends the call by deleting its room. */
  hangUp: HangUp;
  /** True while Ferni is speaking. */
  agentSpeaking: (sessionId: string) => boolean;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
  env?: Record<string, string | undefined>;
}

export const defaultSilentLineDeps: SilentLineDeps = {
  callRoom: onBehalfCallRoom,
  hangUp: deleteRoom,
  agentSpeaking: isAgentSpeaking,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

interface Line {
  timer?: unknown;
  ended: boolean;
  deps: SilentLineDeps;
}

const lines = new Map<string, Line>();

/** Forget a session. Each call runs in its own job process, so only tests need this. */
export function forgetSilentLine(sessionId: string): void {
  const line = lines.get(sessionId);
  if (line?.timer !== undefined) line.deps.clearTimer(line.timer);
  lines.delete(sessionId);
}

/** The other end said something: the line is live, so stand the timer down. */
export function noteFarEndSpoke(sessionId: string): void {
  const line = lines.get(sessionId);
  if (!line || line.ended || line.timer === undefined) return;
  line.deps.clearTimer(line.timer);
  line.timer = undefined;
}

function hangUpWhenQuiet(sessionId: string, line: Line, quietMs: number, rechecks: number): void {
  const { deps } = line;
  line.timer = undefined;
  const roomName = deps.callRoom(sessionId);
  if (!roomName) return; // the call already ended
  const speaking = deps.agentSpeaking(sessionId);
  if ((speaking || quietMs < QUIET_BEFORE_HANG_UP_MS) && rechecks < MAX_RECHECKS) {
    const nextQuiet = speaking ? 0 : quietMs + RECHECK_MS;
    line.timer = deps.setTimer(
      () => hangUpWhenQuiet(sessionId, line, nextQuiet, rechecks + 1),
      RECHECK_MS
    );
    return;
  }
  line.ended = true;
  log.info({ sessionId }, 'Ending a placed call: the other end is silent');
  deps.hangUp(roomName).catch((error: unknown) => {
    log.warn({ sessionId, error: String(error) }, 'Could not end the silent call');
  });
}

/**
 * Called when the other end of a call goes quiet ("away"). On a placed call,
 * arms the hang-up for SILENT_LINE_HANGUP_SEC after they last spoke. Returns
 * true once the call is being ended, so no more silence remarks are made;
 * false otherwise, including for every session that is not a placed call.
 */
export function armSilentLine(
  sessionId: string,
  silenceSec: number,
  deps: SilentLineDeps = defaultSilentLineDeps
): boolean {
  if (!isSilentLineHangupOn(deps.env) || !deps.callRoom(sessionId)) return false;
  const line = lines.get(sessionId) ?? { ended: false, deps };
  lines.set(sessionId, line);
  if (line.ended) return true;
  if (line.timer !== undefined) line.deps.clearTimer(line.timer);
  line.deps = deps;
  const waitMs = Math.max(0, (SILENT_LINE_HANGUP_SEC - silenceSec) * 1000);
  line.timer = deps.setTimer(() => hangUpWhenQuiet(sessionId, line, 0, 0), waitMs);
  return false;
}
