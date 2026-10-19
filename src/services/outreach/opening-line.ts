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
  /** What they are to the user ("mom") when the contact is saved by that, not a name. */
  relation?: string;
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

/** Contact names that say who someone is to the user, not what they are called. */
const RELATIONS = new Set(
  `mom mum mother mama momma dad father papa sister sis brother bro grandma grandmother granny
  nana grandpa grandfather granddad wife husband partner son daughter aunt auntie uncle cousin
  niece nephew stepmom stepmother stepdad stepfather stepson stepdaughter boyfriend girlfriend
  fiance fiancee`.split(/\s+/)
);

/**
 * A saved contact name as the person's name and what they are to the user:
 * "Linda" is a name, "Mom" (or "my mom") only a relation, "Mom (Linda)" both.
 * Prod 2026-10-18: a contact saved as "mom" was greeted "Hi mom".
 */
export function nameAndRelation(saved: string | undefined): { name?: string; relation?: string } {
  let name: string | undefined;
  let relation: string | undefined;
  for (const part of (saved ?? '').split(/[(),/]|\s[-–]\s/)) {
    const word = part
      .trim()
      .toLowerCase()
      .replace(/^my\s+/, '');
    if (RELATIONS.has(word)) relation ??= word;
    else name ??= realName(part);
  }
  return { name, relation };
}

/** The parties of a call, from the outbound call context's fields. */
export function partiesOf(call: {
  recipientName?: string;
  userName?: string;
  callType?: string;
  openingLine?: string;
  kind?: string;
}): OutboundParties {
  const { name, relation } = nameAndRelation(call.recipientName);
  return {
    recipientName: name,
    ...(relation && { relation }),
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
  const { recipientName, relation, sponsorName, personal, openingLine } = parties;
  // A check-in's opener is the server's own (signed dispatch) and names no AI on purpose
  if (openingLine && (parties.checkin || /\bAI\b/.test(openingLine))) return openingLine;
  const intro = ferniIntro(parties);
  if (!personal) return `Hi, ${intro}. Do you have a quick minute?`;
  // Saved only as "mom": ask who answered, never greet them as "mom".
  if (!recipientName && relation && sponsorName) {
    const said = `${intro.charAt(0).toUpperCase()}${intro.slice(1)}`;
    return `Hi, is this ${sponsorName}'s ${relation}? ${said}. ${sponsorName} asked me to check in on you. Is now an okay time?`;
  }
  const hello = recipientName ? `Hi ${recipientName}` : 'Hi';
  return sponsorName
    ? `${hello}, ${intro}. ${sponsorName} asked me to check in on you. Is now an okay time?`
    : `${hello}, ${intro}, calling to check in on you. Is now an okay time?`;
}
