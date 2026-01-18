/**
 * Legacy Adapter - Backwards Compatibility for Entity Store
 *
 * @deprecated This adapter provides backwards compatibility during migration.
 * All functions in this file are DEPRECATED and should be migrated to use
 * the native entity store APIs instead:
 *
 * MIGRATION GUIDE:
 * ================
 * OLD (deprecated)                        NEW (use instead)
 * -----------------                        -----------------
 * getContacts(userId)                  →   getAllEntities(userId, { types: ['person'] })
 * getContact(userId, id)               →   getEntity(userId, id)
 * searchContacts(userId, q)            →   searchEntities(userId, q, { types: ['person'] })
 * findContactByPhone(userId, phone)    →   findEntityByAlias(userId, phone) or custom search
 * findContactByRelationship(userId, r) →   findEntityByAlias(userId, r, 'person')
 * getRelationshipNetwork(userId)       →   getAllEntities(userId, { types: ['person'] })
 * getRelationshipConnections(u, p)     →   getRelationshipsForEntity(userId, personId)
 *
 * NOTE: This adapter will be removed in a future version.
 * Track your migration: grep for imports from 'legacy-adapter.js'
 *
 * @module memory/entity-store/legacy-adapter
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getAllEntities,
  getEntity,
  findEntityByAlias,
  searchEntities,
  getRelationshipsForEntity,
} from './storage.js';
import type { Entity, EntityType, RelationshipType } from './types.js';

const log = createLogger({ module: 'entity-store:legacy-adapter' });

// ============================================================================
// DEPRECATION TRACKING
// ============================================================================

// Track which legacy functions are still being called to guide migration
const deprecationStats = new Map<string, number>();

function trackDeprecatedCall(functionName: string): void {
  const count = deprecationStats.get(functionName) || 0;
  deprecationStats.set(functionName, count + 1);
  
  // Log every 100 calls to avoid spam
  if ((count + 1) % 100 === 0) {
    log.warn(
      { functionName, totalCalls: count + 1 },
      '⚠️ DEPRECATED: Legacy adapter function still in use. Please migrate to entity store APIs.'
    );
  }
}

/**
 * Get deprecation statistics for monitoring migration progress.
 * Useful for identifying which legacy functions are still heavily used.
 */
export function getLegacyAdapterStats(): Record<string, number> {
  return Object.fromEntries(deprecationStats);
}

/**
 * Reset deprecation stats (useful for tests).
 */
export function resetLegacyAdapterStats(): void {
  deprecationStats.clear();
}

// ============================================================================
// CONFIGURATION
// ============================================================================

interface LegacyAdapterConfig {
  /** Whether to use entity store (true) or legacy collections (false) */
  useEntityStore: boolean;
  /** Whether to fall back to legacy if entity store is empty */
  fallbackToLegacy: boolean;
  /** Log read operations */
  logReads: boolean;
}

const defaultConfig: LegacyAdapterConfig = {
  useEntityStore: true,
  fallbackToLegacy: true,
  logReads: false,
};

let config = { ...defaultConfig };

/**
 * Configure legacy adapter behavior
 */
export function configureLegacyAdapter(newConfig: Partial<LegacyAdapterConfig>): void {
  config = { ...config, ...newConfig };
  log.info({ config }, 'Legacy adapter configuration updated');
}

/**
 * Check if using entity store
 */
export function isUsingEntityStore(): boolean {
  return config.useEntityStore;
}

// ============================================================================
// CONTACT SERVICE COMPATIBILITY
// ============================================================================

/**
 * Legacy contact format (from user_contacts / contact_relationships)
 */
export interface LegacyContactFormat {
  id: string;
  userId: string;
  displayName: string;
  name?: string;
  phone?: string;
  phones?: Array<{ number: string; type: string }>;
  email?: string;
  emails?: Array<{ address: string; type: string }>;
  relationship?: string;
  relationshipType?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Convert entity to legacy contact format
 */
function entityToLegacyContact(entity: Entity): LegacyContactFormat {
  const attrs = entity.attributes as { phone?: string; email?: string; relationship?: string };
  
  return {
    id: entity.id,
    userId: entity.userId,
    displayName: entity.canonicalName,
    name: entity.canonicalName,
    phone: attrs.phone || entity.contact?.phone,
    phones: attrs.phone ? [{ number: attrs.phone, type: 'mobile' }] : undefined,
    email: attrs.email || entity.contact?.email,
    emails: attrs.email ? [{ address: attrs.email, type: 'personal' }] : undefined,
    relationship: entity.specificRelation || attrs.relationship,
    relationshipType: entity.relationship,
    notes: entity.topics?.join(', '),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Get all contacts for a user (legacy API)
 *
 * @deprecated Use getAllEntities({ types: ['person'] }) instead
 */
export async function getContacts(userId: string): Promise<LegacyContactFormat[]> {
  trackDeprecatedCall('getContacts');
  if (config.logReads) {
    log.debug({ userId }, 'Legacy adapter: getContacts');
  }

  if (!config.useEntityStore) {
    return getLegacyContacts(userId);
  }

  const entities = await getAllEntities(userId, { types: ['person'], topK: 500 });
  
  // If empty and fallback enabled, try legacy
  if (entities.length === 0 && config.fallbackToLegacy) {
    const legacy = await getLegacyContacts(userId);
    if (legacy.length > 0) {
      log.debug({ userId, count: legacy.length }, 'Falling back to legacy contacts');
      return legacy;
    }
  }

  return entities.map(entityToLegacyContact);
}

/**
 * Get a single contact by ID (legacy API)
 *
 * @deprecated Use getEntity() instead
 */
export async function getContact(userId: string, contactId: string): Promise<LegacyContactFormat | null> {
  trackDeprecatedCall('getContact');
  if (config.logReads) {
    log.debug({ userId, contactId }, 'Legacy adapter: getContact');
  }

  if (!config.useEntityStore) {
    return getLegacyContact(userId, contactId);
  }

  const entity = await getEntity(userId, contactId);
  
  if (!entity && config.fallbackToLegacy) {
    return getLegacyContact(userId, contactId);
  }

  return entity ? entityToLegacyContact(entity) : null;
}

/**
 * Search contacts by name/phone/email (legacy API)
 *
 * @deprecated Use searchEntities() or findEntityByAlias() instead
 */
export async function searchContacts(
  userId: string,
  query: string
): Promise<LegacyContactFormat[]> {
  trackDeprecatedCall('searchContacts');
  if (config.logReads) {
    log.debug({ userId, query }, 'Legacy adapter: searchContacts');
  }

  if (!config.useEntityStore) {
    return searchLegacyContacts(userId, query);
  }

  // First try exact alias match
  const exactMatch = await findEntityByAlias(userId, query, 'person');
  if (exactMatch) {
    return [entityToLegacyContact(exactMatch)];
  }

  // Then search
  const entities = await searchEntities(userId, query, { types: ['person'], topK: 20 });
  
  // If empty and fallback enabled, try legacy
  if (entities.length === 0 && config.fallbackToLegacy) {
    const legacy = await searchLegacyContacts(userId, query);
    if (legacy.length > 0) {
      return legacy;
    }
  }

  return entities.map(entityToLegacyContact);
}

/**
 * Find contact by phone number (legacy API)
 *
 * @deprecated Use findEntityByAlias() or custom search
 */
export async function findContactByPhone(
  userId: string,
  phone: string
): Promise<LegacyContactFormat | null> {
  trackDeprecatedCall('findContactByPhone');
  if (config.logReads) {
    log.debug({ userId, phone }, 'Legacy adapter: findContactByPhone');
  }

  if (!config.useEntityStore) {
    return findLegacyContactByPhone(userId, phone);
  }

  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
  const entities = await getAllEntities(userId, { types: ['person'], topK: 500 });
  
  for (const entity of entities) {
    const entityPhone = (entity.attributes as { phone?: string })?.phone || entity.contact?.phone;
    if (entityPhone) {
      const entityNormalized = entityPhone.replace(/\D/g, '').slice(-10);
      if (entityNormalized === normalizedPhone) {
        return entityToLegacyContact(entity);
      }
    }
  }

  // Fallback to legacy
  if (config.fallbackToLegacy) {
    return findLegacyContactByPhone(userId, phone);
  }

  return null;
}

/**
 * Find contact by relationship term (legacy API)
 *
 * @deprecated Use findEntityByAlias() instead
 */
export async function findContactByRelationship(
  userId: string,
  relationship: string
): Promise<LegacyContactFormat | null> {
  trackDeprecatedCall('findContactByRelationship');
  if (config.logReads) {
    log.debug({ userId, relationship }, 'Legacy adapter: findContactByRelationship');
  }

  if (!config.useEntityStore) {
    return findLegacyContactByRelationship(userId, relationship);
  }

  // Try to find by alias (handles "brother", "my brother", etc.)
  const entity = await findEntityByAlias(userId, relationship, 'person');
  
  if (!entity && config.fallbackToLegacy) {
    return findLegacyContactByRelationship(userId, relationship);
  }

  return entity ? entityToLegacyContact(entity) : null;
}

// ============================================================================
// RELATIONSHIP NETWORK COMPATIBILITY
// ============================================================================

/**
 * Legacy relationship network person format
 */
export interface LegacyRelationshipPerson {
  id: string;
  userId: string;
  name: string;
  type: string;
  importance: number;
  sentiment: number;
  mentionCount: number;
  firstMentioned?: Date;
  lastMentioned?: Date;
  context?: string[];
}

/**
 * Convert entity to legacy relationship person format
 */
function entityToLegacyRelationshipPerson(entity: Entity): LegacyRelationshipPerson {
  const attrs = entity.attributes as { relationship?: string; sentiment?: number };
  
  return {
    id: entity.id,
    userId: entity.userId,
    name: entity.canonicalName,
    type: entity.specificRelation || attrs.relationship || entity.relationship || 'other',
    importance: entity.salienceScore || entity.salience || 0.5,
    sentiment: attrs.sentiment || 0,
    mentionCount: entity.mentionCount || 1,
    firstMentioned: entity.firstSeen || entity.firstMentioned || entity.firstMentionedAt,
    lastMentioned: entity.lastSeen || entity.lastMentioned || entity.lastMentionedAt,
    context: entity.topics,
  };
}

/**
 * Get relationship network for a user (legacy API)
 *
 * @deprecated Use getAllEntities({ types: ['person'] }) instead
 */
export async function getRelationshipNetwork(userId: string): Promise<LegacyRelationshipPerson[]> {
  trackDeprecatedCall('getRelationshipNetwork');
  if (config.logReads) {
    log.debug({ userId }, 'Legacy adapter: getRelationshipNetwork');
  }

  if (!config.useEntityStore) {
    return getLegacyRelationshipNetwork(userId);
  }

  const entities = await getAllEntities(userId, { types: ['person'], topK: 500 });
  
  // If empty and fallback enabled, try legacy
  if (entities.length === 0 && config.fallbackToLegacy) {
    const legacy = await getLegacyRelationshipNetwork(userId);
    if (legacy.length > 0) {
      return legacy;
    }
  }

  return entities.map(entityToLegacyRelationshipPerson);
}

/**
 * Get relationship connections for a person (legacy API)
 *
 * @deprecated Use getRelationshipsForEntity() instead
 */
export async function getRelationshipConnections(
  userId: string,
  personId: string
): Promise<Array<{ fromId: string; toId: string; type: string; strength: number }>> {
  trackDeprecatedCall('getRelationshipConnections');
  if (config.logReads) {
    log.debug({ userId, personId }, 'Legacy adapter: getRelationshipConnections');
  }

  if (!config.useEntityStore) {
    return getLegacyRelationshipConnections(userId, personId);
  }

  const relationships = await getRelationshipsForEntity(userId, personId);
  
  return relationships.map((rel) => ({
    fromId: rel.fromEntity,
    toId: rel.toEntity,
    type: rel.type,
    strength: rel.strength,
  }));
}

// ============================================================================
// LEGACY FIRESTORE ACCESS (for fallback)
// ============================================================================

let firestoreInstance: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore> {
  if (firestoreInstance) return firestoreInstance;

  const { Firestore } = await import('@google-cloud/firestore');
  firestoreInstance = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  });
  return firestoreInstance;
}

async function getLegacyContacts(userId: string): Promise<LegacyContactFormat[]> {
  try {
    const db = await getFirestore();
    const snapshot = await db
      .collection('user_contacts')
      .doc(userId)
      .collection('contacts')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      displayName: doc.data().displayName || doc.data().name || 'Unknown',
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.(),
      updatedAt: doc.data().updatedAt?.toDate?.(),
    })) as LegacyContactFormat[];
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to read legacy contacts');
    return [];
  }
}

async function getLegacyContact(userId: string, contactId: string): Promise<LegacyContactFormat | null> {
  try {
    const db = await getFirestore();
    const doc = await db
      .collection('user_contacts')
      .doc(userId)
      .collection('contacts')
      .doc(contactId)
      .get();

    if (!doc.exists) return null;

    return {
      id: doc.id,
      userId,
      displayName: doc.data()?.displayName || doc.data()?.name || 'Unknown',
      ...doc.data(),
      createdAt: doc.data()?.createdAt?.toDate?.(),
      updatedAt: doc.data()?.updatedAt?.toDate?.(),
    } as LegacyContactFormat;
  } catch (error) {
    log.warn({ userId, contactId, error: String(error) }, 'Failed to read legacy contact');
    return null;
  }
}

async function searchLegacyContacts(userId: string, query: string): Promise<LegacyContactFormat[]> {
  const contacts = await getLegacyContacts(userId);
  const normalizedQuery = query.toLowerCase();

  return contacts.filter((c) =>
    c.displayName?.toLowerCase().includes(normalizedQuery) ||
    c.name?.toLowerCase().includes(normalizedQuery) ||
    c.phone?.includes(query) ||
    c.relationship?.toLowerCase().includes(normalizedQuery)
  );
}

async function findLegacyContactByPhone(userId: string, phone: string): Promise<LegacyContactFormat | null> {
  const contacts = await getLegacyContacts(userId);
  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

  return contacts.find((c) => {
    const contactPhone = c.phone?.replace(/\D/g, '').slice(-10);
    return contactPhone === normalizedPhone;
  }) || null;
}

async function findLegacyContactByRelationship(
  userId: string,
  relationship: string
): Promise<LegacyContactFormat | null> {
  const contacts = await getLegacyContacts(userId);
  const normalizedRel = relationship.toLowerCase().replace(/^my\s+/, '');

  return contacts.find((c) =>
    c.relationship?.toLowerCase() === normalizedRel ||
    c.relationship?.toLowerCase() === relationship.toLowerCase()
  ) || null;
}

async function getLegacyRelationshipNetwork(userId: string): Promise<LegacyRelationshipPerson[]> {
  try {
    const db = await getFirestore();
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_network')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      name: doc.data().name,
      type: doc.data().type || 'other',
      importance: doc.data().importance || 0.5,
      sentiment: doc.data().sentiment || 0,
      mentionCount: doc.data().mentionCount || 1,
      firstMentioned: doc.data().firstMentioned?.toDate?.(),
      lastMentioned: doc.data().lastMentioned?.toDate?.(),
      context: doc.data().context || [],
    })) as LegacyRelationshipPerson[];
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to read legacy relationship network');
    return [];
  }
}

async function getLegacyRelationshipConnections(
  userId: string,
  personId: string
): Promise<Array<{ fromId: string; toId: string; type: string; strength: number }>> {
  try {
    const db = await getFirestore();
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_connections')
      .where('fromId', '==', personId)
      .get();

    return snapshot.docs.map((doc) => ({
      fromId: doc.data().fromId,
      toId: doc.data().toId,
      type: doc.data().type || 'knows',
      strength: doc.data().strength || 0.5,
    }));
  } catch (error) {
    log.warn({ userId, personId, error: String(error) }, 'Failed to read legacy connections');
    return [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { LegacyAdapterConfig };
