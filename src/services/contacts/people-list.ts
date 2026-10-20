/**
 * Everyone in "People You've Told Me About", from both contact stores.
 *
 * The panel read only `contact_relationships` (people added in the panel, and people
 * data capture synced there). The voice agent's addContact tool saves to
 * `user_contacts` and nowhere else, so someone you told Ferni about in a call never
 * showed up in the panel. This reads both stores and returns one list: a person in
 * both appears once, with what was entered in the panel kept as it is and only the
 * gaps filled from the saved contact.
 *
 * @module services/contacts/people-list
 */

import { loadUserContacts, type Contact } from '../identity/contacts/contacts-management.js';
import { loadContacts, type ContactRelationship } from './contact-relationship-service.js';
import { RELATIONSHIP_ALIASES } from './relationship-aliases.js';

type RelationshipGroup = NonNullable<ContactRelationship['relationship']>;

const GROUPS: readonly RelationshipGroup[] = [
  'family',
  'friend',
  'colleague',
  'acquaintance',
  'professional',
  'other',
];

/**
 * The panel group for a free-text relationship ("mother", "my best friend", "Doctor").
 * Whole words only, so "unfriendly" is not a friend.
 */
export function relationshipGroup(text: string | undefined): RelationshipGroup {
  const words = (text ?? '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  for (const word of words) {
    const group = GROUPS.find((g) => g === word || `${g}s` === word);
    if (group) return group;
    for (const [alias, list] of Object.entries(RELATIONSHIP_ALIASES)) {
      if (list.includes(word)) return alias as RelationshipGroup;
    }
  }
  return 'other';
}

/** Panel-only fields an edit can add to a saved contact (saved-contact-edits.ts) */
const PANEL_FIELDS = [
  'howWeMet',
  'interests',
  'sensitiveTopics',
  'preferredChannel',
  'bestTimeToReach',
  'photo',
  'inMemory',
];

/** A contact the voice agent saved, in the shape the panel reads */
export function fromSavedContact(contact: Contact): ContactRelationship {
  const createdAt = new Date(contact.createdAt);
  const stored = contact as unknown as Record<string, unknown>;
  const panelFields = Object.fromEntries(
    PANEL_FIELDS.filter((key) => stored[key] != null).map((key) => [key, stored[key]])
  );
  return {
    ...panelFields,
    id: contact.id,
    userId: contact.userId,
    contactId: contact.id,
    name: contact.displayName,
    email: contact.emails?.[0]?.address,
    phone: contact.phones?.[0]?.number,
    relationship: relationshipGroup(contact.relationship),
    notes: contact.notes || contact.nicknames?.join(', ') || undefined,
    importantDates: contact.birthday ? [{ date: contact.birthday, type: 'birthday' }] : [],
    // Nothing has been recorded with this person yet: no interactions, no score, and no
    // "last time you talked" unless the contact really carries one
    firstInteraction: createdAt,
    lastInteraction: contact.lastContactedAt ? new Date(contact.lastContactedAt) : undefined,
    interactionCount: 0,
    topics: [],
    recentContext: [],
    createdAt,
    updatedAt: new Date(contact.updatedAt),
  };
}

const digits = (phone: string | undefined): string => (phone ?? '').replace(/\D/g, '').slice(-10);

/** The panel's copy and a saved contact are one person: id link, then email, phone or name */
export function samePerson(kept: ContactRelationship, saved: ContactRelationship): boolean {
  if (kept.contactId === saved.id) return true; // data capture links them by id
  if (kept.email && saved.email && kept.email.toLowerCase() === saved.email.toLowerCase()) {
    return true;
  }
  if (digits(kept.phone).length >= 7 && digits(kept.phone) === digits(saved.phone)) return true;
  return kept.name.trim().toLowerCase() === saved.name.trim().toLowerCase();
}

/** The panel's copy wins; the saved contact only fills what the panel left empty */
function fillGaps(kept: ContactRelationship, saved: ContactRelationship): ContactRelationship {
  const hasBirthday = kept.importantDates?.some((d) => d.type === 'birthday');
  return {
    ...kept,
    email: kept.email ?? saved.email,
    phone: kept.phone ?? saved.phone,
    notes: kept.notes ?? saved.notes,
    importantDates: hasBirthday
      ? kept.importantDates
      : [...(kept.importantDates ?? []), ...(saved.importantDates ?? [])],
  };
}

/** A contact store couldn't be read, so the list is unknown: never answer it as empty */
export class PeopleUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Contacts could not be read: ${reason}`);
    this.name = 'PeopleUnavailableError';
  }
}

/**
 * Everyone this person has told Ferni about, from both stores, each person once. Throws
 * PeopleUnavailableError when either store couldn't be read.
 */
export async function listPeople(userId: string): Promise<ContactRelationship[]> {
  const [kept, saved] = await Promise.all([loadContacts(userId), loadUserContacts(userId)]);
  if (!kept.ok) throw new PeopleUnavailableError(kept.error);
  if (!saved.ok) throw new PeopleUnavailableError(saved.error);
  const people = kept.contacts.map((person) => ({ ...person }));
  const fromCalls: ContactRelationship[] = [];
  for (const contact of saved.contacts) {
    const person = fromSavedContact(contact);
    const index = people.findIndex((p) => samePerson(p, person));
    if (index >= 0) people[index] = fillGaps(people[index], person);
    else fromCalls.push(person);
  }
  fromCalls.sort((a, b) => a.name.localeCompare(b.name));
  return [...people, ...fromCalls];
}

/** One person by id, contact id or email, from the same merged list the panel shows */
export async function findPerson(
  userId: string,
  identifier: string
): Promise<ContactRelationship | null> {
  const key = identifier.toLowerCase();
  const people = await listPeople(userId);
  return (
    people.find(
      (p) => p.id === identifier || p.contactId === identifier || p.email?.toLowerCase() === key
    ) ?? null
  );
}
