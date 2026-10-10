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

import { getOutboundCallContext } from '../../intelligence/context-builders/external/outbound-call-context.js';

/** Who is on an on-behalf call: the person Ferni phoned, and who asked. */
export interface OutboundParties {
  /** The person on the line; undefined when the dispatcher didn't name them. */
  recipientName?: string;
  /** The user Ferni is calling for; never the person on the line. */
  sponsorName?: string;
  /** A personal call opens by name; a business is greeted without one. */
  personal: boolean;
}

/** Defaults the metadata and dispatch parsers fill in when a name is missing. */
const PLACEHOLDER_NAMES = new Set([
  'unknown',
  'the user',
  'user',
  'friend',
  'contact',
  'them',
  'your person',
]);

function realName(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed && !PLACEHOLDER_NAMES.has(trimmed.toLowerCase()) ? trimmed : undefined;
}

/** The parties of this session's on-behalf call, or undefined for any other call. */
export function outboundPartiesFor(sessionId: string): OutboundParties | undefined {
  const call = getOutboundCallContext(sessionId);
  if (!call) return undefined;
  return {
    recipientName: realName(call.recipientName),
    sponsorName: realName(call.userName),
    personal: call.callType === 'personal',
  };
}

/**
 * The opener: addresses the person on the line, says Ferni is an AI, and says
 * who it is calling for. Fixed text, not the director: the disclosure is a
 * compliance line and must not depend on a model choosing to say it.
 */
export function outboundOpener(parties: OutboundParties): string {
  const { recipientName, sponsorName, personal } = parties;
  if (personal) {
    const hello = recipientName ? `Hi ${recipientName}` : 'Hi';
    const forWhom = sponsorName
      ? ` calling for ${sponsorName}. ${sponsorName} asked me to give you a call.`
      : '.';
    return `${hello}, this is Ferni, an AI companion${forWhom} Is now an okay time?`;
  }
  const forWhom = sponsorName ? ` calling on behalf of ${sponsorName}` : '';
  return `Hi, this is Ferni, an AI assistant${forWhom}. Do you have a quick minute?`;
}

/**
 * Model instructions naming who is on the line, in place of the sponsor's
 * profile ("You're talking to Seth", their history, their calendar). Empty
 * for any call that isn't on someone's behalf.
 */
export function outboundCallerAwareness(parties: OutboundParties | undefined): string {
  if (!parties) return '';
  const { recipientName, sponsorName } = parties;
  const lines = [
    recipientName
      ? `You placed a phone call to ${recipientName}. ${recipientName} is the person on the line.`
      : 'You placed a phone call. The person on the line is the one you called.',
  ];
  if (sponsorName) {
    lines.push(
      `You are calling on behalf of ${sponsorName}, who is not on this call. Never call the person on the line ${sponsorName}.`
    );
  }
  lines.push('You are an AI. If they ask, say so plainly.');
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
