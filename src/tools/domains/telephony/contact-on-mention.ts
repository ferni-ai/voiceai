/**
 * A number the owner gives for someone while asking Ferni to call them is the owner's own
 * data, so it is saved when Ferni reads the call back (call-confirm.ts), before any yes, not
 * only once a confirmed call is placed (call-on-behalf.ts). Prod 2026-10-26: the owner gave
 * his dad's number at 18:47 for a call that was never placed; at 22:20 Ferni had no number.
 *
 * Who the number is for is "the person asked for": the lookup's pick, unless it is a contact
 * for another relation (the store's "dad" search can return Mom), or a saved contact that
 * matches the words by name, relation or the owner's relation in its notes.
 * - The person has this number: nothing to do. No number: it is filled in.
 * - The person has a different number: kept. The read-back asks to change it, and only a yes
 *   to that read-back (REPLACE_SAVED_NUMBER) changes it, in the store it was found in (the
 *   entity store, and the same person's contact_relationships rows), never as a second row.
 * - Nobody is the person, but the number is another contact's (a shared landline): that
 *   contact is never changed. The read-back asks whether this person is at the same number,
 *   and a yes (SHARED_NUMBER_OK) saves them as their own contact sharing it.
 * - Nobody is the person: saved under the name asked for ("my dad" → "Dad", saveFieldsFor).
 * - The owner's own words tie a name to a relation ("my dad, Doug"): the name is added to that
 *   person ("Also called Doug"). Nothing else ever adds a name to an existing contact.
 *
 * Never for an id that names no member (onbehalf:, anon:), a caller MINOR_CARE holds, or a
 * number that isn't a dialable US number, a +1 555 test number or one of Ferni's own lines;
 * these guards hold with the flag off too (safety, not behaviour). Numbers are never logged.
 * CONTACT_SAVE_ON_MENTION (default on) is the kill switch: off, a number is saved only when a
 * confirmed call to someone not yet saved is placed, as before (stored as E.164).
 *
 * @module tools/domains/telephony/contact-on-mention
 */

import { flagOn } from '../../../config/env-flag.js';
import { checkDialableNumber } from '../../../utils/dialable-number.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { isSyntheticPhone, namesNoAccount } from '../../../utils/synthetic-user.js';
import { saveFieldsFor } from './contact-pick.js';
import { digits, norm, roleOf } from './contact-pick-v2.js';
import { isPersonAsked, relationWordOf, tiedName } from './contact-person.js';
import type { ResolvedContact } from './types.js';

export { pickIsSomeoneElse, relationWordOf } from './contact-person.js';

const log = getLogger();

/** On confirmed call args: the owner said yes to a read-back that changes the saved number. */
export const REPLACE_SAVED_NUMBER = Symbol('replace-saved-number');
/** On confirmed call args: the owner said yes to "is <them> at the same number as <contact>?" */
export const SHARED_NUMBER_OK = Symbol('shared-number-ok');

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
  | 'shared'
  | 'unnamed'
  | 'saved'
  | 'separate'
  | 'filled'
  | 'aliased'
  | 'replaced'
  | 'failed';

export interface NumberResult {
  outcome: NumberOutcome;
  /** Who a read-back asks about: the person ('differs'), or the number's owner ('shared'). */
  about?: { name: string; phone?: string };
}

export interface NumberGiven {
  userId: string;
  sessionId?: string;
  contactQuery: string;
  /** The number as given (any format). */
  phone: string;
  /** Who the call's lookup resolved to, before the given number was applied. */
  found: FoundContact;
  /** The confirmed call is being placed (execute), not read back. */
  placing?: boolean;
  /** The owner said yes to changing the person's saved number. */
  replace?: boolean;
  /** The owner said yes to this person sharing another contact's number. */
  shared?: boolean;
  /** Writes a changed number to the entity store (integration.ts setPersonPhone). */
  setEntityPhone?: (entityId: string, e164: string) => Promise<boolean>;
}

type Store = typeof import('../../../services/contacts/index.js');
type Row = Awaited<ReturnType<Store['getContacts']>>[number];
type Person = ResolvedContact | Row;

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

/** Why nothing may be saved for this caller, or null (holds with the flag off too). */
function refusal(input: NumberGiven): NumberOutcome | null {
  if (namesNoAccount(input.userId)) return 'refused';
  if (writeHeld(input.userId, input.sessionId)) return 'held';
  return null;
}

/** Main's rule (flag off): the confirmed call rings someone the lookup didn't find. */
function unknownToLookup(found: FoundContact, given: string): boolean {
  if (!found) return true;
  return 'choices' in found && !found.choices.some((c) => digits(c.phone) === given);
}

/** Save a number the owner gave for a call, as the module doc says. Never throws. */
export async function rememberNumberGiven(input: NumberGiven): Promise<NumberResult> {
  const stop = refusal(input);
  if (stop) return { outcome: stop };
  const e164 = savableNumber(input.phone);
  if (!e164) return { outcome: 'invalid' };
  const on = flagOn('CONTACT_SAVE_ON_MENTION');
  if (!on && !(input.placing && unknownToLookup(input.found, digits(e164)))) {
    return { outcome: 'off' };
  }
  const { found } = input;
  if (on && found && 'choices' in found)
    return {
      outcome: found.choices.some((c) => digits(c.phone) === digits(e164)) ? 'same' : 'ambiguous',
    };
  try {
    const store = await import('../../../services/contacts/index.js');
    const result = on
      ? await decide(store, await store.getContacts(input.userId), input, e164)
      : await saveNew(store, [], input.userId, input.contactQuery, e164);
    log.info({ userId: input.userId, outcome: result.outcome }, '📇 contact-on-mention');
    return result;
  } catch (error) {
    log.warn({ userId: input.userId, error: String(error) }, 'contact-on-mention: not saved');
    return { outcome: 'failed' };
  }
}

async function decide(store: Store, rows: Row[], input: NumberGiven, e164: string) {
  const tie = tiedName(input.contactQuery);
  const asked = tie ? tie.role : input.contactQuery;
  const found = input.found as ResolvedContact | null;
  const person: Person | undefined =
    found && isPersonAsked(found, asked, true)
      ? found
      : rows.find((r) => isPersonAsked(r, asked, false));
  if (person) {
    if (tie) await addName(store, input.userId, rows, person, tie.name);
    const stored = digits(person.phone);
    if (stored === digits(e164)) return { outcome: tie ? 'aliased' : 'same' } as NumberResult;
    if (stored && !input.replace) return { outcome: 'differs', about: person } as NumberResult;
    return { outcome: await setNumber(store, rows, input, person, e164) };
  }
  const twin = rows.find((r) => digits(r.phone) === digits(e164));
  if (twin && !input.shared) return { outcome: 'shared', about: twin } as NumberResult;
  return saveNew(store, rows, input.userId, input.contactQuery, e164, tie?.name);
}

/** A new contact for the person asked for; its own row even when the number is shared. */
async function saveNew(
  store: Store,
  rows: Row[],
  userId: string,
  contactQuery: string,
  e164: string,
  alias?: string
): Promise<NumberResult> {
  const tie = alias ? tiedName(contactQuery) : null;
  const said = tie ? tie.role : contactQuery;
  const fields = saveFieldsFor(said, relationWordOf(said));
  if (!fields) return { outcome: 'unnamed' }; // CONTACT_PICK_V2: "them" / "contact" names no one
  const notes = alias
    ? [fields.notes, `Also called ${alias}`].filter(Boolean).join('; ')
    : fields.notes;
  const base = `phone_${e164}`;
  const taken = rows.some((r) => r.contactId === base);
  const contactId = taken ? `${base}_${norm(fields.name).replace(/\s+/g, '_')}` : base;
  await store.upsertContact(userId, { ...fields, notes, contactId, phone: e164 });
  const shared = rows.some((r) => digits(r.phone) === digits(e164));
  return { outcome: shared ? 'separate' : 'saved' };
}

/** The owner's words tied this name to the person: added to their row's notes, once. */
async function addName(store: Store, userId: string, rows: Row[], person: Person, name: string) {
  const row =
    rows.find((r) => r.id === person.id) ?? rows.find((r) => norm(r.name) === norm(person.name));
  const alias = `Also called ${name}`;
  if (!row || norm(row.name) === norm(name) || norm(row.notes).includes(norm(alias))) return;
  await store.upsertContact(userId, {
    ...row,
    notes: row.notes ? `${row.notes}; ${alias}` : alias,
  });
}

/**
 * Fill in or change the person's number where the lookup will read it next: the entity store
 * when it answered, and the person's own contact_relationships rows (by id, or the same name
 * with the old number or none). A new row only when neither store holds them (user_contacts).
 */
async function setNumber(
  store: Store,
  rows: Row[],
  input: NumberGiven,
  person: Person,
  e164: string
): Promise<NumberOutcome> {
  const old = digits(person.phone);
  const { entityId } = person as ResolvedContact;
  const inEntity =
    entityId && input.setEntityPhone ? await input.setEntityPhone(entityId, e164) : false;
  const own = rows.filter(
    (r) =>
      r.id === person.id ||
      (norm(r.name) === norm(person.name) && [old, ''].includes(digits(r.phone)))
  );
  await Promise.all(own.map((r) => store.upsertContact(input.userId, { ...r, phone: e164 })));
  if (!inEntity && own.length === 0) await saveNew(store, rows, input.userId, person.name, e164);
  return old ? 'replaced' : 'filled';
}

/** What the read-back and the stored args gain: nothing, or a question the yes answers. */
export interface ReadBackChange {
  readBack: string;
  args: Record<symbol, true>;
}

/** Looks up who was asked for (call-on-behalf.ts findContact, for this user). */
export type FindContact = (who: string) => Promise<FoundContact>;

/**
 * At the read-back (call-confirm.ts), for a number the owner gave (`given`; '' when none was):
 * save it now, or ask in the read-back first (a different saved number, or another contact's).
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
  const { outcome, about } = await rememberNumberGiven({
    userId,
    contactQuery: who,
    phone: given,
    found,
  });
  const ending = digits(about?.phone).slice(-4);
  if (outcome === 'differs' && about) {
    const change = `change ${about.name}'s saved number (now ending in ${ending})`;
    const readBack = `, and ${change} to this one`;
    return { readBack, args: { [REPLACE_SAVED_NUMBER]: true } };
  }
  if (outcome !== 'shared' || !about) return none;
  const role = roleOf(who);
  const them = role ? `your ${role.toLowerCase()}` : who; // "my dad" → "your dad"
  const readBack = ` (that's the number I have for ${about.name}: is ${them} at the same number?)`;
  return { readBack, args: { [SHARED_NUMBER_OK]: true } };
}

/** Which of the owner's yeses confirmed call args carry. */
export function confirmedChanges(args: object): { replace: boolean; shared: boolean } {
  const marks = args as Record<symbol, unknown>;
  return {
    replace: marks[REPLACE_SAVED_NUMBER] === true,
    shared: marks[SHARED_NUMBER_OK] === true,
  };
}
