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
  rollbackMigration,
  validateMigration,
  getMigrationHealth,
  getMigrationState,
  getUserMigrationStates,
  // Individual readers (for debugging)
  readUserContacts,
  readContactRelationships,
  readRelationshipNetwork,
  readRelationshipNodes,
  readGuestProfiles,
  // Types
  type ExtendedMigrationResult,
  type MigrationOptions,
  type BatchMigrationOptions,
  type BatchMigrationResult,
  type ConflictStrategy,
} from './migration.js';

// ============================================================================
// DUAL-WRITE EXPORTS
// ============================================================================

export {
  configureDualWrite,
  isDualWriteEnabled,
  setDualWriteEnabled,
  interceptContactWrite,
  interceptRelationshipNetworkWrite,
  interceptCommitmentWrite,
  interceptDreamWrite,
  interceptValueWrite,
  batchInterceptContacts,
  getMigrationStatus,
  getAllMigrationStatus,
  updateMigrationStatus,
  type DualWriteConfig,
  type CollectionMigrationStatus,
  type DualWriteResult,
} from './dual-write.js';

// ============================================================================
// LEGACY ADAPTER EXPORTS
// ============================================================================

export {
  configureLegacyAdapter,
  isUsingEntityStore,
  // Contact API compatibility
  getContacts,
  getContact,
  searchContacts,
  findContactByPhone,
  findContactByRelationship,
  // Relationship network API compatibility
  getRelationshipNetwork,
  getRelationshipConnections,
  type LegacyContactFormat,
  type LegacyRelationshipPerson as LegacyRelationshipPersonAdapter,
  type LegacyAdapterConfig,
} from './legacy-adapter.js';

// ============================================================================
// CACHE EXPORTS
// ============================================================================

export {
  // Configuration
  configureEntityCache,
  // Manual cache operations (for advanced use)
  invalidateUserCache,
  invalidateEntity,
  clearAllEntityCaches,
  // Metrics
  getEntityCacheMetrics,
  resetEntityCacheMetrics,
} from './entity-cache.js';
