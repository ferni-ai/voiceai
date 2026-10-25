/**
 * Which saved contact a call rings, for both the read-back (call-confirm.ts) and the dial
 * (call-on-behalf.ts), and the name a number given during a call is saved under.
 *
 * Default: exactly as before (the store's search for the words as said, first match),
 * with one fix (phone-calls audit 2026-10-25, rows 1-2): when that first match has no
 * number and a later match is the same contact name WITH one (a duplicate row), ring the
 * duplicate instead of saying "no number saved". The owner had two "Mom" rows, the older
 * phoneless one stored first, so every call to Mom failed.
 * CONTACT_PICK_V2 on: the scored picker (contact-pick-v2.ts).
 *
 * @module tools/domains/telephony/contact-pick
 */

import { flagOn } from '../../../config/env-flag.js';
import {
  contactSaveFields,
  digits,
  findScored,
  norm,
  type ContactPick,
  type ContactStores,
  type PickRow,
} from './contact-pick-v2.js';

export type { ContactPick, ContactStores, PickRow } from './contact-pick-v2.js';

const hasPhone = (row: PickRow): boolean => digits(row.phone) !== '';

/**
 * The default path: the first match, or (when it has no number) the first later match
 * with the same full name and a number. Anything else is as before: null.
 */
export function pickFirstOrDuplicate<T extends PickRow>(results: readonly T[]): T | null {
  const [first] = results;
  if (!first) return null;
  if (hasPhone(first)) return first;
  const name = norm(first.name);
  return (name && results.find((r) => hasPhone(r) && norm(r.name) === name)) || null;
}

/** The contact to ring for what was said, a question to ask instead, or none. */
export async function findContactToCall<T extends PickRow>(
  stores: ContactStores<T>,
  userId: string,
  said: string
): Promise<ContactPick<T>> {
  if (flagOn('CONTACT_PICK_V2')) return findScored(stores, userId, said);
  const contact = pickFirstOrDuplicate(await stores.search(userId, said));
  return contact ? { contact } : null;
}

/**
 * A lookup's answer for the call: the one contact; when the caller must choose, the one
 * whose number they gave, or the question to ask (dial nothing); null for none, or for a
 * number none of them has (a new contact).
 */
export function pickFromTie<T extends PickRow>(
  found: T | { choices: readonly T[]; ask: string } | null,
  phoneNumber?: string
): T | string | null {
  if (!found || !('choices' in found)) return found;
  const given = digits(phoneNumber);
  const hit = given ? found.choices.find((c) => digits(c.phone) === given) : undefined;
  if (hit) return hit;
  return phoneNumber ? null : found.ask;
}

/**
 * How a number given during a call is saved. Default: as before (the words said, minus
 * "my "). CONTACT_PICK_V2: under the relation's name ("Dad" for "my father"); a request
 * naming no one ("them", "contact") saves nothing (null).
 */
export function saveFieldsFor(
  contactQuery: string,
  relationshipWord: string | undefined
): { name: string; relationship: 'family' | 'other'; notes?: string } | null {
  if (flagOn('CONTACT_PICK_V2')) return contactSaveFields(contactQuery, relationshipWord);
  const clean = contactQuery
    .replace(/^(my\s+)/i, '')
    .replace(/\s+at\s+.*$/i, '')
    .trim();
  return {
    name: clean.charAt(0).toUpperCase() + clean.slice(1),
    relationship: relationshipWord ? 'family' : 'other',
    notes: relationshipWord ? `User's ${relationshipWord}` : undefined,
  };
}
