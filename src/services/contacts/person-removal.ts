/**
 * Removing someone from "People You've Told Me About", from every store that holds them.
 *
 * The panel's Remove button sent DELETE /api/contacts/:id, a route that didn't exist, so
 * nobody could ever be removed. A person can live in two stores: `contact_relationships`
 * (added in the panel, or synced there by data capture) and `user_contacts` (saved by the
 * voice agent), linked by the relationship's `contactId`. Removing them deletes both, and
 * the interactions logged with them, so the agent's next read no longer has them.
 *
 * @module services/contacts/person-removal
 */

import type { Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { deleteContact, getUserContacts } from '../identity/contacts/contacts-management.js';
import {
  clearCache,
  forgetContact,
  getContact,
  type ContactRelationship,
} from './contact-relationship-service.js';
import { fromSavedContact, samePerson } from './people-list.js';
import { getFirestoreDatabase } from '../../config/environment.js';

const log = createLogger({ module: 'person-removal' });

let db: Promise<Firestore> | null = null;

/** The same database the two contact services use */
function contactsDb(): Promise<Firestore> {
  db ??= import('@google-cloud/firestore').then(
    ({ Firestore }) =>
      new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
        databaseId: getFirestoreDatabase(),
      })
  );
  return db;
}

export interface Removal {
  /** contact_relationships docs deleted */
  relationships: number;
  /** user_contacts docs deleted */
  saved: number;
  /** contact_interactions docs deleted */
  interactions: number;
}

/**
 * Remove this user's person by id, contact id or email. Null when they have nobody by
 * that identifier, so another user's contact is never touched.
 */
export async function removePerson(userId: string, identifier: string): Promise<Removal | null> {
  const kept = await getContact(userId, identifier);
  const saved = (await getUserContacts(userId)).filter(
    (c) => c.id === identifier || (kept !== null && samePerson(kept, fromSavedContact(c)))
  );
  if (!kept && saved.length === 0) return null;

  const firestore = await contactsDb();
  const contactIds = [...new Set([identifier, kept?.contactId, ...saved.map((c) => c.id)])].filter(
    (id): id is string => !!id
  );
  const interactions = contactIds.length
    ? await firestore
        .collection('contact_interactions')
        .where('userId', '==', userId)
        .where('contactId', 'in', contactIds.slice(0, 30))
        .get()
    : null;

  const refs = [
    ...(kept ? [firestore.collection('contact_relationships').doc(kept.id)] : []),
    ...saved.map((c) => firestore.collection('user_contacts').doc(c.id)),
    ...(interactions?.docs.map((d) => d.ref) ?? []),
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = firestore.batch();
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
    // eslint-disable-next-line no-await-in-loop -- batches commit one after another
    await batch.commit();
  }

  // This process's caches and the semantic index forget them too
  if (kept) forgetContact(userId, kept);
  else clearCache(userId);
  for (const contact of saved) deleteContact(contact.id);

  const removal = {
    relationships: kept ? 1 : 0,
    saved: saved.length,
    interactions: interactions?.size ?? 0,
  };
  log.info({ userId, ...removal }, 'Person removed');
  return removal;
}
