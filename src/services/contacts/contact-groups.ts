/**
 * Contact Groups Service
 *
 * Manages contact groups like "Family", "Close Friends", "Work Team".
 * Enables batch operations and occasion-based outreach.
 *
 * @module services/contacts/contact-groups
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import type { ContactGroup, OccasionPreferences } from './types.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const GROUPS_COLLECTION = 'contact_groups';

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for contact groups');
    return null;
  }
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const groupCache = new Map<string, ContactGroup[]>();
const loadedUsers = new Set<string>();

// ============================================================================
// PREDEFINED GROUP TEMPLATES
// ============================================================================

const DEFAULT_GROUPS: Array<
  Omit<ContactGroup, 'id' | 'userId' | 'members' | 'createdAt' | 'updatedAt'>
> = [
  {
    name: 'Family',
    description: 'Immediate and extended family members',
    defaultChannel: 'sms',
    occasionPreferences: {
      christmas: true,
      newYear: true,
      birthdays: true,
      thanksgiving: true,
      anniversaries: true,
    },
  },
  {
    name: 'Close Friends',
    description: 'Your closest friends',
    defaultChannel: 'sms',
    occasionPreferences: {
      christmas: true,
      newYear: true,
      birthdays: true,
    },
  },
  {
    name: 'Work',
    description: 'Colleagues and professional contacts',
    defaultChannel: 'email',
    occasionPreferences: {
      christmas: true,
      newYear: true,
    },
  },
  {
    name: 'Extended Network',
    description: 'Acquaintances and broader connections',
    defaultChannel: 'email',
    occasionPreferences: {
      christmas: false,
      newYear: true,
    },
  },
];

// ============================================================================
// CORE OPERATIONS
// ============================================================================

/**
 * Get all contact groups for a user
 */
export async function getGroups(userId: string): Promise<ContactGroup[]> {
  await ensureUserLoaded(userId);
  return groupCache.get(userId) || [];
}

/**
 * Get a specific group by ID or name
 */
export async function getGroup(userId: string, idOrName: string): Promise<ContactGroup | null> {
  const groups = await getGroups(userId);
  const nameLower = idOrName.toLowerCase();

  return groups.find((g) => g.id === idOrName || g.name.toLowerCase() === nameLower) || null;
}

/**
 * Create a new contact group
 */
export async function createGroup(
  userId: string,
  data: {
    name: string;
    description?: string;
    members?: string[];
    defaultChannel?: ContactGroup['defaultChannel'];
    occasionPreferences?: OccasionPreferences;
  }
): Promise<ContactGroup> {
  await ensureUserLoaded(userId);

  const groups = groupCache.get(userId) || [];

  // Check for duplicate name
  if (groups.some((g) => g.name.toLowerCase() === data.name.toLowerCase())) {
    throw new Error(`Group "${data.name}" already exists`);
  }

  const now = new Date();
  const group: ContactGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId,
    name: data.name,
    description: data.description,
    members: data.members || [],
    defaultChannel: data.defaultChannel || 'email',
    occasionPreferences: data.occasionPreferences || {
      christmas: true,
      newYear: true,
      birthdays: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  groups.push(group);
  groupCache.set(userId, groups);
  await persistGroup(group);

  log.info({ userId, groupId: group.id, name: group.name }, 'Contact group created');
  return group;
}

/**
 * Update a contact group
 */
export async function updateGroup(
  userId: string,
  groupId: string,
  updates: Partial<Omit<ContactGroup, 'id' | 'userId' | 'createdAt'>>
): Promise<ContactGroup> {
  const group = await getGroup(userId, groupId);
  if (!group) {
    throw new Error(`Group not found: ${groupId}`);
  }

  const updated: ContactGroup = {
    ...group,
    ...updates,
    updatedAt: new Date(),
  };

  const groups = groupCache.get(userId) || [];
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx >= 0) {
    groups[idx] = updated;
  }

  await persistGroup(updated);
  log.info({ userId, groupId }, 'Contact group updated');
  return updated;
}

/**
 * Add member(s) to a group
 */
export async function addToGroup(
  userId: string,
  groupId: string,
  contactIds: string | string[]
): Promise<ContactGroup> {
  const group = await getGroup(userId, groupId);
  if (!group) {
    throw new Error(`Group not found: ${groupId}`);
  }

  const idsToAdd = Array.isArray(contactIds) ? contactIds : [contactIds];
  const newMembers = new Set([...group.members, ...idsToAdd]);

  return updateGroup(userId, groupId, { members: Array.from(newMembers) });
}

/**
 * Remove member(s) from a group
 */
export async function removeFromGroup(
  userId: string,
  groupId: string,
  contactIds: string | string[]
): Promise<ContactGroup> {
  const group = await getGroup(userId, groupId);
  if (!group) {
    throw new Error(`Group not found: ${groupId}`);
  }

  const idsToRemove = new Set(Array.isArray(contactIds) ? contactIds : [contactIds]);
  const newMembers = group.members.filter((id) => !idsToRemove.has(id));

  return updateGroup(userId, groupId, { members: newMembers });
}

/**
 * Delete a contact group
 */
export async function deleteGroup(userId: string, groupId: string): Promise<void> {
  const groups = groupCache.get(userId) || [];
  const idx = groups.findIndex((g) => g.id === groupId);

  if (idx >= 0) {
    groups.splice(idx, 1);
    groupCache.set(userId, groups);
  }

  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore.collection(GROUPS_COLLECTION).doc(groupId).delete();
    } catch (error) {
      log.error({ error: String(error), groupId }, 'Failed to delete group');
    }
  }

  log.info({ userId, groupId }, 'Contact group deleted');
}

/**
 * Initialize default groups for a new user
 */
export async function initializeDefaultGroups(userId: string): Promise<ContactGroup[]> {
  await ensureUserLoaded(userId);

  const existingGroups = groupCache.get(userId) || [];
  if (existingGroups.length > 0) {
    return existingGroups;
  }

  const createdGroups: ContactGroup[] = [];

  for (const template of DEFAULT_GROUPS) {
    try {
      const group = await createGroup(userId, template);
      createdGroups.push(group);
    } catch (error) {
      log.warn({ error: String(error), template: template.name }, 'Failed to create default group');
    }
  }

  log.info({ userId, count: createdGroups.length }, 'Default contact groups initialized');
  return createdGroups;
}

/**
 * Get groups that a contact belongs to
 */
export async function getContactGroups(userId: string, contactId: string): Promise<ContactGroup[]> {
  const groups = await getGroups(userId);
  return groups.filter((g) => g.members.includes(contactId));
}

/**
 * Get groups that should receive greetings for an occasion
 */
export async function getGroupsForOccasion(
  userId: string,
  occasion: keyof OccasionPreferences
): Promise<ContactGroup[]> {
  const groups = await getGroups(userId);
  return groups.filter((g) => g.occasionPreferences[occasion] === true);
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
      .collection(GROUPS_COLLECTION)
      .where('userId', '==', userId)
      .get();

    const groups: ContactGroup[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      groups.push({
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as ContactGroup);
    }

    groupCache.set(userId, groups);
    loadedUsers.add(userId);
    log.debug({ userId, count: groups.length }, 'Loaded contact groups');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load contact groups');
    loadedUsers.add(userId);
  }
}

async function persistGroup(group: ContactGroup): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore.collection(GROUPS_COLLECTION).doc(group.id).set(cleanForFirestore(group));
  } catch (error) {
    log.error({ error: String(error), groupId: group.id }, 'Failed to persist contact group');
  }
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

export function clearCache(userId?: string): void {
  if (userId) {
    groupCache.delete(userId);
    loadedUsers.delete(userId);
  } else {
    groupCache.clear();
    loadedUsers.clear();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getGroups,
  getGroup,
  createGroup,
  updateGroup,
  addToGroup,
  removeFromGroup,
  deleteGroup,
  initializeDefaultGroups,
  getContactGroups,
  getGroupsForOccasion,
  clearCache,
};
