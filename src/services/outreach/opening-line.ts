/**
 * What Ferni says first on a call it places for a user, and who is on the line.
 *
 * One text, used everywhere a call opens: the opener Ferni speaks once the
 * phone is answered (agents/shared/outbound-opener.ts), the reply to "Hello?"
 * the outbound prompt asks for, a silent pickup and the voicemail
 * (agents/outbound-call/call-opening.ts). It is the one, light AI disclosure:
 * fixed text, because a compliance line must not depend on a model choosing
 * to say it. Ferni is never "an assistant" to the people it calls.
 *
 * @module services/outreach/opening-line
 */

/** Who is on an on-behalf call: the person Ferni phoned, and who asked. */
export interface OutboundParties {
  /** The person on the line; undefined when the dispatcher didn't name them. */
  recipientName?: string;
  /** The user Ferni is calling for; never the person on the line. */
  sponsorName?: string;
  /** A personal call opens by name; a business is greeted without one. */
  personal: boolean;
  /** The dispatcher's own opening line, used when it says Ferni is an AI. */
  openingLine?: string;
  /**
   * A family check-in. The person agreed to Ferni's calls and knows who Ferni
   * is, so Ferni says its name without "<sponsor>'s AI friend" (Seth, 2026-10-18).
   */
  checkin?: boolean;
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
  'your family member',
]);

function realName(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed && !PLACEHOLDER_NAMES.has(trimmed.toLowerCase()) ? trimmed : undefined;
}

/** The parties of a call, from the outbound call context's fields. */
export function partiesOf(call: {
  recipientName?: string;
  userName?: string;
  callType?: string;
  openingLine?: string;
  kind?: string;
}): OutboundParties {
  return {
    recipientName: realName(call.recipientName),
    sponsorName: realName(call.userName),
    personal: call.callType === 'personal',
    openingLine: call.openingLine,
    ...(call.kind === 'family_checkin' && { checkin: true }),
  };
}

/** How Ferni names itself on the call: "it's Ferni, Seth's AI friend". */
export function ferniIntro({ sponsorName, personal, checkin }: OutboundParties): string {
  if (checkin) return "it's Ferni";
  if (personal) {
    return sponsorName ? `it's Ferni, ${sponsorName}'s AI friend` : "it's Ferni, an AI friend";
  }
  return `this is Ferni, an AI calling ${sponsorName ? `for ${sponsorName}` : "on someone's behalf"}`;
}

/**
 * The opener: addresses the person on the line, introduces Ferni as the
 * user's AI friend, and says why it called. A dispatched opening line (a
 * family check-in's) is used instead when it says Ferni is an AI.
 */
export function outboundOpener(parties: OutboundParties): string {
  const { recipientName, sponsorName, personal, openingLine } = parties;
  // A check-in's opener is the server's own (signed dispatch) and names no AI on purpose
  if (openingLine && (parties.checkin || /\bAI\b/.test(openingLine))) return openingLine;
  const intro = ferniIntro(parties);
  if (!personal) return `Hi, ${intro}. Do you have a quick minute?`;
  const hello = recipientName ? `Hi ${recipientName}` : 'Hi';
  return sponsorName
    ? `${hello}, ${intro}. ${sponsorName} asked me to check in on you. Is now an okay time?`
    : `${hello}, ${intro}, calling to check in on you. Is now an okay time?`;
}
