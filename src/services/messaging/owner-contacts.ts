/**
 * Whether a number belongs to someone the owner knows: one of their saved contacts
 * (user_contacts) or a person they told Ferni about (contact_relationships). The consent
 * ask may go only to such a number, never to any number an owner types in.
 *
 * @module services/messaging/owner-contacts
 */
import { toE164 } from '../outreach/checkin-replies.js';

const same = (key: string, phone: unknown): boolean =>
  typeof phone === 'string' && toE164(phone) === key;

/** True when `phone` is in the owner's contacts or relationships. Unreadable stores: false. */
export async function ownerKnowsNumber(ownerUid: string, phone: string): Promise<boolean> {
  const key = toE164(phone);
  if (!key || !ownerUid) return false;
  try {
    const { loadUserContacts } = await import('../identity/contacts/contacts-management.js');
    const saved = await loadUserContacts(ownerUid);
    if (saved.ok && saved.contacts.some((c) => c.phones.some((p) => same(key, p.number)))) {
      return true;
    }
    const { loadContacts } = await import('../contacts/contact-relationship-service.js');
    const told = await loadContacts(ownerUid);
    return told.ok && told.contacts.some((c) => same(key, c.phone));
  } catch {
    return false;
  }
}
