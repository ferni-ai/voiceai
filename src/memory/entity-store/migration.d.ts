/**
 * Entity Store Migration
 *
 * Migrates data from legacy fragmented collections into the unified entity store.
 *
 * Legacy collections (all storing overlapping people data):
 * - user_contacts (from contacts.ts)
 * - contact_relationships (from contact-relationship-service.ts)
 * - relationship_network (from superhuman/relationship-network.ts)
 * - relationship_nodes (from semantic-intelligence/relationship-graph.ts)
 * - guest_profiles (from jordan-planning-services.ts)
 * - network/relationships (from research tools)
 *
 * This migration:
 * 1. Reads all legacy collections
 * 2. Deduplicates entities (same person in multiple collections)
 * 3. Creates unified entities with merged data
 * 4. Preserves legacy IDs for backwards compatibility
 *
 * @module memory/entity-store/migration
 */
import type { LegacyContact, LegacyRelationshipPerson, MigrationResult } from './types.js';
/**
 * Read from user_contacts collection
 */
declare function readUserContacts(userId: string): Promise<LegacyContact[]>;
/**
 * Read from contact_relationships collection
 */
declare function readContactRelationships(userId: string): Promise<LegacyContact[]>;
/**
 * Read from relationship_network collection (superhuman service)
 */
declare function readRelationshipNetwork(userId: string): Promise<LegacyRelationshipPerson[]>;
/**
 * Read from relationship_nodes collection (semantic intelligence)
 */
declare function readRelationshipNodes(userId: string): Promise<LegacyRelationshipPerson[]>;
/**
 * Read from guest_profiles collection (Jordan's planning)
 */
declare function readGuestProfiles(userId: string): Promise<LegacyContact[]>;
/**
 * Migrate a single user's data to the unified entity store
 */
export declare function migrateUser(userId: string, options?: {
    dryRun?: boolean;
}): Promise<MigrationResult>;
/**
 * Run migration for all users (batch job)
 */
export declare function migrateAllUsers(options: {
    dryRun?: boolean;
    limit?: number;
    startAfter?: string;
}): Promise<{
    totalUsers: number;
    successfulUsers: number;
    failedUsers: number;
    totalEntities: number;
    totalMerged: number;
    errors: string[];
}>;
export { readUserContacts, readContactRelationships, readRelationshipNetwork, readRelationshipNodes, readGuestProfiles };
//# sourceMappingURL=migration.d.ts.map