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

import {
  ferniIntro,
  nameAndRelation,
  openerSponsorName,
  opensByFirstName,
} from '../../utils/ferni-intro.js';
import type { Env } from '../../config/env-flag.js';

// The identity text and who is named by first name live below the tools, so makePhoneCall and
// callOnBehalf use them too (utils/ferni-intro.ts)
export { ferniIntro, nameAndRelation };

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

/** The parties of a call, from the outbound call context's fields. */
export function partiesOf(
  call: {
    recipientName?: string;
    userName?: string;
    callType?: string;
    openingLine?: string;
    kind?: string;
  },
  env: Env = process.env
): OutboundParties {
  const { name, relation } = nameAndRelation(call.recipientName);
  const personal = call.callType === 'personal';
  const checkin = call.kind === 'family_checkin';
  return {
    recipientName: name,
    ...(relation && { relation }),
    sponsorName: openerSponsorName(call.userName, opensByFirstName(call), env),
    personal,
    openingLine: call.openingLine,
    ...(checkin && { checkin: true }),
  };
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
