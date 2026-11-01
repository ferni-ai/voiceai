/**
 * CONTACT_SAVE_ON_YES (default off): a number the owner gives in a call request is kept for the
 * next session. Prod 2026-10-26: the owner gave his dad's number at 18:47, the call was never
 * placed, so it was never saved; at 22:20 Ferni had no number for Doug.
 *
 * One resolver (resolveOwnerContact) answers both questions, the same way: which saved records
 * are the person asked for, and whose records already hold the number. It reads both stores:
 * entity_store people (contact.phone or attributes.phone) and contact_relationships rows.
 * "my dad", "Dad" and "dad's" are all dad; relation words are contact-pick-v2's (roleOf).
 *
 * The read-back (call-confirm.ts) says what a yes will change: "and change Dad's saved number
 * (now ending 0199) to this one", or "(that's the number I have for Mom: is Doug at the same
 * number?)". The save runs only on the owner's yes (ConfirmSpec.onYes, outreach-confirm.ts),
 * before the call is placed or deferred, never at the read-back:
 * - every record that is the person gets the number (entity contact.phone, and attributes.phone
 *   where set; contact_relationships phone), so there is one person afterwards, never a twin;
 * - nobody is the person: one contact_relationships row, named as asked ("my dad" → "Dad");
 * - another person's records are never written. If the number is theirs, only a yes to the
 *   "same number?" read-back about those same records saves this person, as their own contact.
 * Nothing is saved for an id that names no account, a session that isn't known, a caller
 * MINOR_CARE holds (by session or by user), or a number that isn't dialable, a +1 555 test
 * number or one of Ferni's own lines. Logs carry the user id and the outcome, never a number.
 *
 * @module tools/domains/telephony/owner-contact
 */

import { flagOn } from '../../../config/env-flag.js';
import { checkDialableNumber } from '../../../utils/dialable-number.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  isSyntheticPhone,
  isSyntheticUserId,
  namesNoAccount,
} from '../../../utils/synthetic-user.js';
import {
  contactSaveFields,
  contactScore,
  digits,
  normalizeContactQuery,
  roleOf,
} from './contact-pick-v2.js';
import type { ResolvedContact } from './types.js';

/** Read at call time: test files that mock safe-logger load this module through call-confirm. */
const log = () => getLogger();

type Store = typeof import('../../../services/contacts/index.js');
type ContactRow = Awaited<ReturnType<Store['getContacts']>>[number];

/** An entity_store person, as much of it as this module reads. */
interface PersonRecord {
  id: string;
  name: string;
  aliases: string[];
  relation?: string;
  contactPhone?: string;
  attrPhone?: string;
}

export interface OwnerContact {
  /** What was said, normalized: "my dad's" → "dad". */
  key: string;
  /** How the person is named: "Dad", a saved name, or the words as said. */
  name: string;
  entities: PersonRecord[];
  rows: ContactRow[];
  /** Someone else's records holding the number asked about. */
  others: { entities: PersonRecord[]; rows: ContactRow[] };
}

/** On the confirmed call args: the number the owner gave, and what its read-back asked. */
export const GIVEN = Symbol('owner-gave-number');
export interface GivenNumber {
  who: string;
  e164: string;
  /** The read-back said the person's saved number changes. */
  change: boolean;
  /** Ids of the other person's records the read-back asked "same number?" about. */
  shared: string[];
}

/** "my dad", "Dad", "dad's", "my dads'" → "dad"; "Doug at 801…" → "doug". */
export function ownerRefKey(who: string): string {
  const said = who.replace(/\s+at\s+.*$/i, '').replace(/['’]s\b|(?<=s)['’]/gi, '');
  const key = normalizeContactQuery(said);
  return !roleOf(key) && key.endsWith('s') && roleOf(key.slice(0, -1)) ? key.slice(0, -1) : key;
}

const sameKey = (name: string, key: string, role?: string): boolean => {
  const k = ownerRefKey(name);
  return k !== '' && (k === key || (role !== undefined && roleOf(k) === role));
};
const entityIs = (e: PersonRecord, key: string, role?: string): boolean =>
  [e.name, ...e.aliases, e.relation ?? ''].some((n) => sameKey(n, key, role));
const rowIs = (r: ContactRow, key: string, role?: string): boolean =>
  sameKey(r.name, key, role) || contactScore(r, key, false) >= 3;
const entityPhones = (e: PersonRecord): string[] =>
  [e.contactPhone, e.attrPhone].map(digits).filter(Boolean);
const rowPhones = (r: ContactRow): string[] => [digits(r.phone)].filter(Boolean);

async function readPeople(userId: string): Promise<PersonRecord[]> {
  const { isEntityStoreReady } = await import('../../../memory/index.js');
  if (!isEntityStoreReady()) return []; // as the lookup: no entity store, only the legacy rows
  const { listPersonEntities } = await import('../../../memory/index.js');
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  return (await listPersonEntities(userId)).map((e) => ({
    id: e.id,
    name: e.canonicalName ?? '',
    aliases: Array.isArray(e.aliases) ? e.aliases.filter((a) => typeof a === 'string') : [],
    relation: text(e.specificRelation),
    contactPhone: text(e.contact?.phone),
    attrPhone: text((e.attributes as { phone?: unknown } | undefined)?.phone),
  }));
}

async function readRows(userId: string): Promise<ContactRow[]> {
  const { loadContacts } = await import('../../../services/contacts/index.js');
  const load = await loadContacts(userId);
  if (!load.ok) throw new Error(`contacts unreadable: ${load.error}`); // never "nobody saved"
  return load.contacts;
}

/** Who `who` is in both stores, and (with a phone) whose records already hold that number. */
export async function resolveOwnerContact(
  userId: string,
  who: string,
  phone?: string
): Promise<OwnerContact> {
  const key = ownerRefKey(who);
  const role = roleOf(key);
  const [people, rows] = await Promise.all([readPeople(userId), readRows(userId)]);
  const entities = key ? people.filter((e) => entityIs(e, key, role)) : [];
  const mine = key ? rows.filter((r) => rowIs(r, key, role)) : [];
  const given = digits(phone);
  const holds = (nums: string[]) => given !== '' && nums.includes(given);
  const cap = key.charAt(0).toUpperCase() + key.slice(1);
  return {
    key,
    name: role ?? entities[0]?.name ?? mine[0]?.name ?? cap,
    entities,
    rows: mine,
    others: {
      entities: people.filter((e) => !entities.includes(e) && holds(entityPhones(e))),
      rows: rows.filter((r) => !mine.includes(r) && holds(rowPhones(r))),
    },
  };
}

const personPhones = (f: OwnerContact): string[] => [
  ...f.entities.flatMap(entityPhones),
  ...f.rows.flatMap(rowPhones),
];
/** The person to ring when every record that is them holds the same one number, else null. */
export function oneNumber(f: OwnerContact | null): ResolvedContact | null {
  if (!f || new Set(personPhones(f)).size !== 1) return null;
  const e = f.entities.find((x) => entityPhones(x).length > 0);
  const r = f.rows.find((x) => rowPhones(x).length > 0);
  const phone = e ? (e.contactPhone ?? e.attrPhone) : r?.phone;
  return phone ? { name: f.name, phone, relationship: e?.relation ?? r?.relationship } : null;
}

const otherIds = (f: OwnerContact): string[] => [
  ...f.others.entities.map((e) => `e:${e.id}`),
  ...f.others.rows.map((r) => `r:${r.id}`),
];

/** What the read-back adds for a number the owner gave, and what a yes to it allows. */
export function askAboutNumber(
  found: OwnerContact,
  who: string,
  e164: string
): { note: string; given: GivenNumber } {
  const differing = personPhones(found).filter((d) => d !== digits(e164));
  const nobody =
    found.entities.length + found.rows.length === 0 && !contactSaveFields(found.key, undefined);
  const other = nobody ? undefined : found.others.entities[0]?.name || found.others.rows[0]?.name;
  let note = '';
  // Two saved numbers for one name ("Sarah"): which one is unclear, so a yes saves nothing
  if (!roleOf(found.key) && new Set(personPhones(found)).size > 1)
    return { note, given: { who, e164, change: false, shared: [] } };
  if (differing.length > 0)
    note += `, and change ${found.name}'s saved number (now ending ${differing[0].slice(-4)}) to this one`;
  if (other)
    note += ` (that's the number I have for ${other}: is ${found.name} at the same number?)`;
  const change = differing.length > 0;
  return { note, given: { who, e164, change, shared: otherIds(found) } };
}

const ferniLine = (d: string): boolean =>
  [process.env.TWILIO_PHONE_NUMBER, process.env.SIP_TRUNK_NUMBER].some(
    (n) => digits(n) !== '' && digits(n) === d
  );

/** The number in E.164 if it may be saved: dialable, not a +1 555 test number, not Ferni's. */
export function savableNumber(phone: string): string | null {
  const number = checkDialableNumber(phone);
  if (!number.ok || isSyntheticPhone(number.e164) || ferniLine(digits(number.e164))) return null;
  return number.e164;
}

export type SaveOutcome =
  | 'off'
  | 'refused'
  | 'no-session'
  | 'held'
  | 'invalid'
  | 'shared-unasked'
  | 'change-unasked'
  | 'ambiguous'
  | 'unnamed'
  | 'same'
  | 'created'
  | 'updated'
  | 'failed';

async function createRow(userId: string, key: string, e164: string): Promise<SaveOutcome> {
  const fields = contactSaveFields(key, undefined); // "them" / "contact" name nobody
  if (!fields) return 'unnamed';
  const store = await import('../../../services/contacts/index.js');
  const base = `phone_${e164}`;
  // upsertContact merges by contactId: never onto another person's row with this number
  const taken = (await store.getContacts(userId)).some((r) => r.contactId === base);
  const contactId = taken ? `${base}_${key.replace(/\W+/g, '-')}_${Date.now().toString(36)}` : base;
  await store.upsertContact(userId, { ...fields, contactId, phone: e164 });
  return 'created';
}

async function save(userId: string, found: OwnerContact, given: GivenNumber, e164: string) {
  if (otherIds(found).some((id) => !given.shared.includes(id))) return 'shared-unasked';
  const d = digits(e164);
  const phones = personPhones(found);
  if (phones.some((p) => p !== d) && !given.change) return 'change-unasked';
  if (!roleOf(found.key) && new Set(phones).size > 1) return 'ambiguous'; // two Sarahs
  if (found.entities.length + found.rows.length === 0) return createRow(userId, found.key, e164);
  const staleEntities = found.entities.filter(
    (e) => digits(e.contactPhone) !== d || (e.attrPhone !== undefined && digits(e.attrPhone) !== d)
  );
  const staleRows = found.rows.filter((r) => digits(r.phone) !== d);
  if (staleEntities.length + staleRows.length === 0) return 'same';
  const { setPersonPhone } = await import('../../../memory/index.js');
  const store = await import('../../../services/contacts/index.js');
  for (const e of staleEntities)
    await setPersonPhone(userId, e.id, e164, e.attrPhone !== undefined); // eslint-disable-line no-await-in-loop -- few
  for (const r of staleRows) await store.upsertContact(userId, { ...r, phone: e164 }); // eslint-disable-line no-await-in-loop -- few
  return 'updated';
}

/** ConfirmSpec.onYes for calls: the owner said yes, so keep the number they gave. Never throws. */
export async function rememberOnYes(
  args: Record<string, unknown>,
  userId: string,
  sessionId: string | undefined
): Promise<SaveOutcome> {
  const given = (args as { [GIVEN]?: GivenNumber })[GIVEN];
  if (!flagOn('CONTACT_SAVE_ON_YES') || !given) return 'off';
  let outcome: SaveOutcome;
  if (namesNoAccount(userId) || isSyntheticUserId(userId)) outcome = 'refused';
  else if (!sessionId)
    outcome = 'no-session'; // the MINOR_CARE check needs it: fail closed
  else if (writeHeld(userId, sessionId)) outcome = 'held';
  else {
    const e164 = savableNumber(given.e164);
    try {
      outcome = e164
        ? await save(userId, await resolveOwnerContact(userId, given.who, e164), given, e164)
        : 'invalid';
    } catch (error) {
      log().warn({ userId, error: String(error) }, 'CONTACT_SAVE_ON_YES: save failed');
      outcome = 'failed';
    }
  }
  log().info({ userId, outcome }, '📇 CONTACT_SAVE_ON_YES');
  return outcome;
}
