/**
 * The two entity-store reads and writes telephony needs for a person's phone
 * (tools/domains/telephony/owner-contact.ts), kept out of storage.ts, which may not grow.
 *
 * @module memory/entity-store/person-phone
 */

import { invalidateEntity, invalidateUserCache } from './entity-cache.js';
import type { Entity } from './types.js';

let db: FirebaseFirestore.Firestore | null = null;

/** entity_store/{userId}/entities, on the same project and database as storage.ts. */
async function entities(userId: string) {
  if (!db) {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
  }
  return db.collection('entity_store').doc(userId).collection('entities');
}

/**
 * Every person, unordered: an orderBy drops documents missing that field, and the migration
 * scripts wrote people without lastMentioned or salience.
 */
export async function listPersonEntities(userId: string, limit = 500): Promise<Entity[]> {
  const snapshot = await (await entities(userId)).where('type', '==', 'person').limit(limit).get();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })) as Entity[];
}

/** Set a person's phone in contact.phone (what telephony reads) and attributes.phone if set. */
export async function setPersonPhone(
  userId: string,
  entityId: string,
  e164: string,
  inAttributes: boolean
): Promise<void> {
  const fields = { 'contact.phone': e164, ...(inAttributes && { 'attributes.phone': e164 }) };
  const ref = (await entities(userId)).doc(entityId);
  await ref.update({ ...fields, updatedAt: new Date() }); // every value set: nothing to clean
  invalidateEntity(userId, entityId);
  invalidateUserCache(userId);
}
