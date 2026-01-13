/**
 * Contact Groups Service
 *
 * Manages contact groups like "Family", "Close Friends", "Work Team".
 * Enables batch operations and occasion-based outreach.
 *
 * @module services/contacts/contact-groups
 */
import type { ContactGroup, OccasionPreferences } from './types.js';
/**
 * Get all contact groups for a user
 */
export declare function getGroups(userId: string): Promise<ContactGroup[]>;
/**
 * Get a specific group by ID or name
 */
export declare function getGroup(userId: string, idOrName: string): Promise<ContactGroup | null>;
/**
 * Create a new contact group
 */
export declare function createGroup(userId: string, data: {
    name: string;
    description?: string;
    members?: string[];
    defaultChannel?: ContactGroup['defaultChannel'];
    occasionPreferences?: OccasionPreferences;
}): Promise<ContactGroup>;
/**
 * Update a contact group
 */
export declare function updateGroup(userId: string, groupId: string, updates: Partial<Omit<ContactGroup, 'id' | 'userId' | 'createdAt'>>): Promise<ContactGroup>;
/**
 * Add member(s) to a group
 */
export declare function addToGroup(userId: string, groupId: string, contactIds: string | string[]): Promise<ContactGroup>;
/**
 * Remove member(s) from a group
 */
export declare function removeFromGroup(userId: string, groupId: string, contactIds: string | string[]): Promise<ContactGroup>;
/**
 * Delete a contact group
 */
export declare function deleteGroup(userId: string, groupId: string): Promise<void>;
/**
 * Initialize default groups for a new user
 */
export declare function initializeDefaultGroups(userId: string): Promise<ContactGroup[]>;
/**
 * Get groups that a contact belongs to
 */
export declare function getContactGroups(userId: string, contactId: string): Promise<ContactGroup[]>;
/**
 * Get groups that should receive greetings for an occasion
 */
export declare function getGroupsForOccasion(userId: string, occasion: keyof OccasionPreferences): Promise<ContactGroup[]>;
export declare function clearCache(userId?: string): void;
declare const _default: {
    getGroups: typeof getGroups;
    getGroup: typeof getGroup;
    createGroup: typeof createGroup;
    updateGroup: typeof updateGroup;
    addToGroup: typeof addToGroup;
    removeFromGroup: typeof removeFromGroup;
    deleteGroup: typeof deleteGroup;
    initializeDefaultGroups: typeof initializeDefaultGroups;
    getContactGroups: typeof getContactGroups;
    getGroupsForOccasion: typeof getGroupsForOccasion;
    clearCache: typeof clearCache;
};
export default _default;
//# sourceMappingURL=contact-groups.d.ts.map