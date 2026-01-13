/**
 * Relationship Storage
 *
 * Persistence layer for relationship data.
 * Uses Firestore when available, falls back to in-memory storage.
 */
import type { Relationship, GiftRecord, ImportantDate } from './types.js';
/**
 * Get all relationships for a user
 */
export declare function getRelationships(userId: string): Promise<Relationship[]>;
/**
 * Get a specific relationship
 */
export declare function getRelationship(userId: string, relationshipId: string): Promise<Relationship | null>;
/**
 * Find relationship by name
 */
export declare function findRelationshipByName(userId: string, name: string): Promise<Relationship | null>;
/**
 * Add or update a relationship
 */
export declare function saveRelationship(userId: string, relationship: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
}): Promise<Relationship>;
/**
 * Delete a relationship
 */
export declare function deleteRelationship(userId: string, relationshipId: string): Promise<boolean>;
/**
 * Update last contact date
 */
export declare function updateLastContact(userId: string, relationshipId: string, date?: Date): Promise<void>;
/**
 * Add a gift record
 */
export declare function addGiftRecord(userId: string, relationshipId: string, gift: Omit<GiftRecord, 'id'>): Promise<void>;
/**
 * Add an important date
 */
export declare function addImportantDate(userId: string, relationshipId: string, date: Omit<ImportantDate, 'id'>): Promise<void>;
/**
 * Get relationships with upcoming birthdays
 */
export declare function getUpcomingBirthdays(userId: string, daysAhead?: number): Promise<Array<{
    relationship: Relationship;
    daysUntil: number;
}>>;
/**
 * Get relationships needing contact
 */
export declare function getRelationshipsNeedingContact(userId: string): Promise<Array<{
    relationship: Relationship;
    daysSinceContact: number;
    urgency: 'gentle' | 'moderate' | 'urgent';
}>>;
/**
 * Get relationships by favorite team
 */
export declare function getRelationshipsByTeam(userId: string, teamName: string): Promise<Relationship[]>;
//# sourceMappingURL=storage.d.ts.map