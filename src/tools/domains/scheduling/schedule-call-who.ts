/**
 * SCHEDULE_CALL_WHO (off by default): scheduleCall only ever rings the caller's
 * own verified phone (proactive/outreach/service.ts scheduleCall). Asked to
 * schedule a call to someone else ("call my mom at six"), it rang the caller
 * at that time instead, playing the words meant for the other person. With the
 * flag on, the model says whom the call is for; a `who` naming anyone but the
 * caller schedules nothing and writes nothing, and the tool result says so.
 * It offers nothing in its place. The description says it rings only the caller.
 *
 * @module tools/domains/scheduling/schedule-call-who
 */
import { z } from 'zod';

import { flagOn, type Env } from '../../../config/env-flag.js';
import { words } from '../communication/outreach/consent-words.js';
import { ownerNames } from '../communication/outreach/outreach-confirm.js';
import { getCallUserPort } from '../proactive/outreach/call-user-port.js';

/** Read when the tool is built and on each run, so a cohort's value applies per call. */
const scheduleCallWhoOn = (env: Env): boolean => flagOn('SCHEDULE_CALL_WHO', env);

/**
 * Words that never name someone else: the caller and their own phone ("me (the
 * caller)", "my own cell", "your phone"). Compared after words(), like everything here.
 */
const SELF_WORDS = new Set(
  [
    'i me my mine myself self own you your yourself the a an user caller',
    'phone cell cellphone mobile number telephone line',
  ]
    .join(' ')
    .split(' ')
);

/**
 * Words that say the call is for someone else in any casing: a relationship or
 * role ("my mom", "Riley's boss"), or "from" ("Riley from work"). A plural or
 * possessive counts too: words() reads "mom's" as "moms".
 */
const OTHER_WORDS = new Set(
  [
    'mom mum mother mama mommy dad father papa daddy parent grandma grandpa grandmother grandfather',
    'nana granny grandparent sister brother sibling son daughter kid child children baby wife husband',
    'spouse partner boyfriend girlfriend fiance fiancee aunt uncle cousin niece nephew family friend',
    'bestie buddy pal roommate neighbor neighbour boss manager coworker colleague team client customer',
    'doctor dentist therapist landlord teacher coach from',
  ]
    .join(' ')
    .split(' ')
);
const isOtherWord = (w: string): boolean =>
  OTHER_WORDS.has(w) || (w.endsWith('s') && OTHER_WORDS.has(w.slice(0, -1)));

/**
 * Whether the name words are the caller's own name: the opening words of one of
 * their names (ownerNames: "mary jane testing"), from the first word up to all
 * of it, compared without spaces so "MaryJane" is "Mary-Jane".
 */
function isOwnName(named: string[], owner: readonly string[]): boolean {
  const said = named.join('');
  return owner.some((full) => {
    let own = '';
    return full.split(' ').some((word) => (own += word) === said);
  });
}

/** The digits of a phone number in `who` (7 or more), or undefined: "(801) 555-0100" → "8015550100". */
function phoneDigits(who: unknown): string | undefined {
  const digits = typeof who === 'string' ? who.replace(/\D/g, '') : '';
  return digits.length >= 7 ? digits : undefined;
}

/** Whether the digits are the verified phone's, with or without its country code or area code. */
function isOwnNumber(digits: string, ownPhone: string): boolean {
  const own = ownPhone.replace(/\D/g, '');
  return own.length >= 7 && (own.endsWith(digits) || digits.endsWith(own.slice(-10)));
}

/**
 * Whether `who` clearly names someone else. Only positive evidence counts: a
 * phone number that isn't the caller's verified one, a relationship word, or a
 * capitalized name or a possessive ("sam's") that isn't the caller's own name.
 * Anything else (a paraphrase, the caller's own number, symbols, or a number
 * with no verified phone to compare it to) is the caller, rung as main does.
 */
function namesSomeoneElse(who: string, owner: readonly string[], ownPhone?: string): boolean {
  const digits = phoneDigits(who);
  if (digits !== undefined && ownPhone !== undefined && !isOwnNumber(digits, ownPhone)) return true;
  const named: string[] = [];
  for (const chunk of who.split(/\s+/)) {
    const possessor = /^(.+?)['’]s(?=[^\p{L}\p{M}]*$)/u.exec(chunk)?.[1];
    const said = words(possessor ?? chunk);
    if (said.some(isOtherWord)) return true;
    if (possessor !== undefined || /^[^\p{L}]*\p{Lu}/u.test(chunk)) {
      named.push(...said.filter((w) => !SELF_WORDS.has(w) && /\p{L}/u.test(w))); // not an emoji
    }
  }
  return named.length > 0 && !isOwnName(named, owner);
}

/**
 * Whom the call is for when `who` clearly names someone other than the caller;
 * undefined otherwise. The caller's own name counts from their first name (or
 * the first half of a hyphenated one) up to their full name, never
 * "Riley from work", "Riley's boss" or "Sam L".
 */
export function otherPerson(
  who: unknown,
  owner: readonly string[] = [],
  ownPhone?: string
): string | undefined {
  const name = typeof who === 'string' ? who.trim().replace(/[.!?]+$/, '') : '';
  return namesSomeoneElse(name, owner, ownPhone) ? name : undefined;
}

/** main's description, word for word: what the model reads with the flag off. */
const DESCRIPTION = `Schedule a phone call for later.
Use when the user says things like:
- "Call me at 2pm to remind me about the meeting"
- "Give me a wake-up call tomorrow at 7am"
- "Call me tonight if I haven't worked out by 8pm"

The call will play a voice message when answered.`;

/** The tool's description; with the flag on it says the call rings only the caller. */
export function scheduleCallDescription(env: Env = process.env): string {
  if (!scheduleCallWhoOn(env)) return DESCRIPTION;
  return (
    `${DESCRIPTION}\n\nIt only ever rings the caller's own phone, never anyone else. ` +
    'For a call to someone else at a set time, set who to that person: nothing is scheduled.'
  );
}

/** The parameter the model fills with whom the call is for; none with the flag off. */
export function whoParam(env: Env = process.env): { who?: z.ZodOptional<z.ZodString> } {
  if (!scheduleCallWhoOn(env)) return {};
  const who = z
    .string()
    .optional()
    .describe('Who the call is for: "me" for the caller, or the other person\'s name');
  return { who };
}

/**
 * The account's verified phone, read only when `who` holds a number. A lookup
 * that fails throws here as it would in scheduleCall a moment later on main.
 */
async function verifiedPhoneFor(who: unknown, userId: string): Promise<string | undefined> {
  if (phoneDigits(who) === undefined) return undefined;
  return getCallUserPort()?.verifiedPhone(userId);
}

/**
 * The tool result when the call is for someone else, or undefined: the
 * caller's own call, or the flag off. Nothing is scheduled and nothing offered.
 */
export async function forSomeoneElse(
  params: { who?: unknown },
  opts: unknown,
  userId: string,
  env: Env = process.env
): Promise<string | undefined> {
  if (!scheduleCallWhoOn(env)) return undefined;
  const ownPhone = await verifiedPhoneFor(params.who, userId);
  const other = otherPerson(params.who, ownerNames(opts), ownPhone);
  if (other === undefined) return undefined;
  return (
    `Nothing was scheduled: this tool only rings the caller's own phone, so it can't call ${other}. ` +
    'Tell the caller that plainly and kindly, in your own words.'
  );
}
