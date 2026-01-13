/**
 * Contact Groups Service
 *
 * Manages contact groups like "Family", "Close Friends", "Work Team".
 * Enables batch operations and occasion-based outreach.
 *
 * @module services/contacts/contact-groups
 */
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, toSafeDate } from '../../utils/firestore-utils.js';
const log = getLogger();
// ============================================================================
// FIRESTORE SETUP
// ============================================================================
const GROUPS_COLLECTION = 'contact_groups';
let db = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise = null;
async function getFirestore() {
    if (db)
        return db;
    if (dbInitPromise)
        return dbInitPromise;
    dbInitPromise = initializeFirestore();
    return dbInitPromise;
}
async function initializeFirestore() {
    try {
        const { Firestore } = await import('@google-cloud/firestore');
        db = new Firestore({
            projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
            databaseId: process.env.FIRESTORE_DATABASE || '(default)',
        });
        return db;
    }
    catch (error) {
        log.warn({ error }, 'Firestore not available for contact groups');
        dbInitPromise = null; // Allow retry
        return null;
    }
}
// ============================================================================
// IN-MEMORY CACHE
// ============================================================================
const groupCache = new Map();
const loadedUsers = new Set();
// ============================================================================
// PREDEFINED GROUP TEMPLATES
// ============================================================================
const DEFAULT_GROUPS = [
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
export async function getGroups(userId) {
    await ensureUserLoaded(userId);
    return groupCache.get(userId) || [];
}
/**
 * Get a specific group by ID or name
 */
export async function getGroup(userId, idOrName) {
    const groups = await getGroups(userId);
    const nameLower = idOrName.toLowerCase();
    return groups.find((g) => g.id === idOrName || g.name.toLowerCase() === nameLower) || null;
}
/**
 * Create a new contact group
 */
export async function createGroup(userId, data) {
    await ensureUserLoaded(userId);
    const groups = groupCache.get(userId) || [];
    // Check for duplicate name
    if (groups.some((g) => g.name.toLowerCase() === data.name.toLowerCase())) {
        throw new Error(`Group "${data.name}" already exists`);
    }
    const now = new Date();
    const group = {
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
export async function updateGroup(userId, groupId, updates) {
    const group = await getGroup(userId, groupId);
    if (!group) {
        throw new Error(`Group not found: ${groupId}`);
    }
    const updated = {
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
export async function addToGroup(userId, groupId, contactIds) {
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
export async function removeFromGroup(userId, groupId, contactIds) {
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
export async function deleteGroup(userId, groupId) {
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
        }
        catch (error) {
            log.error({ error: String(error), groupId }, 'Failed to delete group');
        }
    }
    log.info({ userId, groupId }, 'Contact group deleted');
}
/**
 * Initialize default groups for a new user
 */
export async function initializeDefaultGroups(userId) {
    await ensureUserLoaded(userId);
    const existingGroups = groupCache.get(userId) || [];
    if (existingGroups.length > 0) {
        return existingGroups;
    }
    const createdGroups = [];
    for (const template of DEFAULT_GROUPS) {
        try {
            const group = await createGroup(userId, template);
            createdGroups.push(group);
        }
        catch (error) {
            log.warn({ error: String(error), template: template.name }, 'Failed to create default group');
        }
    }
    log.info({ userId, count: createdGroups.length }, 'Default contact groups initialized');
    return createdGroups;
}
/**
 * Get groups that a contact belongs to
 */
export async function getContactGroups(userId, contactId) {
    const groups = await getGroups(userId);
    return groups.filter((g) => g.members.includes(contactId));
}
/**
 * Get groups that should receive greetings for an occasion
 */
export async function getGroupsForOccasion(userId, occasion) {
    const groups = await getGroups(userId);
    return groups.filter((g) => g.occasionPreferences[occasion] === true);
}
// ============================================================================
// PERSISTENCE
// ============================================================================
async function ensureUserLoaded(userId) {
    if (loadedUsers.has(userId))
        return;
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
        const groups = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            groups.push({
                ...data,
                createdAt: toSafeDate(data.createdAt),
                updatedAt: toSafeDate(data.updatedAt),
            });
        }
        groupCache.set(userId, groups);
        loadedUsers.add(userId);
        log.debug({ userId, count: groups.length }, 'Loaded contact groups');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load contact groups');
        loadedUsers.add(userId);
    }
}
async function persistGroup(group) {
    const firestore = await getFirestore();
    if (!firestore)
        return;
    try {
        await firestore.collection(GROUPS_COLLECTION).doc(group.id).set(cleanForFirestore(group));
    }
    catch (error) {
        log.error({ error: String(error), groupId: group.id }, 'Failed to persist contact group');
    }
}
// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
export function clearCache(userId) {
    if (userId) {
        groupCache.delete(userId);
        loadedUsers.delete(userId);
    }
    else {
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
//# sourceMappingURL=contact-groups.js.map