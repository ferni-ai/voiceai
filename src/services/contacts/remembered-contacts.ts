/**
 * Remembered Contacts
 *
 * A contact with a memorial date is someone the user has lost. Ferni never
 * nudges the user to call, text, check in on or send anything to that person,
 * and never messages their old number. Their memorial date is a day to
 * remember them together, not an outreach occasion.
 *
 * The richer deceased detection (intelligence/triggers relationship profile)
 * sits above this layer and can't be imported here.
 *
 * @module services/contacts/remembered-contacts
 */

interface DatedContact {
  importantDates?: ReadonlyArray<{ type: string }>;
}

/** Why a send to someone who has died is skipped */
export const REMEMBERED_SKIP_REASON = 'They have passed away, so Ferni does not message them';

/** True when the contact is someone the user has lost (a memorial date) */
export function isRememberedContact(contact: DatedContact | null | undefined): boolean {
  return !!contact?.importantDates?.some((d) => d.type === 'memorial');
}

/**
 * The dates worth a nudge for this contact. For someone who has died only the
 * memorial date counts: their birthday or anniversary is never a "send them
 * something" moment.
 */
export function datesToNudge<T extends { type: string; date: string }>(contact: {
  importantDates?: T[];
}): T[] {
  const dates = contact.importantDates ?? [];
  if (!isRememberedContact(contact)) return dates;
  return dates.filter((d) => d.type === 'memorial');
}

/** What Ferni offers as a memorial date nears: remembering together, never reaching out */
export function memorialSuggestion(contactName: string, daysUntil?: number): string {
  if (daysUntil === 0) {
    return `Today is ${contactName}'s anniversary. Would you like to talk about them, or should I just keep it in mind with you?`;
  }
  return `${contactName}'s anniversary is coming up. Would you like to talk about them, or should I just keep it in mind with you?`;
}
