/**
 * A number the owner gives for someone while asking Ferni to call them is the owner's own
 * data, so it is saved when Ferni reads the call back (call-confirm.ts), before any yes, not
 * only once a confirmed call is placed (call-on-behalf.ts). Prod 2026-10-26: the owner gave
 * his dad's number at 18:47 for a call that was never placed; at 22:20 Ferni had no number.
 *
 * - Nobody saved by that name: saved under it ("my dad" → "Dad", saveFieldsFor). If the same
 *   number is already saved under another name, that contact keeps its name and is found by
 *   this one too ("Dad", also called Doug).
 * - A saved contact with no number (by that name: the lookup skips phoneless rows): filled in.
 * - A saved contact with a different number: kept. The read-back says it would change, and
 *   only a yes to that read-back (REPLACE_SAVED_NUMBER on the confirmed args) replaces it.
 * - Several contacts match and none has this number: nothing is saved (ambiguous).
 *
 * Never for an id that names no member (onbehalf:, anon:), a caller MINOR_CARE holds, or a
 * number that isn't a dialable US number, a +1 555 test number or one of Ferni's own lines.
 * Numbers are never logged. CONTACT_SAVE_ON_MENTION (default on) is the kill switch: off, a
 * number is saved only when a confirmed call to someone not yet saved is placed, as before.
 *
 * @module tools/domains/telephony/contact-on-mention
 */

import { flagOn } from '../../../config/env-flag.js';
import { checkDialableNumber } from '../../../utils/dialable-number.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { isSyntheticPhone, namesNoAccount } from '../../../utils/synthetic-user.js';
import { saveFieldsFor } from './contact-pick.js';
import { digits, norm } from './contact-pick-v2.js';
import type { ResolvedContact } from './types.js';

const log = getLogger();

/** On confirmed call args: the owner said yes to a read-back that changes the saved number. */
export const REPLACE_SAVED_NUMBER = Symbol('replace-saved-number');

/** What a lookup for the person returns (call-on-behalf.ts findContact). */
export type FoundContact =
  ResolvedContact | { choices: readonly ResolvedContact[]; ask: string } | null;

export type NumberOutcome =
  | 'off'
  | 'refused'
  | 'held'
  | 'invalid'
  | 'ambiguous'
  | 'same'
  | 'differs'
  | 'unnamed'
  | 'saved'
  | 'filled'
  | 'aliased'
  | 'replaced'
  | 'failed';

export interface NumberGiven {
  userId: string;
  sessionId?: string;
  contactQuery: string;
  /** The number as given (any format). */
  phone: string;
  /** Who the call resolved to before the given number was applied. */
  found: FoundContact;
  /** The confirmed call is being placed (execute), not read back. */
  placing?: boolean;
  /** The owner said yes to replacing a different saved number. */
  replace?: boolean;
}

/** "my mom" → "mom", "the dentist" → "dentist": the relation word a query names, if any. */
export function relationWordOf(query: string): string | undefined {
  const q = query.toLowerCase();
  const family = 'mom mother dad father brother sister grandma grandpa aunt uncle cousin';
  const words = [...family.split(' '), ...'doctor dentist therapist lawyer accountant'.split(' ')];
  return words.find((w) => q.includes(w));
}

const ferniLine = (d: string): boolean =>
  [process.env.TWILIO_PHONE_NUMBER, process.env.SIP_TRUNK_NUMBER].some(
    (n) => digits(n) !== '' && digits(n) === d
  );

/** The number in E.164 if it may be saved: dialable, not a +1 555 test number, not Ferni's. */
function savableNumber(phone: string): string | null {
  const number = checkDialableNumber(phone);
  if (!number.ok || isSyntheticPhone(number.e164) || ferniLine(digits(number.e164))) return null;
  return number.e164;
}

/** Why nothing may be saved for this caller, or null. */
function refusal(input: NumberGiven): NumberOutcome | null {
  if (namesNoAccount(input.userId)) return 'refused';
  if (writeHeld(input.userId, input.sessionId)) return 'held';
  if (flagOn('CONTACT_SAVE_ON_MENTION')) return null;
  return input.placing && !input.found ? null : 'off'; // as before the flag
}

/** Save a number the owner gave for a call, as the module doc says. Never throws. */
export async function rememberNumberGiven(input: NumberGiven): Promise<NumberOutcome> {
  const stop = refusal(input);
  if (stop) return stop;
  const e164 = savableNumber(input.phone);
  if (!e164) return 'invalid';
  const given = digits(e164);
  const { found } = input;
  if (found && 'choices' in found)
    return found.choices.some((c) => digits(c.phone) === given) ? 'same' : 'ambiguous';
  const stored = digits(found?.phone);
  if (found && stored === given) return 'same';
  if (found && stored && !input.replace) return 'differs';
  try {
    const outcome = await write(input.userId, input.contactQuery, found, e164);
    log.info({ userId: input.userId, outcome }, '📇 contact-on-mention: number given for a call');
    return outcome;
  } catch (error) {
    log.warn({ userId: input.userId, error: String(error) }, 'contact-on-mention: not saved');
    return 'failed';
  }
}

async function write(
  userId: string,
  contactQuery: string,
  contact: ResolvedContact | null,
  e164: string
): Promise<NumberOutcome> {
  const store = await import('../../../services/contacts/index.js');
  const rows = await store.getContacts(userId);
  const row = contact?.id ? rows.find((r) => r.id === contact.id) : undefined;
  if (row) {
    await store.upsertContact(userId, { ...row, phone: e164 });
    return digits(row.phone) ? 'replaced' : 'filled';
  }
  // Not in this store (an entity-store or user_contacts match): saved here under its name
  const fields = saveFieldsFor(contact?.name ?? contactQuery, relationWordOf(contactQuery));
  if (!fields) return 'unnamed'; // CONTACT_PICK_V2: "them" / "contact" names no one
  // The lookup skips a phoneless row ("Dad", no number), so it is found here by its name
  const phoneless = rows.find((r) => !digits(r.phone) && norm(r.name) === norm(fields.name));
  if (phoneless) {
    await store.upsertContact(userId, { ...phoneless, phone: e164 });
    return 'filled';
  }
  const twin = rows.find((r) => digits(r.phone) === digits(e164));
  if (twin) {
    const alias = `Also called ${fields.name}`;
    const notes = twin.notes ?? '';
    if (norm(twin.name) === norm(fields.name) || norm(notes).includes(norm(alias))) return 'same';
    await store.upsertContact(userId, { ...twin, notes: notes ? `${notes}; ${alias}` : alias });
    return 'aliased';
  }
  await store.upsertContact(userId, { ...fields, contactId: `phone_${e164}`, phone: e164 });
  return 'saved';
}

/** Looks up who was asked for (call-on-behalf.ts findContact, for this user). */
export type FindContact = (who: string) => Promise<FoundContact>;

/** What the read-back and the stored args gain: nothing, or the ask to replace a saved number. */
export interface ReadBackChange {
  readBack: string;
  args: Record<symbol, true>;
}

/**
 * At the read-back (call-confirm.ts), for a number the owner gave (`given`; '' when none was):
 * save it now, or, when the person already has a different saved number, ask in the read-back
 * before replacing it.
 */
export async function numberAtReadBack(
  userId: string,
  who: string,
  given: string,
  find: FindContact
): Promise<ReadBackChange> {
  const none: ReadBackChange = { readBack: '', args: {} };
  if (!given || !flagOn('CONTACT_SAVE_ON_MENTION') || namesNoAccount(userId)) return none;
  const found = await find(who).catch((): FoundContact => null);
  const outcome = await rememberNumberGiven({ userId, contactQuery: who, phone: given, found });
  if (outcome !== 'differs' || !found || 'choices' in found) return none;
  const ending = digits(found.phone).slice(-4);
  return {
    readBack: `, and change ${found.name}'s saved number (now ending in ${ending}) to this one`,
    args: { [REPLACE_SAVED_NUMBER]: true },
  };
}

/** Whether confirmed call args carry the owner's yes to replacing the saved number. */
export function replaceConfirmed(args: object): boolean {
  return (args as Record<symbol, unknown>)[REPLACE_SAVED_NUMBER] === true;
}
