/**
 * How Ferni names itself to someone it calls for a user: "it's Ferni, Sam's AI
 * friend". The one, light AI disclosure, as fixed text. It lives here, below
 * both outreach (services/outreach/opening-line.ts builds the live opener from
 * it) and the tools (makePhoneCall's played message), so every call that rings
 * someone else says the same words.
 *
 * @module utils/ferni-intro
 */

import { flagOn, type Env } from '../config/env-flag.js';
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

/** A title said before a name, with or without its period: never the first name. */
const TITLE = /^(?:mr|mrs|ms|mx|dr|prof)\.?$/i;

/**
 * The first name to say to someone who isn't the user: "Sam" from "Sam Lee".
 * NFC first, so a decomposed "Zoë" (as iOS and macOS often store it) keeps its
 * name. A leading title is skipped: "Dr Sam Lee" says "Sam", never "Dr". A
 * title before one word ("Mr Lee") leaves only a surname, so there is no first
 * name to say. Undefined when there isn't a usable one.
 */
export function spokenFirstName(name: string | undefined): string | undefined {
  const words = realName(name)?.normalize('NFC').split(/\s+/) ?? [];
  const [first] = words;
  if (first && TITLE.test(first)) {
    words.shift();
    if (words.length < 2) return undefined;
  }
  return firstNameOf(words.join(' ')) ?? undefined;
}

/**
 * The user's name as an on-behalf call's opener says it. With
 * OPENER_FIRST_NAME_PERSONAL on, a personal or family call says the first name
 * ("Sam's AI friend"). The name dispatched is already the preferred name when
 * one is set (call-on-behalf.ts, deferred-calls.ts requesterNameNow), so a
 * one-word preferred name is said whole. With no usable first name it says
 * what it said before. Any other call, and the flag off, keep the full name.
 */
export function openerSponsorName(
  userName: string | undefined,
  personal: boolean,
  env: Env = process.env
): string | undefined {
  const full = realName(userName);
  if (!personal || !flagOn('OPENER_FIRST_NAME_PERSONAL', env)) return full;
  return spokenFirstName(full) ?? full;
}

/**
 * The user's name an on-behalf call is dispatched with: the preferred name when
 * one is set, else the profile name. With OPENER_FIRST_NAME_PERSONAL on, a
 * blank preferred name falls to the profile name, so the opener never loses it.
 */
export function dispatchedUserName(
  preferredName: string | undefined,
  name: string | undefined,
  env: Env = process.env
): string {
  const preferred = flagOn('OPENER_FIRST_NAME_PERSONAL', env)
    ? preferredName?.trim()
    : preferredName;
  return preferred || name || 'the user';
}

/**
 * The first words of a call that only plays a message (makePhoneCall): "Hi,
 * it's Ferni, Sam's AI friend." No question, since nobody can answer it.
 * The callee hears the user's first name only: "Sam Lee" says "Sam's AI
 * friend", never the full stored name.
 */
export function messageCallGreeting(sponsorName: string | undefined): string {
  return `Hi, ${ferniIntro({ sponsorName: spokenFirstName(sponsorName), personal: true })}.`;
}
