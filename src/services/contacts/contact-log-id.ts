/**
 * A contact id for a log line. Most contact ids are built from the contact's phone number or
 * email (`phone_<number>`, an address), and the contact never signed up: those log as their
 * kind only. A generated id (`contact_<time>_<random>`) logs as it is.
 *
 * @module services/contacts/contact-log-id
 */
export function contactIdForLog(contactId: string | undefined): string | undefined {
  if (!contactId) return contactId;
  if (contactId.includes('@')) return 'email';
  return /^(phone_)?\+?[\d\s().-]{7,}$/.test(contactId) ? 'phone' : contactId;
}
