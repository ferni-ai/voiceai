/**
 * How Ferni names itself to someone it calls for a user: "it's Ferni, Sam's AI
 * friend". The one, light AI disclosure, as fixed text. It lives here, below
 * both outreach (services/outreach/opening-line.ts builds the live opener from
 * it) and the tools (makePhoneCall's played message), so every call that rings
 * someone else says the same words. Who an opener names by first name
 * (opensByFirstName) lives here too, so callOnBehalf dispatches the name the
 * opener will say.
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
function realName(name: string | undefined): string | undefined {
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
function spokenFirstName(name: string | undefined): string | undefined {
  const words = namedWords(name);
  return words ? (firstNameOf(words.join(' ')) ?? undefined) : undefined;
}

/** The name's words from its first name on: a leading title dropped; undefined if only a surname is left. */
function namedWords(name: string | undefined): string[] | undefined {
  const words = realName(name)?.normalize('NFC').split(/\s+/) ?? [];
  const [first] = words;
  if (first && TITLE.test(first)) {
    words.shift();
    if (words.length < 2) return undefined;
  }
  return words;
}

/**
 * A first word typed in capitals that is likely initials: "JR" in "JR Rivera",
 * "AJ" in "AJ PARK". Said as a first name it would be "Jr" (TTS: "Junior"). Two
 * letters always; three only when the rest of the name isn't in capitals too,
 * so "SAM RIVERA" is still "Sam".
 */
function initialsFirst(name: string): boolean {
  const [first = ''] = namedWords(name) ?? [];
  const letters = [...first].length;
  if (first === first.toLowerCase() || first !== first.toUpperCase()) return false;
  return letters <= 2 || (letters === 3 && name !== name.toUpperCase());
}

/**
 * The user's name as an on-behalf call's opener says it. With
 * OPENER_FIRST_NAME_PERSONAL on, a personal call to someone saved by name says
 * the first name ("Sam's AI friend"); services/outreach/opening-line.ts
 * opensByFirstName is false for a relation ("Mom") or a family check-in. The name
 * dispatched is already the preferred name when one is set (call-on-behalf.ts,
 * deferred-calls.ts requesterNameNow), so a one-word preferred name is said
 * whole. With no usable first name, or initials ("JR Rivera"), it says what it
 * said before. Any other call, and the flag off, keep the full name.
 */
export function openerSponsorName(
  userName: string | undefined,
  personal: boolean,
  env: Env = process.env
): string | undefined {
  const full = realName(userName);
  if (!full || !personal || !flagOn('OPENER_FIRST_NAME_PERSONAL', env)) return full;
  if (initialsFirst(full)) return full;
  return spokenFirstName(full) ?? full;
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

/**
 * Whether a call's opener may change the user's name: a personal call to
 * someone saved by name. A call is personal only when its type says so
 * (call-on-behalf.ts inferCallType from the contact's relationship; a family
 * check-in is dispatched as personal); a missing or other type is treated as
 * business. A relation ("Mom") or a family check-in keeps main's name (Seth,
 * 2026-11-07: first name in the personal opener only). callOnBehalf asks this
 * too, so a blank preferred name changes nothing else.
 */
export function opensByFirstName(call: {
  recipientName?: string;
  callType?: string;
  kind?: string;
}): boolean {
  const personal = call.callType === 'personal';
  return (
    personal && !nameAndRelation(call.recipientName).relation && call.kind !== 'family_checkin'
  );
}

/**
 * The user's name an on-behalf call is dispatched with: the preferred name when
 * one is set, else the profile name. With OPENER_FIRST_NAME_PERSONAL on, a
 * personal call to someone saved by name (opensByFirstName above)
 * takes a blank preferred name as unset, so its opener never loses the name.
 * Every other call, and the flag off, dispatch what main did.
 */
export function dispatchedUserName(
  preferredName: string | undefined,
  name: string | undefined,
  personal: boolean,
  env: Env = process.env
): string {
  const preferred =
    personal && flagOn('OPENER_FIRST_NAME_PERSONAL', env) ? preferredName?.trim() : preferredName;
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
