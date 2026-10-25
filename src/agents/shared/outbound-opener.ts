/**
 * The first words of a call Ferni places on someone's behalf, and who is on
 * the line.
 *
 * An on-behalf call is dispatched with the sponsor's userId and userName, so
 * every "who am I talking to" path saw the sponsor. On prod (2026-10-10) Ferni
 * phoned Seth's dad Doug, opened with "Hey Seth, what's going on?" into the
 * ringing line, said "Hey Seth." when Doug picked up, and never said it was an
 * AI until he asked. He hung up.
 *
 * @module agents/shared/outbound-opener
 */

import {
  AI_DISCLOSURE_RULE,
  CHECKIN_HONESTY_RULE,
  getOutboundCallContext,
} from '../../intelligence/context-builders/external/outbound-call-context.js';
import { partiesOf, type OutboundParties } from '../../services/outreach/opening-line.js';

// The opener text is in services, where the outbound-call prompt can quote it too.
export { outboundOpener, type OutboundParties } from '../../services/outreach/opening-line.js';

/**
 * True for a call placed on someone's behalf (it gets call-control's own
 * endCall). A family check-in also has an outbound context but is not one.
 */
export function isOnBehalfCall(sessionId: string): boolean {
  return getOutboundCallContext(sessionId)?.kind === 'on_behalf';
}

/** The parties of this session's on-behalf call, or undefined for any other call. */
export function outboundPartiesFor(sessionId: string): OutboundParties | undefined {
  const call = getOutboundCallContext(sessionId);
  return call ? partiesOf(call) : undefined;
}

/**
 * Model instructions naming who is on the line, in place of the sponsor's
 * profile ("You're talking to Seth", their history, their calendar). Empty
 * for any call that isn't on someone's behalf.
 */
export function outboundCallerAwareness(parties: OutboundParties | undefined): string {
  if (!parties) return '';
  const { recipientName, relation, sponsorName } = parties;
  const lines = [
    recipientName
      ? `You placed a phone call to ${recipientName}. ${recipientName} is the person on the line.`
      : relation && sponsorName
        ? `You placed a phone call to ${sponsorName}'s ${relation}. Don't call them "${relation}"; you don't know their name yet.`
        : 'You placed a phone call. The person on the line is the one you called.',
  ];
  if (sponsorName) {
    lines.push(
      `You are calling on behalf of ${sponsorName}, who is not on this call. Never call the person on the line ${sponsorName}.`
    );
  }
  // A check-in's opener doesn't say "AI" (they know Ferni), so don't claim it did
  const honesty = parties.checkin ? CHECKIN_HONESTY_RULE : AI_DISCLOSURE_RULE;
  lines.push(
    sponsorName
      ? `You are Ferni, ${sponsorName}'s friend. ${honesty}`
      : `You are Ferni, a friend calling to check in. ${honesty}`
  );
  return `\n---\n\n## Who You're Talking To\n\n${lines.join('\n')}\n`;
}

/** The subset of a LiveKit room the answer wait listens on. */
export interface AnswerWatchRoom {
  on(
    event: 'participantAttributesChanged' | 'participantDisconnected',
    fn: (...args: never[]) => void
  ): unknown;
  off(
    event: 'participantAttributesChanged' | 'participantDisconnected',
    fn: (...args: never[]) => void
  ): unknown;
}

interface AnswerWatchParticipant {
  identity: string;
  attributes: Record<string, string>;
}

/** Time for the person who picked up to say "Hello?" before Ferni speaks. */
export const ANSWER_GRACE_MS = 1200;

/** How long a dialed phone may ring before the opener is dropped. */
const ANSWER_TIMEOUT_MS = 60_000;

const SIP_CALL_STATUS = 'sip.callStatus';

/**
 * Resolves once a dialed phone participant has picked up. A SIP participant
 * joins the room while the phone is still ringing, so speaking as soon as it
 * joins plays the opener into the ring. Non-SIP participants resolve at once.
 * Resolves false when they hang up or never answer within `timeoutMs`.
 */
export async function waitForCallAnswered(
  room: AnswerWatchRoom,
  participant: AnswerWatchParticipant,
  timeoutMs: number = ANSWER_TIMEOUT_MS,
  graceMs: number = ANSWER_GRACE_MS
): Promise<boolean> {
  const status = participant.attributes?.[SIP_CALL_STATUS];
  if (status === undefined) return true;

  const answered = new Promise<boolean>((resolve) => {
    if (status === 'active') {
      resolve(true);
      return;
    }
    const finish = (result: boolean): void => {
      clearTimeout(timer);
      room.off('participantAttributesChanged', onChange);
      room.off('participantDisconnected', onLeave);
      resolve(result);
    };
    const onChange = (changed: Record<string, string>, who: AnswerWatchParticipant): void => {
      if (who.identity !== participant.identity) return;
      const next = changed[SIP_CALL_STATUS];
      if (next === 'active') finish(true);
      else if (next === 'hangup') finish(false);
    };
    const onLeave = (who: AnswerWatchParticipant): void => {
      if (who.identity === participant.identity) finish(false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    room.on('participantAttributesChanged', onChange);
    room.on('participantDisconnected', onLeave);
  });

  if (!(await answered)) return false;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, graceMs);
  });
  return true;
}
