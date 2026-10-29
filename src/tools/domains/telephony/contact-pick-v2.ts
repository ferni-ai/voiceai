/**
 * CONTACT_PICK_V2 (default off; audit 2026-10-25 rows 1-2, #2848/#2884 reviews). Each contact
 * with a number scores: 5 exact name; 4 the name is the relation ("Dad" for "my father");
 * 3 the relationship field is the relation, or a whole note segment is the owner's ("User's
 * dad", "my dad", "dad"); 2 the name contains the words (titles: "Father Tom"); 1 (non-relation
 * queries) another field matched. A relation query never dials on 2 or below, a tie on top
 * asks which one, and same-named rows ring only when plausibly one person (resolveSameName).
 *
 * @module tools/domains/telephony/contact-pick-v2
 */

import { OWNER_LEAD, nameTokens, relationWords } from '../../../memory/index.js';

/** The name a relation is saved under, and the words people use for it (one map: person-key). */
const ROLES: Record<string, readonly string[]> = {
  Mom: relationWords('mother'),
  Dad: relationWords('father'),
  Sister: relationWords('sister'),
  Brother: relationWords('brother'),
};

/** What the picker needs from a stored contact (contact-relationship-service.ts). */
export interface PickRow {
  id?: string;
  name: string;
  phone?: string;
  notes?: string;
  relationship?: string;
}

/** One contact to ring, or a question for the caller (dial nothing), or none. */
export type ContactPick<T> = { contact: T } | { choices: T[]; ask: string } | null;

/** Letters, marks and digits in any script ("李明", "Ольга", "रेखा"), folded. */
export const words = (s: unknown): string[] => (typeof s === 'string' ? nameTokens(s) : []);
export const norm = (s: unknown): string => words(s).join(' ');
export const digits = (s: unknown): string =>
  typeof s === 'string' ? s.replace(/\D/g, '').slice(-10) : '';

/** "My Mom" → "mom", "the dentist" → "dentist", "our sister" → "sister". */
export function normalizeContactQuery(query: string): string {
  return norm(query.replace(OWNER_LEAD, ''));
}

/** The saved name for a relation word ("mum" → "Mom"), or undefined when the query isn't one. */
export function roleOf(query: string): string | undefined {
  const q = normalizeContactQuery(query);
  return Object.keys(ROLES).find((role) => ROLES[role].includes(q));
}

/** A whole note segment (; . , \n) is exactly "user's dad", "my dad" or "dad", no more. */
export function notesNameOwnerRelation(notes: unknown, relation: readonly string[]): boolean {
  if (typeof notes !== 'string' || relation.length === 0) return false;
  const text = notes.toLocaleLowerCase().replace(/’/g, "'");
  return text.split(/[;.,\n]/).some((segment) => {
    const words = segment.trim().replace(/\s+/g, ' ');
    const relationWord = words.replace(/^(?:(?:user|owner)'s|my) /, '');
    return relation.includes(relationWord);
  });
}

const lower = (s: unknown): string => (typeof s === 'string' ? s.trim().toLocaleLowerCase() : '');

/**
 * A phoneless row is plausibly the same-named row with a number: no notes and no relationship
 * ("other" is the store default), or the same relationship and notes equal or naming the same
 * owner relation ("mother" / "User's mom"). "old coworker" and "plumber" are two people.
 */
export function samePerson(phoneless: PickRow, phoned: PickRow): boolean {
  const rel = (r: PickRow) => (lower(r.relationship) === 'other' ? '' : lower(r.relationship));
  if (!lower(phoneless.notes) && !rel(phoneless)) return true;
  if (rel(phoneless) !== rel(phoned)) return false;
  if (lower(phoneless.notes) === lower(phoned.notes)) return true;
  return Object.values(ROLES).some(
    (r) => notesNameOwnerRelation(phoneless.notes, r) && notesNameOwnerRelation(phoned.notes, r)
  );
}

/**
 * Same-named rows, some without a number: ring the one number only if it is the only one and
 * every phoneless row is plausibly that person; else ask, by note and last 4 digits.
 */
export function resolveSameName<T extends PickRow>(group: readonly T[]): ContactPick<T> {
  const phoned = group.filter(
    (r, i) => digits(r.phone) && group.findIndex((o) => digits(o.phone) === digits(r.phone)) === i
  );
  if (phoned.length === 0) return null;
  const phoneless = group.filter((r) => !digits(r.phone));
  if (phoned.length === 1 && phoneless.every((r) => samePerson(r, phoned[0]))) {
    return { contact: phoned[0] };
  }
  const label = (r: PickRow) => {
    const end = digits(r.phone) ? `, ending ${digits(r.phone).slice(-4)}` : '';
    return r.notes?.trim() ? `the ${r.notes.trim()}${end}` : `the one${end || ' with no number'}`;
  };
  const options = [...phoned, ...phoneless].map(label);
  const [name, last] = [group[0].name, options.pop()];
  const ask = `Nothing was dialed: more than one contact is named ${name}. Ask the caller: "Which ${name}: ${options.join(', ')}, or ${last}?"`;
  return { choices: phoned, ask };
}

/** What was said, read once: the cleaned words, the relation (if any), and its words. */
function readQuery(said: string) {
  const q = normalizeContactQuery(said);
  const role = roleOf(q);
  const isRelation = Boolean(role) || (OWNER_LEAD.test(said) && q !== '');
  const relation: readonly string[] = role ? ROLES[role] : q ? [q] : [];
  return { q, role, isRelation, relation };
}

/** How strongly this contact matches what was said: 5 (exact name) down to 0 (not them). */
export function contactScore(row: PickRow, said: string, fromSearch: boolean): number {
  const { q, role, isRelation, relation } = readQuery(said);
  const name = norm(row.name);
  if (!norm(said)) return 0;
  if (name && (name === norm(said) || name === q)) return 5;
  if (isRelation && relation.includes(name)) return 4;
  // The relationship field counts only as a relation ("mother"), never a group ("friend")
  if (role && relation.includes(norm(row.relationship))) return 3;
  if (notesNameOwnerRelation(row.notes, relation)) return 3;
  if (role) return words(row.name).some((w) => relation.includes(w)) ? 2 : 0;
  const rawName = row.name.toLocaleLowerCase();
  if ((q && name.includes(q)) || rawName.includes(said.toLocaleLowerCase().trim())) return 2;
  return fromSearch && !isRelation ? 1 : 0;
}

/** "Sarah Lee or Sarah Kim"; same names get the number's last 4 digits. */
function listNames(choices: readonly PickRow[]): string {
  const label = (c: PickRow) =>
    choices.filter((o) => norm(o.name) === norm(c.name)).length > 1
      ? `${c.name} (number ending ${digits(c.phone).slice(-4)})`
      : c.name;
  const names = choices.map(label);
  const last = names.pop();
  return names.length ? `${names.join(', ')} or ${last}` : String(last);
}

/** Score every candidate with a number; ring the single strongest, else ask. */
export function pickScored<T extends PickRow>(
  rows: ReadonlyArray<{ row: T; fromSearch: boolean }>,
  said: string
): ContactPick<T> {
  const { role, isRelation, q } = readQuery(said);
  const scored = rows
    .filter(({ row }) => digits(row.phone) !== '')
    .map(({ row, fromSearch }) => ({ row, score: contactScore(row, said, fromSearch) }))
    .filter((c) => c.score > 0);
  if (scored.length === 0) return null;
  const top = Math.max(...scored.map((c) => c.score));
  // The same number twice is one person to call, not a choice
  const choices = scored
    .filter((c) => c.score === top)
    .map((c) => c.row)
    .filter((row, i, all) => all.findIndex((r) => digits(r.phone) === digits(row.phone)) === i);
  if (isRelation && top <= 2) {
    // A name that only contains "father" is not the owner's father: ask, never dial
    const who = `your ${role ? role.toLowerCase() : q}`;
    const ask = `Nothing was dialed: no saved contact is ${who}. Did you mean ${listNames(choices)}, or what's ${who}'s number? Ask the caller.`;
    return { choices, ask };
  }
  if (choices.length === 1) {
    // Same-named rows without a number: one person, or a question (resolveSameName)
    const group = rows.map((c) => c.row).filter((r) => norm(r.name) === norm(choices[0].name));
    return group.some((r) => !digits(r.phone)) ? resolveSameName(group) : { contact: choices[0] };
  }
  const ask = `Nothing was dialed: more than one contact matches "${said.trim()}". Ask the caller which one: ${listNames(choices)}?`;
  return { choices, ask };
}

/** The store, passed in so this module reaches into no other context. */
export interface ContactStores<T extends PickRow> {
  search: (userId: string, query: string) => Promise<T[]>;
  list: (userId: string) => Promise<T[]>;
}

/** Search as said ("O'Brien"), cleaned and as the relation name; a relation scores everyone. */
export async function findScored<T extends PickRow>(
  stores: ContactStores<T>,
  userId: string,
  said: string
): Promise<ContactPick<T>> {
  const { q, role, isRelation } = readQuery(said);
  const terms = [...new Set([said.trim(), q, role?.toLowerCase() ?? ''].filter(Boolean))];
  const searched = (await Promise.all(terms.map((t) => stores.search(userId, t)))).flat();
  const all = isRelation ? await stores.list(userId).catch((): T[] => []) : []; // as getContacts
  const rows = [
    ...searched.map((row) => ({ row, fromSearch: true })),
    ...all.map((row) => ({ row, fromSearch: false })),
  ];
  const key = (c: { row: T }) => c.row.id ?? c.row;
  return pickScored(
    rows.filter((c, i) => rows.findIndex((o) => key(o) === key(c)) === i),
    said
  );
}

/** A number given for "my dad" is saved as "Dad"; "them" / "contact" save nothing (null). */
export function contactSaveFields(
  contactQuery: string,
  relationshipWord: string | undefined
): { name: string; relationship: 'family' | 'other'; notes?: string } | null {
  const role = roleOf(contactQuery.replace(/\s+at\s+.*$/i, ''));
  if (role) return { name: role, relationship: 'family', notes: `User's ${role.toLowerCase()}` };
  const clean = contactQuery
    .replace(OWNER_LEAD, '')
    .replace(/\s+at\s+.*$/i, '')
    .trim();
  if (!clean || /^(?:contact|them|him|her|someone)$/i.test(clean)) return null;
  return {
    name: clean.charAt(0).toUpperCase() + clean.slice(1),
    relationship: relationshipWord ? 'family' : 'other',
    notes: relationshipWord ? `User's ${relationshipWord}` : undefined,
  };
}
