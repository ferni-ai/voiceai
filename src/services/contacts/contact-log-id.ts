/**
 * A contact id for a log line: its kind, never the id itself. Contact ids are often built from
 * the contact's number, address or name (`phone_<number>`, an email, a slug), and the contact
 * never signed up. So this fails closed: it only ever returns one of three constants.
 *
 * @module services/contacts/contact-log-id
 */
export type ContactIdKind = 'phone' | 'email' | 'contact';

export function contactIdForLog(contactId: string | undefined): ContactIdKind | undefined {
  if (!contactId) return undefined;
  if (contactId.includes('@')) return 'email';
  if (contactId.startsWith('phone_') || /^\+?[\d\s().-]{7,}$/.test(contactId)) return 'phone';
  return 'contact'; // a name-based, generated or any other id
}
