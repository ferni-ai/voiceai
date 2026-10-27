/**
 * Who a number given for a call is for (contact-on-mention.ts): the person asked for, never a
 * contact for another relation. The store's "dad" search can return Mom (its family-alias
 * branch); a shared landline puts one number on two people. PR #2949 review: a call to Doug at
 * Mom's number wrote "Also called Doug" onto Mom, and a later number for Doug replaced Mom's.
 *
 * @module tools/domains/telephony/contact-person
 */

import { flagOn } from '../../../config/env-flag.js';
import { ROLES, contactScore, norm, notesNameOwnerRelation, roleOf } from './contact-pick-v2.js';
import type { ResolvedContact } from './types.js';

/** "my mom" → "mom", "the dentist" → "dentist": the relation word a query names, if any. */
export function relationWordOf(query: string): string | undefined {
  const q = query.toLowerCase();
  const family = 'mom mother dad father brother sister grandma grandpa aunt uncle cousin';
  const words = [...family.split(' '), ...'doctor dentist therapist lawyer accountant'.split(' ')];
  return words.find((w) => q.includes(w));
}

/** The relation a contact is for: its name ("Mom"), or the owner's relation in its notes. */
function roleOfContact(row: { name: string; notes?: string }): string | undefined {
  const byNotes = (role: string) => notesNameOwnerRelation(row.notes, ROLES[role]);
  return roleOf(row.name) ?? Object.keys(ROLES).find(byNotes);
}

/**
 * Whether a contact is the person asked for. A contact for another relation (Mom, asked for
 * dad or Doug) never is; one the owner named for them ("Also called Doug") always is. Otherwise
 * the lookup's own pick is, and any other row must match as contact-pick-v2.ts scores a name
 * (2) or a relation (3).
 */
export function isPersonAsked(
  row: { name: string; notes?: string; phone?: string },
  asked: string,
  fromLookup: boolean
): boolean {
  if (norm(row.notes).includes(norm(`also called ${asked}`))) return true;
  const rowRole = roleOfContact(row);
  if (rowRole && rowRole !== roleOf(asked)) return false;
  if (fromLookup) return true;
  const relation = Boolean(roleOf(asked)) || /^\s*(?:my|the|our)\s+/i.test(asked);
  return contactScore(row, asked, false) >= (relation ? 3 : 2);
}

/** "my dad, Doug" / "Doug, my dad": the relation and the name the owner tied to it, or null. */
export function tiedName(query: string): { role: string; name: string } | null {
  const words = query.split(/[\s,]+/).filter((w) => w && !/^(?:my|the|our)$/i.test(w));
  if (words.length !== 2) return null;
  const roles = words.map((w) => roleOf(w));
  const at = roles.findIndex(Boolean);
  if (at < 0 || roles.filter(Boolean).length !== 1) return null;
  const name = words[1 - at];
  return { role: roles[at] as string, name: name.charAt(0).toUpperCase() + name.slice(1) };
}

/** With a number given, the lookup picked someone else (Mom for "dad"): the call goes by the words. */
export function pickIsSomeoneElse(contact: ResolvedContact | null, contactQuery: string): boolean {
  if (!contact || !flagOn('CONTACT_SAVE_ON_MENTION')) return false;
  return !isPersonAsked(contact, tiedName(contactQuery)?.role ?? contactQuery, true);
}
