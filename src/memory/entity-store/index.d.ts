/**
 * Unified Entity Store
 *
 * Single source of truth for all entities (people, places, events, concepts)
 * in a user's life. This replaces the fragmented storage across:
 *
 * - user_contacts
 * - contact_relationships
 * - relationship_network
 * - relationship_nodes
 * - guest_profiles
 * - network/relationships
 *
 * @module memory/entity-store
 */
export type { Entity, EntityType, EntitySource, RelationshipType, FamilyRelation, ContactInfo, Mention, MentionType, ExtractedFact, EntityRelationship, EdgeType, EntityQuery, EntityQueryResult, EntitySearchOptions, PersonCaptureInput, CaptureContext, CaptureResult, LegacyContact, LegacyRelationshipPerson, MigrationResult, } from './types.js';
export { createEntity, getEntity, updateEntity, deleteEntity, findEntityByAlias, searchEntities, getAllEntities, getEntitiesByType, createMention, getMentionsForEntity, getRecentMentions, upsertRelationship, getRelationshipsForEntity, recordMention, hasEntityStore, getEntityStoreStats, } from './storage.js';
export { resolvePerson, mergeEntities, whatDoWeKnowAbout, type ResolvedEntity, } from './entity-resolver.js';
export { isEntityStoreReady, initializeEntityStore, capturePersonEntity, captureMultiplePeople, findContactForTelephony, getAllContacts, getEntityStoreHealth, } from './integration.js';
export { migrateUser, migrateAllUsers, readUserContacts, readContactRelationships, readRelationshipNetwork, readRelationshipNodes, readGuestProfiles, } from './migration.js';
export { configureEntityCache, invalidateUserCache, invalidateEntity, clearAllEntityCaches, getEntityCacheMetrics, resetEntityCacheMetrics, } from './entity-cache.js';
//# sourceMappingURL=index.d.ts.map