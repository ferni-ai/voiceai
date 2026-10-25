/**
 * CONTACT_PICK_V2 (default off; audit 2026-10-25 rows 1-2, #2848 reviews). Every contact
 * that has a number is scored (strongest first):
 *   5  the name is exactly what was said ("Dr. Patel", "李明")
 *   4  the name is the relation asked for ("Dad" for "my dad" / "my father")
 *   3  the relationship field is that relation, or a whole note segment is the OWNER's
 *      ("User's dad", "my dad", "dad"); never "her dad", "my dad-in-law", "not my dad"
 *   2  the name contains what was said ("Sarah" in "Sarah Lee"; a title, "Father Tom")
 *   1  (not a relation query) the store's search matched another field
 * A relation query ("mom", "my dad", "my dentist") never dials on 2 or below: it asks
 * ("Did you mean Father Tom, or what's your dad's number?"). Two or more contacts tied on
 * top with different numbers are never guessed between: the caller is asked which one.
 *
 * @module tools/domains/telephony/contact-pick-v2
 */

/** The name a relation is saved under, and the words people use for it. */
const ROLES: Record<string, readonly string[]> = {
  Mom: ['mom', 'mother', 'mum', 'mama', 'mommy', 'mummy'],
  Dad: ['dad', 'father', 'papa', 'daddy'],
  Sister: ['sister', 'sis'],
  Brother: ['brother', 'bro'],
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

/** Letters and digits in any script ("李明", "Ольга"), lowercased. */
export const words = (s: unknown): string[] =>
  typeof s === 'string' ? (s.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) : [];
export const norm = (s: unknown): string => words(s).join(' ');
export const digits = (s: unknown): string =>
  typeof s === 'string' ? s.replace(/\D/g, '').slice(-10) : '';

const OWNER_LEAD = /^\s*(?:my|the|our)\s+/i;

/** "My Mom" → "mom", "the dentist" → "dentist", "our sister" → "sister". */
export function normalizeContactQuery(query: string): string {
  return norm(query.replace(OWNER_LEAD, ''));
}

/** The saved name for a relation word ("mum" → "Mom"), or undefined when the query isn't one. */
export function roleOf(query: string): string | undefined {
  const q = normalizeContactQuery(query);
  return Object.keys(ROLES).find((role) => ROLES[role].includes(q));
}

/**
 * A whole note segment (split on ; . , and newlines) is exactly "user's dad", "owner's dad",
 * "my dad" or "dad". Never "my dad-in-law", "like my mom to me", "my dad trusts him".
 */
export function notesNameOwnerRelation(notes: unknown, relation: readonly string[]): boolean {
  if (typeof notes !== 'string' || relation.length === 0) return false;
  const segments = notes
    .toLocaleLowerCase()
    .replace(/’/g, "'")
    .split(/[;.,\n]/);
  return segments.some((segment) => {
    const words = segment.trim().replace(/\s+/g, ' ');
    const relationWord = words.replace(/^(?:(?:user|owner)'s|my) /, '');
    return relation.includes(relationWord);
  });
}

/**
 * Same-named rows are one person only when their notes don't conflict: the phoneless row's
 * notes are empty or equal. Two John Smiths, "old coworker" and "plumber", are two people.
 */
export function notesAgree(phoneless: PickRow, phoned: PickRow): boolean {
  const notes = (r: PickRow) => (r.notes ?? '').trim().toLocaleLowerCase();
  return notes(phoneless) === '' || notes(phoneless) === notes(phoned);
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
    // A same-named contact without a number whose notes say it is someone else: ask instead
    const [one] = choices;
    const other = rows.some(
      ({ row }) => !digits(row.phone) && norm(row.name) === norm(one.name) && !notesAgree(row, one)
    );
    return other ? null : { contact: one };
  }
  const ask = `Nothing was dialed: more than one contact matches "${said.trim()}". Ask the caller which one: ${listNames(choices)}?`;
  return { choices, ask };
}

/** The store, passed in so this module reaches into no other context. */
export interface ContactStores<T extends PickRow> {
  search: (userId: string, query: string) => Promise<T[]>;
  list: (userId: string) => Promise<T[]>;
}

/**
 * Search for the words as said (punctuated names: "O'Brien", "J.R."), cleaned, and under
 * the relation's saved name; for a relation every contact is scored, since notes like
 * "User's father" never contain the word "dad" that was said.
 */
export async function findScored<T extends PickRow>(
  stores: ContactStores<T>,
  userId: string,
  said: string
): Promise<ContactPick<T>> {
  const { q, role, isRelation } = readQuery(said);
  const terms = [...new Set([said.trim(), q, role?.toLowerCase() ?? ''].filter(Boolean))];
  const searched = (await Promise.all(terms.map((t) => stores.search(userId, t)))).flat();
  // A failed full listing is no listing (getContacts degrades the same way); the search stands
  const all = isRelation ? await stores.list(userId).catch((): T[] => []) : [];
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

/**
 * How a number given for "my dad" is saved: under "Dad", never a placeholder like "Contact".
 * Null when the request names no one to save it under.
 */
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
