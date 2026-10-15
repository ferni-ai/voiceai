/**
 * A panel edit to someone the voice agent saved goes back to `user_contacts`.
 *
 * The panel lists people from both contact stores (people-list.ts), but
 * PUT /api/contacts/:id only knew `contact_relationships`, so editing anyone added in a
 * call answered 404. The edit is saved where the agent's contact tools read it
 * (findMyContact, calling, texting), so the correction is what Ferni uses next call.
 */

import {
  getUserContacts,
  normalizePhone,
  updateContact,
  type Contact,
} from '../identity/contacts/contacts-management.js';
import type { ContactRelationship } from './contact-relationship-service.js';
import { fromSavedContact, relationshipGroup } from './people-list.js';

/** The edits as user_contacts fields. An emptied field is null, so the merge-save clears it */
function toSavedFields(contact: Contact, edits: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(edits)) {
    const text = typeof value === 'string' ? value : undefined;
    if (key === 'name') {
      fields.displayName = text;
    } else if (key === 'phone') {
      const [, ...others] = contact.phones;
      const type = contact.phones[0]?.type ?? 'mobile';
      fields.phones = text
        ? [{ number: normalizePhone(text), type, primary: true }, ...others]
        : others;
    } else if (key === 'email') {
      const [, ...others] = contact.emails;
      const type = contact.emails[0]?.type ?? 'personal';
      fields.emails = text
        ? [{ address: text.toLowerCase(), type, primary: true }, ...others]
        : others;
    } else if (key === 'relationship') {
      // The panel shows a group ("family"); keep the word Ferni heard ("mother") unless it changed
      if (value !== relationshipGroup(contact.relationship)) fields.relationship = value ?? null;
    } else {
      fields[key] = value ?? null;
    }
  }
  return fields;
}

/** The edited person in the panel's shape, or null when this user has no saved contact by that id */
export async function editSavedContact(
  userId: string,
  contactId: string,
  edits: Record<string, unknown>
): Promise<ContactRelationship | null> {
  const contact = (await getUserContacts(userId)).find((c) => c.id === contactId);
  if (!contact) return null;
  const saved = updateContact(contactId, toSavedFields(contact, edits) as Partial<Contact>);
  return saved ? fromSavedContact(saved) : null;
}
