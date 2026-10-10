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

/** The parties of a call, from the outbound call context's fields. */
export function partiesOf(call: {
  recipientName?: string;
  userName?: string;
  callType?: string;
}): OutboundParties {
  return {
    recipientName: realName(call.recipientName),
    sponsorName: realName(call.userName),
    personal: call.callType === 'personal',
  };
}

/** How Ferni names itself on the call: "it's Ferni, Seth's AI friend". */
export function ferniIntro({ sponsorName, personal }: OutboundParties): string {
  if (personal) {
    return sponsorName ? `it's Ferni, ${sponsorName}'s AI friend` : "it's Ferni, an AI friend";
  }
  return `this is Ferni, an AI calling ${sponsorName ? `for ${sponsorName}` : "on someone's behalf"}`;
}

/**
 * The opener: addresses the person on the line, introduces Ferni as the
 * user's AI friend, and says why it called.
 */
export function outboundOpener(parties: OutboundParties): string {
  const { recipientName, sponsorName, personal } = parties;
  const intro = ferniIntro(parties);
  if (!personal) return `Hi, ${intro}. Do you have a quick minute?`;
  const hello = recipientName ? `Hi ${recipientName}` : 'Hi';
  return sponsorName
    ? `${hello}, ${intro}. ${sponsorName} asked me to check in on you. Is now an okay time?`
    : `${hello}, ${intro}, calling to check in on you. Is now an okay time?`;
}
