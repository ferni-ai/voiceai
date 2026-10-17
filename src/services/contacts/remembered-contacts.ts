/**
 * Remembered Contacts
 *
 * A contact with a memorial date is someone the user has lost. Ferni never
 * nudges the user to call, text, check in on or send anything to that person,
 * and never messages their old number. Their memorial date is a day to
 * remember them together, not an outreach occasion.
 *
 * A memorial date is one marker. The other is the user's own "in memory" mark
 * (in-memory.ts, behind CONTACT_IN_MEMORY). The richer deceased detection
 * (intelligence/triggers relationship profile) sits above this layer and can't
 * be imported here.
 *
 * @module services/contacts/remembered-contacts
 */

import { isInMemory, passingDate, type InMemory } from './in-memory.js';

export type { InMemory };

interface DatedContact {
  importantDates?: ReadonlyArray<{ type: string }>;
  inMemory?: InMemory;
}

type RememberedDate = NonNullable<ReturnType<typeof passingDate>>;

/** Why a send to someone who has died is skipped */
export const REMEMBERED_SKIP_REASON = 'They have passed away, so Ferni does not message them';

/** True when the contact is someone the user has lost (a memorial date, or marked in memory) */
export function isRememberedContact(contact: DatedContact | null | undefined): boolean {
  return !!contact?.importantDates?.some((d) => d.type === 'memorial') || isInMemory(contact);
}

/**
 * The dates worth a nudge for this contact. For someone who has died only the
 * memorial date counts, plus the anniversary of the day they passed when the
 * user gave it: their birthday or anniversary is never a "send them something"
 * moment.
 *
 * `remember` is for the agent's context rather than a nudge: someone marked in
 * memory keeps their birthday there, as a day to remember them.
 */
export function datesToNudge<T extends { type: string; date: string }>(
  contact: { importantDates?: T[]; inMemory?: InMemory },
  purpose: 'nudge' | 'remember' = 'nudge'
): Array<T | RememberedDate> {
  const dates = contact.importantDates ?? [];
  if (!isRememberedContact(contact)) return dates;
  const keep =
    purpose === 'remember' && isInMemory(contact) ? ['memorial', 'birthday'] : ['memorial'];
  const kept: Array<T | RememberedDate> = dates.filter((d) => keep.includes(d.type));
  const passing = passingDate(contact);
  const sameDay = (d: { date: string }): boolean => d.date.slice(-5) === passing?.date.slice(-5);
  if (passing && !kept.some((d) => d.type === 'memorial' && sameDay(d))) kept.push(passing);
  return kept;
}

/** What Ferni offers as a memorial date nears: remembering together, never reaching out */
export function memorialSuggestion(contactName: string, daysUntil?: number): string {
  if (daysUntil === 0) {
    return `Today is ${contactName}'s anniversary. Would you like to talk about them, or should I just keep it in mind with you?`;
  }
  return `${contactName}'s anniversary is coming up. Would you like to talk about them, or should I just keep it in mind with you?`;
}
