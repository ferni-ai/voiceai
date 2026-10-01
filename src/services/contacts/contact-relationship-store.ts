/**
 * Contact relationship store: Firestore setup, in-memory cache, core CRUD
 * and persistence. Extracted from contact-relationship-service.ts.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { cleanForFirestore, toSafeDate } from '../../utils/firestore-utils.js';
import { onContactChange, onContactInteractionChange } from '../data-layer/hooks/contacts-hooks.js';
import type { ContactRelationship, InteractionRecord } from './contact-relationship-types.js';

const log = getLogger();

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const CONTACTS_COLLECTION = 'contact_relationships';
export const INTERACTIONS_COLLECTION = 'contact_interactions';

let db: FirestoreType | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirestoreType | null> | null = null;

export async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirestoreType | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Contact relationship Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for contact relationships');
    dbInitPromise = null; // Allow retry
    return null;
  }
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const contactCache = new Map<string, ContactRelationship[]>();
const loadedUsers = new Set<string>();

// ============================================================================
// CORE OPERATIONS
// ============================================================================

/**
 * Get all contacts for a user
 */
export async function getContacts(userId: string): Promise<ContactRelationship[]> {
  await ensureUserLoaded(userId);
  return contactCache.get(userId) || [];
}

/**
 * Get a specific contact by ID or email
 */
export async function getContact(
  userId: string,
  identifier: string
): Promise<ContactRelationship | null> {
  const contacts = await getContacts(userId);
  return (
    contacts.find(
      (c) =>
        c.id === identifier ||
        c.email?.toLowerCase() === identifier.toLowerCase() ||
        c.contactId === identifier
    ) || null
  );
}

/**
 * Create or update a contact
 */
export async function upsertContact(
  userId: string,
  contact: Partial<ContactRelationship> & { name: string; contactId: string }
): Promise<ContactRelationship> {
  await ensureUserLoaded(userId);

  const contacts = contactCache.get(userId) || [];
  const existingIndex = contacts.findIndex(
    (c) => c.contactId === contact.contactId || c.id === contact.id
  );

  const now = new Date();
  let saved: ContactRelationship;

  if (existingIndex >= 0) {
    // Update existing
    saved = {
      ...contacts[existingIndex],
      ...contact,
      updatedAt: now,
    };
    contacts[existingIndex] = saved;
  } else {
    // Create new
    saved = {
      id: `contact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      contactId: contact.contactId,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      relationship: contact.relationship || 'other',
      notes: contact.notes,
      firstInteraction: contact.firstInteraction || now,
      lastInteraction: contact.lastInteraction || now,
      interactionCount: contact.interactionCount || 0,
      strengthScore: contact.strengthScore || 50,
      preferredChannel: contact.preferredChannel,
      bestTimeToReach: contact.bestTimeToReach,
      avgResponseTimeHours: contact.avgResponseTimeHours,
      importantDates: contact.importantDates || [],
      topics: contact.topics || [],
      recentContext: contact.recentContext || [],
      createdAt: now,
      updatedAt: now,
    };
    contacts.push(saved);
  }

  contactCache.set(userId, contacts);
  await persistContact(saved);

  log.info({ userId, contactId: saved.contactId, name: saved.name }, 'Contact saved');
  return saved;
}

/**
 * Delete a contact owned by the user.
 *
 * Lookup is scoped to the user's own contacts, so another user's contact
 * can never match. Returns false when the user has no such contact.
 */
export async function deleteContact(userId: string, identifier: string): Promise<boolean> {
  const existing = await getContact(userId, identifier);
  if (!existing || existing.userId !== userId) return false;

  const firestore = await getFirestore();
  if (firestore) {
    await firestore.collection(CONTACTS_COLLECTION).doc(existing.id).delete();
  }

  const contacts = contactCache.get(userId) || [];
  contactCache.set(
    userId,
    contacts.filter((c) => c.id !== existing.id)
  );

  // Remove from semantic memory index
  onContactChange(
    userId,
    existing.id,
    { name: existing.name, relationship: existing.relationship || 'contact' },
    'delete'
  );

  log.info({ userId, contactId: existing.contactId }, 'Contact deleted');
  return true;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function ensureUserLoaded(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  const firestore = await getFirestore();
  if (!firestore) {
    loadedUsers.add(userId);
    return;
  }

  try {
    const snapshot = await firestore
      .collection(CONTACTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('lastInteraction', 'desc')
      .get();

    const contacts: ContactRelationship[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      contacts.push({
        ...data,
        firstInteraction: toSafeDate(data.firstInteraction),
        lastInteraction: toSafeDate(data.lastInteraction),
        createdAt: toSafeDate(data.createdAt),
        updatedAt: toSafeDate(data.updatedAt),
        topics: (data.topics || []).map((t: Record<string, unknown>) => ({
          ...t,
          firstMentioned: toSafeDate(t.firstMentioned),
          lastMentioned: toSafeDate(t.lastMentioned),
        })),
        pendingFollowUp: data.pendingFollowUp
          ? {
              ...data.pendingFollowUp,
              dueDate: toSafeDate(data.pendingFollowUp.dueDate),
            }
          : undefined,
        lastFollowUpDate: data.lastFollowUpDate ? toSafeDate(data.lastFollowUpDate) : undefined,
      } as ContactRelationship);
    }

    contactCache.set(userId, contacts);
    loadedUsers.add(userId);
    log.debug({ userId, count: contacts.length }, 'Loaded contact relationships');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load contacts');
    loadedUsers.add(userId);
  }
}

export async function persistContact(contact: ContactRelationship): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    // Remove undefined values before persisting to Firestore
    const cleanContact = Object.fromEntries(
      Object.entries(contact).filter(([_, v]) => v !== undefined)
    );

    await firestore
      .collection(CONTACTS_COLLECTION)
      .doc(contact.id)
      .set(cleanForFirestore(cleanContact));

    // Index to semantic memory for contact awareness
    void onContactChange(
      contact.userId,
      contact.id,
      {
        name: contact.name,
        relationship: contact.relationship || 'contact',
        notes: contact.topics?.map((t) => t.topic).join('; '),
        importantDates: undefined,
        communicationPreference: contact.preferredChannel,
      },
      'update'
    );
  } catch (error) {
    log.error({ error: String(error), contactId: contact.id }, 'Failed to persist contact');
  }
}

export async function persistInteraction(interaction: InteractionRecord): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection(INTERACTIONS_COLLECTION)
      .doc(interaction.id)
      .set(cleanForFirestore(interaction));

    // Index to semantic memory for relationship context
    void onContactInteractionChange(
      interaction.userId,
      interaction.id,
      {
        contactName: interaction.contactId, // Will be resolved from contact later
        interactionType: interaction.type as 'call' | 'message' | 'meeting' | 'email' | 'social',
        summary: interaction.summary || '',
        date: interaction.date.toISOString(),
        sentiment: interaction.sentiment as 'positive' | 'neutral' | 'negative' | undefined,
        followUpNeeded: false,
      },
      'create'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist interaction');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearCache(userId?: string): void {
  if (userId) {
    contactCache.delete(userId);
    loadedUsers.delete(userId);
  } else {
    contactCache.clear();
    loadedUsers.clear();
  }
}
