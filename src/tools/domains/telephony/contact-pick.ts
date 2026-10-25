/**
 * Which saved contact "call my mom" rings, for both the read-back (call-confirm.ts) and the
 * dial (call-on-behalf.ts), and the name a number given during a call is saved under.
 *
 * Phone-calls audit 2026-10-25, rows 1-2: the owner had two "Mom" rows, an older one with no
 * number listed first. The lookup took `results[0]`, saw no phone and said "no number saved",
 * every time, while the row with the number sat second. "my mom" also never matched.
 *
 * One score ranks every contact that has a number (strongest first):
 *   5  the name is exactly what was said ("Dr. Patel", "Sarah Lee")
 *   4  the name is exactly the relation asked for ("Dad" for "my dad" / "my father")
 *   3  the relationship field is that relation, or the notes say it is the OWNER's
 *      ("User's dad", "my dad"); "Dad's wife" or "Mom's mom" never count
 *   2  the name contains what was said ("Sarah" in "Sarah Lee"); a title like
 *      "Father Tom" or "Sister Mary" only ever matches here
 *   1  (not a relation word) the store's search matched another field, as before
 * One contact on top: ring it. Two or more on top with different numbers: ask which one.
 * The store is searched for the words as said as well as normalised, so punctuated names
 * ("O'Brien", "J.R.") are found exactly as before.
 *
 * @module tools/domains/telephony/contact-pick
 */

/** The name a relation is saved under, and the words people use for it. */
const ROLES: Record<string, readonly string[]> = {
  Mom: ['mom', 'mother', 'mum', 'mama', 'mommy', 'mummy'],
  Dad: ['dad', 'father', 'papa', 'daddy'],
  Sister: ['sister', 'sis'],
  Brother: ['brother', 'bro'],
};

/** What contact-pick needs from a stored contact (contact-relationship-service.ts). */
export interface PickRow {
  id?: string;
  name: string;
  phone?: string;
  notes?: string;
  relationship?: string;
}

/** The legacy store, passed in so this module reaches into no other context. */
export interface ContactStores<T extends PickRow> {
  search: (userId: string, query: string) => Promise<T[]>;
  list: (userId: string) => Promise<T[]>;
}

export type ContactPick<T> = { contact: T } | { choices: T[] } | null;

const words = (s: unknown): string[] =>
  typeof s === 'string'
    ? s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    : [];
const norm = (s: unknown): string => words(s).join(' ');
const digits = (s: unknown): string =>
  typeof s === 'string' ? s.replace(/\D/g, '').slice(-10) : '';

/** "My Mom" → "mom", "the dentist" → "dentist", "our sister" → "sister". */
export function normalizeContactQuery(query: string): string {
  return norm(query.replace(/^\s*(?:my|the|our)\s+/i, ''));
}

/** The saved name for a relation word ("mum" → "Mom"), or undefined when the query isn't one. */
export function roleOf(query: string): string | undefined {
  const q = normalizeContactQuery(query);
  return Object.keys(ROLES).find((role) => ROLES[role].includes(q));
}

/**
 * The notes name this contact as the owner's relation: "User's dad", "my dad", "his dad",
 * or just "mother". Never possessive about someone else: "Dad's wife", "Mom's mom", and
 * "Mom's cell; Dad uses it too" are not the dad.
 */
function notesNameOwnerRelation(notes: unknown, relation: readonly string[]): boolean {
  if (typeof notes !== 'string' || relation.length === 0) return false;
  if (relation.includes(norm(notes))) return true;
  const text = notes.toLowerCase().replace(/’/g, "'");
  return relation.some((w) =>
    new RegExp(`\\b(?:user'?s|owner'?s|my|his|her|their)\\s+${w}\\b(?!\\s*'s)`).test(text)
  );
}

/** How strongly this contact matches what was said: 5 (exact name) down to 0 (not them). */
export function contactScore(row: PickRow, said: string, fromSearch: boolean): number {
  const q = normalizeContactQuery(said);
  const role = roleOf(q);
  const name = norm(row.name);
  if (!norm(said)) return 0;
  if (name && (name === norm(said) || name === q)) return 5;
  const relation = role ? ROLES[role] : q ? [q] : [];
  if (role && relation.includes(name)) return 4;
  if (relation.includes(norm(row.relationship))) return 3;
  if (notesNameOwnerRelation(row.notes, relation)) return 3;
  if (role) return words(row.name).some((w) => relation.includes(w)) ? 2 : 0;
  const rawName = row.name.toLowerCase();
  if ((q && name.includes(q)) || rawName.includes(said.toLowerCase().trim())) return 2;
  return fromSearch ? 1 : 0;
}

/**
 * The contact to ring among these: never one without a number. The single strongest match,
 * or every contact tied on top (with different numbers) so the caller can say which one.
 */
export function pickContact<T extends PickRow>(
  rows: ReadonlyArray<{ row: T; fromSearch: boolean }>,
  said: string
): ContactPick<T> {
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
  return choices.length === 1 ? { contact: choices[0] } : { choices };
}

/**
 * Search the legacy store for what was said as said, normalised, and under the saved
 * relation name; for a relation ("my dad") every contact is scored, since notes like
 * "User's father" never contain the word "dad" that was said.
 */
export async function findContactToCall<T extends PickRow>(
  stores: ContactStores<T>,
  userId: string,
  said: string
): Promise<ContactPick<T>> {
  const q = normalizeContactQuery(said);
  const role = roleOf(q);
  const terms = [...new Set([said.trim(), q, role?.toLowerCase() ?? ''].filter(Boolean))];
  const searched = (await Promise.all(terms.map((t) => stores.search(userId, t)))).flat();
  // A failed full listing is no listing (getContacts degrades the same way); the search stands
  const all = role ? await stores.list(userId).catch((): T[] => []) : [];
  const seen = new Set<unknown>();
  const rows: Array<{ row: T; fromSearch: boolean }> = [];
  for (const [row, fromSearch] of [
    ...searched.map((r) => [r, true] as const),
    ...all.map((r) => [r, false] as const),
  ]) {
    const key = row.id ?? row;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ row, fromSearch });
  }
  return pickContact(rows, said);
}

/** "Nothing was dialed: … Sarah Lee or Sarah Kim?" Same names get the number's last 4 digits. */
export function whichContactReply(said: string, choices: readonly PickRow[]): string {
  const label = (c: PickRow) =>
    choices.filter((o) => norm(o.name) === norm(c.name)).length > 1
      ? `${c.name} (number ending ${digits(c.phone).slice(-4)})`
      : c.name;
  const names = choices.map(label);
  const list = `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  return (
    `Nothing was dialed: more than one contact matches "${said.trim()}". ` +
    `Ask the caller which one: ${list}?`
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
    .replace(/^\s*(?:my|the|our)\s+/i, '')
    .replace(/\s+at\s+.*$/i, '')
    .trim();
  if (!clean || /^(?:contact|them|him|her|someone)$/i.test(clean)) return null;
  return {
    name: clean.charAt(0).toUpperCase() + clean.slice(1),
    relationship: relationshipWord ? 'family' : 'other',
    notes: relationshipWord ? `User's ${relationshipWord}` : undefined,
  };
}
