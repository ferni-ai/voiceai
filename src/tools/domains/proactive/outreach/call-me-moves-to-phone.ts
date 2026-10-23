/**
 * "Call me" from an app call moves the conversation to the phone
 * (CALL_ME_MOVES_TO_PHONE, off by default).
 *
 * Owner test 2026-10-23: in the app they asked Ferni to give them a call. The
 * phone rang with Ferni live (CALL_USER_LIVE_AGENT) and they answered, but the
 * app call stayed open: two Ferni conversations at once. On an earlier try
 * the dial failed at once (no such SIP trunk) after Ferni had already said
 * "calling you now". A friend on a video call who's asked to ring your phone
 * says "sure, trying your phone now, pick up", at once, and hangs up the video
 * once you do. So, with the flag:
 * - callUser replies at once, without waiting on the dial (no dead air): Ferni
 *   says it is trying their phone and will hang up here once they pick up,
 *   and never that the call connected or is ringing;
 * - answered: a short goodbye here, then this call ends on the goodbye path
 *   (the ender call-wrap-up.ts registers), and the phone agent carries on
 *   from this call's last turns. The signed dispatch carries only a reference
 *   (this call's conversation id); the phone agent reads the turns from the
 *   caller's own memory store (resume-after-drop.ts). No conversation text
 *   goes into dispatch metadata, which LiveKit stores and logs can echo;
 * - not answered, or the dial failed, early or late: this call stays open,
 *   and Ferni corrects itself at the next pause (voice-callbacks.ts).
 * A call with no ender (a phone caller, a call placed on someone's behalf)
 * gets the same honest lines but nothing ends.
 *
 * @module tools/domains/proactive/outreach/call-me-moves-to-phone
 */
import { flagOn } from '../../../../config/env-flag.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import { triggerVoiceCallback } from '../../simple-utilities/voice-callbacks.js';
import { callPlacedReply } from './call-placed-reply.js';
import type { CallUserPort, CallUserRequest, DialOutcome } from './call-user-port.js';

const log = createLogger({ module: 'CallMeMovesToPhone' });

export function callMeMovesToPhone(): boolean {
  return flagOn('CALL_ME_MOVES_TO_PHONE');
}

/** The dial's outcome isn't known yet: if it fails, Ferni is told at the next pause. */
const NOT_YET =
  "It may not go through, so never say it connected or that it's ringing; if it fails you'll hear and can tell them.";

export const RINGING_HAND_OVER = `You're trying their phone now, and you'll be on that call yourself, live. Tell them in a few words you're trying their phone, to pick up, and you'll hang up here. ${NOT_YET}`;

/** No app call to hand over (a phone caller): the same honest line, nothing ends here. */
export const TRYING_PHONE = `You're trying their phone now, as a separate call with you on it, live. Tell them in a few words you're trying their phone. ${NOT_YET}`;

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

/** What a tool's RunContext gives this: the call's AgentSession and its userData. */
export interface CallRun {
  session?: object;
  userData?: unknown;
}

/**
 * The app call's conversation in the caller's memory store (session-manager
 * persists each turn there). Undefined while memory is held, or before it starts.
 */
export function conversationOf(userData: unknown): string | undefined {
  const id = (userData as { services?: { realtimeConversationId?: unknown } } | undefined)?.services
    ?.realtimeConversationId;
  return typeof id === 'string' && id ? id : undefined;
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
 * callUser with CALL_ME_MOVES_TO_PHONE on: the honest in-progress reply at
 * once, with the hand-over armed for the answer and the correction for a failure.
 */
export async function callMovingToPhone(
  port: CallUserPort,
  request: CallUserRequest,
  run: CallRun | undefined
): Promise<string> {
  const session = run?.session;
  const end = session ? enders.get(session) : undefined;
  const conversationId = end ? conversationOf(run?.userData) : undefined;
  const result = await port.call({ ...request, handover: { conversationId } });
  if (!result.success) {
    return `I couldn't place the call, so no call is coming: ${result.error ?? 'unknown error'}`;
  }
  const dial = result.dial;
  if (!dial) return callPlacedReply(result); // Twilio, or held for calling hours
  // Not awaited: the reply never waits on the dial, and its outcome is said when it comes
  const call = { userId: request.userId, session, end };
  void dial
    .then((outcome) => afterDial(outcome, call))
    .catch((error: unknown) =>
      log.warn({ userId: request.userId, error: String(error) }, 'CALL_ME_MOVES_TO_PHONE failed')
    );
  return end ? RINGING_HAND_OVER : TRYING_PHONE;
}
