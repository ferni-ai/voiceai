/**
 * How Ferni names itself to someone it calls for a user: "it's Ferni, Sam's AI
 * friend". The one, light AI disclosure, as fixed text. It lives here, below
 * both outreach (services/outreach/opening-line.ts builds the live opener from
 * it) and the tools (makePhoneCall's played message), so every call that rings
 * someone else says the same words.
 *
 * @module utils/ferni-intro
 */

import { firstNameOf } from './caller-name.js';

/** Who Ferni is calling for, and how; services/outreach/opening-line.ts OutboundParties has these. */
export interface IntroParties {
  /** The user Ferni is calling for; never the person on the line. */
  sponsorName?: string;
  /** A personal call opens as the user's AI friend; a business hears "an AI calling for". */
  personal: boolean;
  /** A family check-in: the person agreed to Ferni's calls, so Ferni just says its name. */
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

/** The name, trimmed, or undefined when it is empty or a placeholder ("the user"). */
export function realName(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed && !PLACEHOLDER_NAMES.has(trimmed.toLowerCase()) ? trimmed : undefined;
}

/** How Ferni names itself on the call: "it's Ferni, Sam's AI friend". */
export function ferniIntro({ sponsorName, personal, checkin }: IntroParties): string {
  if (checkin) return "it's Ferni";
  if (personal) {
    return sponsorName ? `it's Ferni, ${sponsorName}'s AI friend` : "it's Ferni, an AI friend";
  }
  return `this is Ferni, an AI calling ${sponsorName ? `for ${sponsorName}` : "on someone's behalf"}`;
}

/**
 * The first words of a call that only plays a message (makePhoneCall): "Hi,
 * it's Ferni, Sam's AI friend." No question, since nobody can answer it.
 * The callee hears the user's first name only: "Sam Lee" says "Sam's AI
 * friend", never the full stored name.
 */
export function messageCallGreeting(sponsorName: string | undefined): string {
  const named = realName(sponsorName);
  const first = named ? (firstNameOf(named) ?? undefined) : undefined;
  return `Hi, ${ferniIntro({ sponsorName: first, personal: true })}.`;
}
