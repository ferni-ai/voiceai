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

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  Entity,
  EntityType,
  EntitySource,
  RelationshipType,
  FamilyRelation,
  ContactInfo,
  Mention,
  MentionType,
  ExtractedFact,
  EntityRelationship,
  EdgeType,
  EntityQuery,
  EntityQueryResult,
  EntitySearchOptions,
  PersonCaptureInput,
  CaptureContext,
  CaptureResult,
  LegacyContact,
  LegacyRelationshipPerson,
  MigrationResult,
} from './types.js';

// ============================================================================
// STORAGE EXPORTS
// ============================================================================

export {
  // Entity operations
  createEntity,
  getEntity,
  updateEntity,
  deleteEntity,
  findEntityByAlias,
  searchEntities,
  getAllEntities,
  getEntitiesByType,
  // Mention operations
  createMention,
  getMentionsForEntity,
  getRecentMentions,
  // Relationship operations
  upsertRelationship,
  getRelationshipsForEntity,
  // Utilities
  recordMention,
  hasEntityStore,
  getEntityStoreStats,
} from './storage.js';

// ============================================================================
// RESOLVER EXPORTS
// ============================================================================

export {
  resolvePerson,
  mergeEntities,
  whatDoWeKnowAbout,
  type ResolvedEntity,
} from './entity-resolver.js';

// ============================================================================
// INTEGRATION EXPORTS
// ============================================================================

export {
  // State
  isEntityStoreReady,
  initializeEntityStore,
  // Capture
  capturePersonEntity,
  captureMultiplePeople,
  // Query helpers
  findContactForTelephony,
  getAllContacts,
  // Health
  getEntityStoreHealth,
} from './integration.js';

// ============================================================================
// MIGRATION EXPORTS
// ============================================================================

export {
  migrateUser,
  migrateAllUsers,
  // Individual readers (for debugging)
  readUserContacts,
  readContactRelationships,
  readRelationshipNetwork,
  readRelationshipNodes,
  readGuestProfiles,
} from './migration.js';
