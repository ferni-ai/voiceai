/**
 * Which saved contact a call rings (read-back in call-confirm.ts, dial in call-on-behalf.ts).
 * Default: as before (the store's first match for the words as said), with one fix (audit
 * 2026-10-25, rows 1-2): a phoneless first match yields to a same-named duplicate row with a
 * number. The owner's older, phoneless "Mom" row came first, so every call to Mom failed.
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
  resolveSameName,
  type ContactPick,
  type ContactStores,
  type PickRow,
} from './contact-pick-v2.js';

export type { ContactPick, ContactStores, PickRow } from './contact-pick-v2.js';

const hasPhone = (row: PickRow): boolean => digits(row.phone) !== '';

/** Default: the first match, as before; if it has no number, its same-named rows decide. */
export function pickFirstOrDuplicate<T extends PickRow>(results: readonly T[]): ContactPick<T> {
  const [first] = results;
  if (!first) return null;
  if (hasPhone(first)) return { contact: first };
  const name = norm(first.name);
  return name ? resolveSameName(results.filter((r) => norm(r.name) === name)) : null;
}

/** The contact to ring for what was said, a question to ask instead, or none. */
export async function findContactToCall<T extends PickRow>(
  stores: ContactStores<T>,
  userId: string,
  said: string
): Promise<ContactPick<T>> {
  if (flagOn('CONTACT_PICK_V2')) return findScored(stores, userId, said);
  return pickFirstOrDuplicate(await stores.search(userId, said));
}

/** The contact to call; for a question, the choice whose number was given, else the question. */
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

/** How a number given in a call is saved: as before, or (CONTACT_PICK_V2) as "Dad", or not. */
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
