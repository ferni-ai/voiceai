/**
 * What a new contact is made of, from a POST /api/contacts body.
 *
 * The add-person form sends a birthday and how you met, and the route dropped both: it
 * built the contact from a fixed list of fields that had neither. The birthday is now an
 * important date, where the nudges and the agent's date reminders read it, and how you
 * met is kept as typed.
 */

import type { ContactRelationship } from '../services/contacts/contact-relationship-service.js';

type NewContact = Partial<ContactRelationship> & { name: string; contactId: string };
type ImportantDate = NonNullable<ContactRelationship['importantDates']>[number];

/** MM-DD, or YYYY-MM-DD as a date input sends it */
const DATE = /^(\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/;

/** The contact to create, or the reason the body can't be one (a 400) */
export function newContactFrom(
  body: Record<string, unknown>,
  now: number = Date.now()
): NewContact | { error: string } {
  const text = (key: string): string | undefined => {
    const value = body[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const name = text('name');
  if (!name) return { error: 'Name is required' };
  const birthday = text('birthday');
  if (birthday && !DATE.test(birthday)) {
    return { error: 'Birthday must be in MM-DD or YYYY-MM-DD format' };
  }

  const email = text('email');
  const phone = text('phone');
  const dates = Array.isArray(body.importantDates) ? (body.importantDates as ImportantDate[]) : [];
  const hasBirthday = dates.some((d) => d.type === 'birthday');
  return {
    name,
    contactId: email || phone || `manual_${now}`,
    email,
    phone,
    relationship: text('relationship') as ContactRelationship['relationship'],
    notes: text('notes'),
    howWeMet: text('howWeMet'),
    importantDates:
      birthday && !hasBirthday ? [...dates, { date: birthday, type: 'birthday' }] : dates,
  };
}
