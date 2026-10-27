/**
 * The entity-store half of telephony's contact lookup (integration.ts findContactForTelephony)
 * and of changing a saved number (telephony/contact-on-mention.ts).
 *
 * A person's number lives in one of two shapes: `contact.phone` (written by the migration
 * scripts) or `attributes.phone` (written by capture, entity-resolver.ts). The lookup read only
 * `contact.phone`, so numbers captured in conversation were never found by a call. With
 * CONTACT_SAVE_ON_MENTION on it reads both, and a changed number is written to both, so the
 * next lookup returns the new one (PR #2949 review: the old number kept winning).
 *
 * @module memory/entity-store/telephony-contact
 */

import { flagOn } from '../../config/env-flag.js';
import type { Entity } from './types.js';

/** What telephony needs from a person entity. */
export interface TelephonyContact {
  entityId: string;
  name: string;
  phone: string;
  relationship?: string;
}

/** The number a person entity holds, in either shape (attributes only with the flag on). */
export function entityPhone(entity: Entity): string | undefined {
  const attributes = entity.attributes as { phone?: string } | undefined;
  const captured = flagOn('CONTACT_SAVE_ON_MENTION') ? attributes?.phone : undefined;
  return entity.contact?.phone || captured || undefined;
}

/** The person this query names, with a number, or null. */
export async function lookUpTelephonyContact(
  userId: string,
  query: string
): Promise<TelephonyContact | null> {
  const { findEntityByAlias, searchEntities } = await import('./storage.js');
  const entity =
    (await findEntityByAlias(userId, query, 'person')) ??
    (await searchEntities(userId, query, { types: ['person'], limit: 1 }))[0] ??
    null;
  const phone = entity ? entityPhone(entity) : undefined;
  if (!entity || !phone) return null;
  return {
    entityId: entity.id,
    name: entity.canonicalName,
    phone,
    relationship: entity.specificRelation,
  };
}

/** Set a person's number in both shapes the lookup reads. False when there is no such entity. */
export async function setPersonPhone(
  userId: string,
  entityId: string,
  phone: string
): Promise<boolean> {
  const { getEntity, updateEntity } = await import('./storage.js');
  const entity = await getEntity(userId, entityId);
  if (!entity) return false;
  const attributes = { ...entity.attributes, phone } as Entity['attributes'];
  const updated = await updateEntity(userId, entityId, {
    contact: { ...entity.contact, phone },
    attributes,
  });
  return updated !== null;
}
