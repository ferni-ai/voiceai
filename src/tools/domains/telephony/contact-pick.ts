/**
 * Which saved contact "call my mom" rings, for both the read-back (call-confirm.ts) and the
 * dial (call-on-behalf.ts), and the name a number given during a call is saved under.
 *
 * Phone-calls audit 2026-10-25, rows 1-2: the owner had two "Mom" rows, an older one with no
 * number listed first. The lookup took `results[0]`, saw no phone and said "no number saved",
 * every time, while the row with the number sat second. "my mom" also never matched (no "my "
 * strip), and the number he then gave was saved to the second row, so nothing changed.
 *
 * @module tools/domains/telephony/contact-pick
 */

import { flagOn } from '../../../config/env-flag.js';
import type { ContactRelationship } from '../../../services/contacts/contact-relationship-service.js';

/** The name a role is saved under, and the words people use for it. */
const ROLES: Record<string, readonly string[]> = {
  Mom: ['mom', 'mother', 'mum', 'mama', 'mommy', 'mummy'],
  Dad: ['dad', 'father', 'papa', 'daddy'],
  Sister: ['sister', 'sis'],
  Brother: ['brother', 'bro'],
};

const words = (s: unknown): string[] =>
  typeof s === 'string'
    ? s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    : [];

/** "My Mom" → "mom", "the dentist" → "dentist", "our sister" → "sister". */
export function normalizeContactQuery(query: string): string {
  return words(query.replace(/^\s*(?:my|the|our)\s+/i, '')).join(' ');
}

/** The saved name for a role word ("mum" → "Mom"), or undefined when the query isn't one. */
export function roleOf(query: string): string | undefined {
  const q = normalizeContactQuery(query);
  return Object.keys(ROLES).find((role) => ROLES[role].includes(q));
}

type Row = Pick<ContactRelationship, 'name' | 'phone' | 'notes'> & {
  relationship?: string;
  updatedAt?: unknown;
};

const hasPhone = (row: Row): boolean => typeof row.phone === 'string' && row.phone.trim() !== '';

/** 2 = exact name or relationship match, 1 = the search's own looser match, 0 = not this person. */
function matchStrength(row: Row, query: string, role: string | undefined): number {
  const name = words(row.name).join(' ');
  if (!role) return name === query ? 2 : 1;
  const synonyms = ROLES[role];
  if (synonyms.includes(name)) return 2;
  // "User's mom" in the notes, or "mother" as the relationship, says who this is
  if ([...words(row.notes), ...words(row.relationship)].some((w) => synonyms.includes(w))) return 2;
  if (words(row.name).some((w) => synonyms.includes(w))) return 1;
  // A role asked for and not this one: "dad" never rings a row that only says "mom"
  return 0;
}

const millis = (v: unknown): number => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Date.parse(v) || 0;
  const toDate = (v as { toDate?: () => Date } | null)?.toDate;
  return typeof toDate === 'function' ? toDate.call(v).getTime() : 0;
};

/**
 * The contact to ring for this query among the search's results: never one without a number.
 * CONTACT_PICK_V2 on: the strongest match, then the most recently updated. Off: the first
 * match with a number, in the order the search returned them.
 */
export function pickContact<T extends Row>(rows: readonly T[], query: string): T | null {
  const q = normalizeContactQuery(query);
  const role = roleOf(q);
  const ranked = rows
    .map((row, i) => ({ row, i, score: matchStrength(row, q, role) }))
    .filter((c) => c.score > 0 && hasPhone(c.row));
  if (ranked.length === 0) return null;
  if (flagOn('CONTACT_PICK_V2')) {
    ranked.sort(
      (a, b) => b.score - a.score || millis(b.row.updatedAt) - millis(a.row.updatedAt) || a.i - b.i
    );
  }
  return ranked[0].row;
}

/** What the legacy store holds for this query, also under the saved role word ("mum" finds "Mom"). */
export async function searchLegacyContacts(
  userId: string,
  query: string
): Promise<ContactRelationship[]> {
  const { searchContacts } =
    await import('../../../services/contacts/contact-relationship-service.js');
  const q = normalizeContactQuery(query) || query;
  const role = roleOf(q);
  const terms = [...new Set([q, ...(role ? [role.toLowerCase()] : [])])];
  const found = (await Promise.all(terms.map((t) => searchContacts(userId, t)))).flat();
  // Each row once, in the order the searches found them
  return found.filter((row, i) => found.findIndex((r) => (r.id ?? r) === (row.id ?? row)) === i);
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
