/**
 * "Call me" from an app call moves the conversation to the phone
 * (CALL_ME_MOVES_TO_PHONE, off by default).
 *
 * Owner test 2026-10-23: in the app they asked Ferni to give them a call. The
 * phone rang with Ferni live (CALL_USER_LIVE_AGENT) and they answered, but the
 * app call stayed open: two Ferni conversations at once. On an earlier try
 * the dial failed at once (no such SIP trunk) after Ferni had already said
 * "calling you now". A friend on a video call who's asked to ring your phone
 * says "pick up", and hangs up the video once you do. So, with the flag:
 * - nothing is said about the call until LiveKit has taken the dial: one that
 *   fails within DIAL_ACCEPT_MS is reported as not placed;
 * - while it rings, Ferni says to pick up and it will hang up here;
 * - answered: a short goodbye here, then this call ends on the goodbye path
 *   (the ender call-wrap-up.ts registers), and the phone agent carries on
 *   from this call's last turns, handed over in its signed dispatch;
 * - not answered, or the dial failed: this call stays open, and Ferni says so
 *   at the next pause (voice-callbacks.ts).
 * A call with no ender (a phone caller, a call placed on someone's behalf)
 * gets the honest dial and outcome lines but nothing ends.
 *
 * @module tools/domains/proactive/outreach/call-me-moves-to-phone
 */
import { flagOn } from '../../../../config/env-flag.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import { triggerVoiceCallback } from '../../simple-utilities/voice-callbacks.js';
import { CALLING_LIVE, callPlacedReply } from './call-placed-reply.js';
import type { CallUserPort, CallUserRequest, DialOutcome, HandoverTurn } from './call-user-port.js';

const log = createLogger({ module: 'CallMeMovesToPhone' });

/** A dial still pending this long was taken: no trunk, room or dispatch error came back. */
export const DIAL_ACCEPT_MS = 3_000;
/** How many of the app call's turns the phone agent gets, and how long each may be. */
export const HANDOVER_TURNS = 6;
const TURN_CHARS = 300;

export function callMeMovesToPhone(): boolean {
  return flagOn('CALL_ME_MOVES_TO_PHONE');
}

export const RINGING_HAND_OVER =
  "Their phone is ringing now, and you'll be on it yourself, live. Tell them in a few words to pick up and you'll hang up here. Don't say it connected.";

export const DIAL_FAILED =
  "The call didn't go through, so their phone is not ringing. Tell them plainly you couldn't get through to their phone, and carry on here.";

/** Said in the app call once they answer the phone, just before it ends. */
export const MOVED_GOODBYE = "There you are. I'll hang up here.";

/** Said at the next pause in the app call when the phone wasn't answered. */
export function notAnsweredLine(outcome: DialOutcome): string {
  const what =
    outcome === 'failed'
      ? "you tried to ring their phone like they asked, but the call couldn't get through"
      : "you rang their phone like they asked, but they didn't pick up";
  return `${what}, so no phone call is happening and you're still here with them.`;
}

/** Ends an app call on its goodbye path once `line` is said; false when it can't end now. */
export type EndForPhone = (line: string) => Promise<boolean>;

const enders = new WeakMap<object, EndForPhone>();

/** The app call's ender, keyed by its AgentSession (tools get it from their RunContext). */
export function setPhoneMoveEnd(session: object, end: EndForPhone): void {
  enders.set(session, end);
}

interface HistorySession {
  history?: { items?: Array<{ type?: string; role?: string; textContent?: string }> };
}

/** The app call's last turns as plain text: no markup or control characters. */
export function recentTurns(session: unknown): HandoverTurn[] {
  try {
    const items = (session as HistorySession | undefined)?.history?.items ?? [];
    const turns: HandoverTurn[] = [];
    for (const item of items) {
      if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue;
      const content = (item.textContent ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, TURN_CHARS);
      if (content) turns.push({ role: item.role, content });
    }
    return turns.slice(-HANDOVER_TURNS);
  } catch (error) {
    log.warn({ error: String(error) }, 'App call turns not read; the phone call starts fresh');
    return [];
  }
}

/** What happens once the dial ends: the hand-over, or the honest line at a pause. */
async function afterDial(
  outcome: DialOutcome,
  call: { userId: string; session?: object; end?: EndForPhone }
): Promise<void> {
  if (outcome === 'answered') {
    if (!call.end) return;
    const ended = await call.end(MOVED_GOODBYE);
    log.info({ userId: call.userId, ended }, 'CALL_ME_MOVES_TO_PHONE answered');
    return;
  }
  log.info({ userId: call.userId, outcome }, 'CALL_ME_MOVES_TO_PHONE not answered; app call stays');
  await triggerVoiceCallback({
    type: 'call_outcome',
    userId: call.userId,
    message: notAnsweredLine(outcome),
    priority: 'high',
    session: call.session,
  });
}

/**
 * callUser with CALL_ME_MOVES_TO_PHONE on: the reply once LiveKit has taken
 * the dial (or the honest failure), with the hand-over armed for the answer.
 */
export async function callMovingToPhone(
  port: CallUserPort,
  request: CallUserRequest,
  session: object | undefined
): Promise<string> {
  const end = session ? enders.get(session) : undefined;
  const turns = end ? recentTurns(session) : [];
  const result = await port.call({ ...request, handover: { turns } });
  if (!result.success) {
    return `I couldn't place the call, so no call is coming: ${result.error ?? 'unknown error'}`;
  }
  const dial = result.dial;
  if (!dial) return callPlacedReply(result); // Twilio, or held for calling hours
  let timer: ReturnType<typeof setTimeout> | undefined;
  const taken = new Promise<'ringing'>((resolve) => {
    timer = setTimeout(() => resolve('ringing'), DIAL_ACCEPT_MS);
  });
  const early = await Promise.race([dial, taken]);
  clearTimeout(timer);
  if (early !== 'ringing' && early !== 'answered') {
    log.info({ userId: request.userId, outcome: early }, 'CALL_ME_MOVES_TO_PHONE dial not taken');
    return DIAL_FAILED;
  }
  const call = { userId: request.userId, session, end };
  void dial
    .then((outcome) => afterDial(outcome, call))
    .catch((error: unknown) =>
      log.warn({ userId: request.userId, error: String(error) }, 'CALL_ME_MOVES_TO_PHONE failed')
    );
  return end ? RINGING_HAND_OVER : CALLING_LIVE;
}
