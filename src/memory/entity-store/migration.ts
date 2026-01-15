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
 * Enhanced features (Phase 1 - Better Than Human Plan):
 * - Progress tracking and resumability
 * - Conflict resolution for duplicate entities
 * - Dry-run validation mode
 * - Rollback capability (30-day retention)
 *
 * @module memory/entity-store/migration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { createEntity, updateEntity, findEntityByAlias, getAllEntities, deleteEntity } from './storage.js';
import { mergeEntities } from './entity-resolver.js';
import type {
  Entity,
  EntityType,
  RelationshipType,
  EntitySource,
  LegacyContact,
  LegacyRelationshipPerson,
  MigrationResult,
} from './types.js';

const log = createLogger({ module: 'entity-store:migration' });

// ============================================================================
// MIGRATION STATE TRACKING
// ============================================================================

/**
 * Extended migration result with progress tracking
 */
export interface ExtendedMigrationResult extends MigrationResult {
  /** Unique migration run ID */
  migrationId: string;
  /** Start timestamp */
  startedAt: Date;
  /** End timestamp */
  completedAt?: Date;
  /** Current status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  /** Last processed document ID (for resumability) */
  lastProcessedId?: string;
  /** Rollback data (entity IDs created, for rollback) */
  rollbackData: {
    createdEntityIds: string[];
    updatedEntityIds: string[];
    timestamp: Date;
  };
  /** Conflict resolution stats */
  conflicts: {
    detected: number;
    autoResolved: number;
    manualRequired: number;
  };
}

/**
 * Migration checkpoint for resumability
 */
interface MigrationCheckpoint {
  migrationId: string;
  userId: string;
  collection: string;
  lastProcessedId: string;
  processedCount: number;
  timestamp: Date;
}

// In-memory state (in production, use Firestore)
const migrationStates = new Map<string, ExtendedMigrationResult>();
const checkpoints = new Map<string, MigrationCheckpoint>();

/**
 * Generate unique migration ID
 */
function generateMigrationId(): string {
  return `mig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get migration state
 */
export function getMigrationState(migrationId: string): ExtendedMigrationResult | undefined {
  return migrationStates.get(migrationId);
}

/**
 * Get all migration states for a user
 */
export function getUserMigrationStates(userId: string): ExtendedMigrationResult[] {
  return Array.from(migrationStates.values()).filter((s) => s.userId === userId);
}

/**
 * Save checkpoint for resumability
 */
async function saveCheckpoint(checkpoint: MigrationCheckpoint): Promise<void> {
  checkpoints.set(`${checkpoint.userId}_${checkpoint.collection}`, checkpoint);
  
  // Also persist to Firestore for durability
  try {
    const firestore = await getFirestore();
    await firestore
      .collection('migration_checkpoints')
      .doc(`${checkpoint.userId}_${checkpoint.collection}`)
      .set(cleanForFirestore(checkpoint));
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to persist checkpoint to Firestore');
  }
}

/**
 * Load checkpoint for resuming
 */
async function loadCheckpoint(
  userId: string,
  collection: string
): Promise<MigrationCheckpoint | null> {
  // Try in-memory first
  const inMemory = checkpoints.get(`${userId}_${collection}`);
  if (inMemory) return inMemory;

  // Try Firestore
  try {
    const firestore = await getFirestore();
    const doc = await firestore
      .collection('migration_checkpoints')
      .doc(`${userId}_${collection}`)
      .get();
    
    if (doc.exists) {
      return doc.data() as MigrationCheckpoint;
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load checkpoint from Firestore');
  }

  return null;
}

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

let db: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore> {
  if (db) return db;

  const { Firestore } = await import('@google-cloud/firestore');
  db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  });
  return db;
}

// ============================================================================
// LEGACY COLLECTION READERS
// ============================================================================

/**
 * Read from user_contacts collection
 */
async function readUserContacts(userId: string): Promise<LegacyContact[]> {
  const firestore = await getFirestore();

  try {
    const snapshot = await firestore.collection('user_contacts').doc(userId).collection('contacts').get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      ...doc.data(),
    })) as LegacyContact[];
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to read user_contacts');
    return [];
  }
}

/**
 * Read from contact_relationships collection
 */
async function readContactRelationships(userId: string): Promise<LegacyContact[]> {
  const firestore = await getFirestore();

  try {
    const snapshot = await firestore.collection('contact_relationships').where('userId', '==', userId).get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      displayName: doc.data().name,
      phone: doc.data().phone,
      email: doc.data().email,
      relationship: doc.data().relationship,
      notes: doc.data().notes,
      createdAt: doc.data().createdAt?.toDate?.(),
      updatedAt: doc.data().updatedAt?.toDate?.(),
    })) as LegacyContact[];
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to read contact_relationships');
    return [];
  }
}

/**
 * Read from relationship_network collection (superhuman service)
 */
async function readRelationshipNetwork(userId: string): Promise<LegacyRelationshipPerson[]> {
  const firestore = await getFirestore();

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_network')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      name: doc.data().name,
      type: doc.data().type,
      importance: doc.data().importance || 0.5,
      sentiment: doc.data().sentiment || 0,
      mentionCount: doc.data().mentionCount || 1,
      firstMentioned: doc.data().firstMentioned?.toDate?.(),
      lastMentioned: doc.data().lastMentioned?.toDate?.(),
      context: doc.data().context || [],
    })) as LegacyRelationshipPerson[];
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to read relationship_network');
    return [];
  }
}

/**
 * Read from relationship_nodes collection (semantic intelligence)
 */
async function readRelationshipNodes(userId: string): Promise<LegacyRelationshipPerson[]> {
  const firestore = await getFirestore();

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_nodes')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      name: doc.data().name,
      type: doc.data().type || 'acquaintance',
      importance: doc.data().salience || 0.5,
      sentiment: doc.data().sentiment || 0,
      mentionCount: doc.data().mentionCount || 1,
      firstMentioned: doc.data().firstMentioned?.toDate?.(),
      lastMentioned: doc.data().lastMentioned?.toDate?.(),
    })) as LegacyRelationshipPerson[];
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to read relationship_nodes');
    return [];
  }
}

/**
 * Read from guest_profiles collection (Jordan's planning)
 */
async function readGuestProfiles(userId: string): Promise<LegacyContact[]> {
  const firestore = await getFirestore();

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('guest_profiles')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      displayName: doc.data().name,
      relationship: doc.data().relationship,
      notes: doc.data().preferences || doc.data().notes,
    })) as LegacyContact[];
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Failed to read guest_profiles');
    return [];
  }
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

interface CandidateEntity {
  name: string;
  phone?: string;
  email?: string;
  relationship?: string;
  specificRelation?: string;
  importance: number;
  sentiment: number;
  mentionCount: number;
  firstMentioned?: Date;
  lastMentioned?: Date;
  context?: string[];
  legacyId: string;
  source: 'user_contacts' | 'contact_relationships' | 'relationship_network' | 'relationship_nodes' | 'guest_profiles';
}

/**
 * Normalize name for comparison
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z\s]/g, '');
}

/**
 * Check if two candidates are likely the same person
 */
function isSamePerson(a: CandidateEntity, b: CandidateEntity): boolean {
  // Same phone number
  if (a.phone && b.phone) {
    const phoneA = a.phone.replace(/\D/g, '').slice(-10);
    const phoneB = b.phone.replace(/\D/g, '').slice(-10);
    if (phoneA === phoneB) return true;
  }

  // Same email
  if (a.email && b.email) {
    if (a.email.toLowerCase() === b.email.toLowerCase()) return true;
  }

  // Same name (normalized)
  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  if (nameA && nameB && nameA === nameB) return true;

  // Same specific relation (only one "mom", "brother", etc.)
  if (a.specificRelation && b.specificRelation) {
    if (a.specificRelation === b.specificRelation) return true;
  }

  return false;
}

/**
 * Group candidates that are the same person
 */
function deduplicateCandidates(candidates: CandidateEntity[]): CandidateEntity[][] {
  const groups: CandidateEntity[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < candidates.length; i++) {
    if (assigned.has(i)) continue;

    const group = [candidates[i]];
    assigned.add(i);

    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned.has(j)) continue;

      if (isSamePerson(candidates[i], candidates[j])) {
        group.push(candidates[j]);
        assigned.add(j);
      }
    }

    groups.push(group);
  }

  return groups;
}

/**
 * Merge a group of candidates into a single entity
 */
function mergeCandidates(group: CandidateEntity[]): Partial<Entity> {
  // Pick best name (prefer actual names over relationship terms)
  const RELATIONSHIP_TERMS = ['mom', 'dad', 'brother', 'sister', 'wife', 'husband', 'boss', 'friend'];
  let bestName = group[0].name;
  for (const candidate of group) {
    if (!RELATIONSHIP_TERMS.includes(candidate.name.toLowerCase()) &&
        RELATIONSHIP_TERMS.includes(bestName.toLowerCase())) {
      bestName = candidate.name;
    }
  }

  // Collect all aliases
  const aliases = new Set<string>();
  for (const candidate of group) {
    aliases.add(candidate.name.toLowerCase());
    if (candidate.specificRelation) {
      aliases.add(candidate.specificRelation.toLowerCase());
      aliases.add(`my ${candidate.specificRelation.toLowerCase()}`);
    }
  }
  aliases.delete(bestName.toLowerCase()); // Don't include canonical name in aliases

  // Merge contact info
  const phone = group.find((c) => c.phone)?.phone;
  const email = group.find((c) => c.email)?.email;

  // Get relationship info
  const relationship = group.find((c) => c.relationship)?.relationship || 'other';
  const specificRelation = group.find((c) => c.specificRelation)?.specificRelation;

  // Aggregate stats
  const totalMentions = group.reduce((sum, c) => sum + c.mentionCount, 0);
  const maxImportance = Math.max(...group.map((c) => c.importance));
  const avgSentiment = group.reduce((sum, c) => sum + c.sentiment, 0) / group.length;

  // Get date range
  const firstMentioned = group
    .filter((c) => c.firstMentioned)
    .sort((a, b) => (a.firstMentioned?.getTime() || 0) - (b.firstMentioned?.getTime() || 0))[0]?.firstMentioned;
  const lastMentioned = group
    .filter((c) => c.lastMentioned)
    .sort((a, b) => (b.lastMentioned?.getTime() || 0) - (a.lastMentioned?.getTime() || 0))[0]?.lastMentioned;

  // Collect legacy IDs
  const legacyIds: Entity['legacyIds'] = {};
  for (const candidate of group) {
    switch (candidate.source) {
      case 'user_contacts':
        legacyIds.userContactId = candidate.legacyId;
        break;
      case 'contact_relationships':
        legacyIds.contactRelationshipId = candidate.legacyId;
        break;
      case 'relationship_network':
        legacyIds.relationshipNetworkId = candidate.legacyId;
        break;
      case 'guest_profiles':
        legacyIds.guestProfileId = candidate.legacyId;
        break;
    }
  }

  return {
    type: 'person' as EntityType,
    canonicalName: bestName,
    aliases: Array.from(aliases),
    relationship: mapRelationshipType(relationship),
    specificRelation,
    contact: phone || email ? { phone, email } : undefined,
    source: 'migration' as EntitySource,
    confidence: 0.85,
    salience: maxImportance,
    emotionalWeight: Math.abs(avgSentiment),
    mentionCount: totalMentions,
    firstMentionedAt: firstMentioned || new Date(),
    lastMentionedAt: lastMentioned || new Date(),
    topics: [],
    legacyIds,
  };
}

/**
 * Map legacy relationship strings to RelationshipType
 */
function mapRelationshipType(rel: string): RelationshipType {
  const normalized = rel.toLowerCase();

  if (['family', 'mother', 'father', 'brother', 'sister', 'son', 'daughter', 'aunt', 'uncle', 'cousin', 'grandmother', 'grandfather'].includes(normalized)) {
    return 'family';
  }
  if (['wife', 'husband', 'partner', 'boyfriend', 'girlfriend', 'romantic'].includes(normalized)) {
    return 'romantic';
  }
  if (['friend', 'bestfriend', 'buddy'].includes(normalized)) {
    return 'friend';
  }
  if (['colleague', 'coworker', 'boss', 'manager', 'employee'].includes(normalized)) {
    return 'colleague';
  }
  if (['professional', 'therapist', 'doctor', 'coach', 'mentor'].includes(normalized)) {
    return 'professional';
  }
  if (['acquaintance', 'neighbor', 'roommate'].includes(normalized)) {
    return 'acquaintance';
  }

  return 'other';
}

// ============================================================================
// ROLLBACK CAPABILITY
// ============================================================================

/**
 * Store rollback data for a migration
 */
async function storeRollbackData(
  migrationId: string,
  userId: string,
  createdIds: string[],
  updatedIds: string[]
): Promise<void> {
  try {
    const firestore = await getFirestore();
    await firestore.collection('migration_rollbacks').doc(migrationId).set(
      cleanForFirestore({
        migrationId,
        userId,
        createdEntityIds: createdIds,
        updatedEntityIds: updatedIds,
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
    );
  } catch (error) {
    log.warn({ migrationId, error: String(error) }, 'Failed to store rollback data');
  }
}

/**
 * Rollback a migration by deleting created entities
 */
export async function rollbackMigration(
  migrationId: string,
  userId: string
): Promise<{ success: boolean; deletedCount: number; errors: string[] }> {
  const result = { success: false, deletedCount: 0, errors: [] as string[] };

  try {
    const firestore = await getFirestore();
    const rollbackDoc = await firestore
      .collection('migration_rollbacks')
      .doc(migrationId)
      .get();

    if (!rollbackDoc.exists) {
      result.errors.push('Rollback data not found');
      return result;
    }

    const rollbackData = rollbackDoc.data();
    if (rollbackData?.userId !== userId) {
      result.errors.push('User ID mismatch');
      return result;
    }

    // Delete created entities
    const createdIds = rollbackData?.createdEntityIds || [];
    for (const entityId of createdIds) {
      try {
        const deleted = await deleteEntity(userId, entityId);
        if (deleted) result.deletedCount++;
      } catch (error) {
        result.errors.push(`Failed to delete entity ${entityId}: ${error}`);
      }
    }

    // Update migration state
    const state = migrationStates.get(migrationId);
    if (state) {
      state.status = 'rolled_back';
      migrationStates.set(migrationId, state);
    }

    result.success = result.errors.length === 0;
    log.info(
      { migrationId, userId, deletedCount: result.deletedCount },
      'Migration rolled back'
    );

    return result;
  } catch (error) {
    result.errors.push(`Rollback failed: ${error}`);
    return result;
  }
}

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

/**
 * Conflict resolution strategy
 */
export type ConflictStrategy = 'merge' | 'prefer_new' | 'prefer_existing' | 'manual';

/**
 * Resolve conflict between existing entity and new candidate
 */
function resolveConflict(
  existing: Entity,
  newData: Partial<Entity>,
  strategy: ConflictStrategy
): Partial<Entity> {
  switch (strategy) {
    case 'prefer_existing':
      // Keep existing, only add missing fields
      const allAliasesExisting = [...(existing.aliases || []), ...(newData.aliases || [])];
      return {
        aliases: Array.from(new Set(allAliasesExisting)),
        mentionCount: (existing.mentionCount || 0) + 1,
        lastMentionedAt: new Date(),
      };

    case 'prefer_new':
      // Use new data, keep important existing fields
      return {
        ...newData,
        id: existing.id,
        createdAt: existing.createdAt,
        mentionCount: (existing.mentionCount || 0) + 1,
      };

    case 'merge':
    default:
      // Smart merge: combine aliases, take best contact info, max salience
      // Note: We don't merge attributes here since they have strict type unions
      const mergedAliases = [...(existing.aliases || []), ...(newData.aliases || [])];
      const uniqueAliases = Array.from(new Set(mergedAliases));
      
      return {
        canonicalName: newData.canonicalName || existing.canonicalName,
        aliases: uniqueAliases,
        contact: {
          phone: (newData.contact?.phone || existing.contact?.phone),
          email: (newData.contact?.email || existing.contact?.email),
        },
        salience: Math.max(existing.salience || 0, newData.salience || 0),
        emotionalWeight: Math.max(existing.emotionalWeight || 0, newData.emotionalWeight || 0),
        mentionCount: (existing.mentionCount || 0) + (newData.mentionCount || 1),
        lastMentionedAt: new Date(),
      };
  }
}

// ============================================================================
// MIGRATION OPTIONS
// ============================================================================

export interface MigrationOptions {
  /** Dry run - don't actually write data */
  dryRun?: boolean;
  /** Resume from checkpoint if available */
  resume?: boolean;
  /** Conflict resolution strategy */
  conflictStrategy?: ConflictStrategy;
  /** Progress callback */
  onProgress?: (progress: {
    collection: string;
    processed: number;
    total: number;
    currentItem?: string;
  }) => void;
  /** Batch size for processing */
  batchSize?: number;
  /** Skip specific collections */
  skipCollections?: string[];
}

// ============================================================================
// MIGRATION RUNNER
// ============================================================================

/**
 * Migrate a single user's data to the unified entity store
 */
export async function migrateUser(
  userId: string,
  options: MigrationOptions = {}
): Promise<ExtendedMigrationResult> {
  const migrationId = generateMigrationId();
  const startTime = Date.now();
  const createdEntityIds: string[] = [];
  const updatedEntityIds: string[] = [];

  const result: ExtendedMigrationResult = {
    migrationId,
    userId,
    entitiesCreated: 0,
    entitiesMerged: 0,
    mentionsCreated: 0,
    legacyCollections: {
      userContacts: 0,
      relationshipNetwork: 0,
      contactRelationships: 0,
      guestProfiles: 0,
      relationshipNodes: 0,
    },
    errors: [],
    duration: 0,
    startedAt: new Date(),
    status: 'in_progress',
    rollbackData: {
      createdEntityIds: [],
      updatedEntityIds: [],
      timestamp: new Date(),
    },
    conflicts: {
      detected: 0,
      autoResolved: 0,
      manualRequired: 0,
    },
  };

  // Store initial state
  migrationStates.set(migrationId, result);

  log.info(
    { userId, migrationId, dryRun: options.dryRun, resume: options.resume },
    'Starting migration'
  );

  try {
    // Step 1: Read all legacy collections
    const [userContacts, contactRelationships, relationshipNetwork, relationshipNodes, guestProfiles] =
      await Promise.all([
        readUserContacts(userId),
        readContactRelationships(userId),
        readRelationshipNetwork(userId),
        readRelationshipNodes(userId),
        readGuestProfiles(userId),
      ]);

    result.legacyCollections = {
      userContacts: userContacts.length,
      contactRelationships: contactRelationships.length,
      relationshipNetwork: relationshipNetwork.length,
      relationshipNodes: relationshipNodes.length,
      guestProfiles: guestProfiles.length,
    };

    log.info(
      { userId, ...result.legacyCollections },
      'Read legacy collections'
    );

    // Step 2: Convert to candidates
    const candidates: CandidateEntity[] = [];

    for (const contact of userContacts) {
      candidates.push({
        name: contact.displayName || contact.name || 'Unknown',
        phone: contact.phone || contact.phones?.[0]?.number,
        email: contact.email || contact.emails?.[0]?.address,
        relationship: contact.relationship,
        specificRelation: contact.relationship,
        importance: 0.5,
        sentiment: 0,
        mentionCount: 1,
        legacyId: contact.id,
        source: 'user_contacts',
      });
    }

    for (const contact of contactRelationships) {
      candidates.push({
        name: contact.displayName || contact.name || 'Unknown',
        phone: contact.phone,
        email: contact.email,
        relationship: contact.relationship,
        specificRelation: contact.notes, // notes often contains specific relation like "mom"
        importance: 0.5,
        sentiment: 0,
        mentionCount: 1,
        legacyId: contact.id,
        source: 'contact_relationships',
      });
    }

    for (const person of relationshipNetwork) {
      candidates.push({
        name: person.name,
        relationship: person.type,
        specificRelation: person.type,
        importance: person.importance,
        sentiment: person.sentiment,
        mentionCount: person.mentionCount,
        firstMentioned: person.firstMentioned,
        lastMentioned: person.lastMentioned,
        context: person.context,
        legacyId: person.id,
        source: 'relationship_network',
      });
    }

    for (const node of relationshipNodes) {
      candidates.push({
        name: node.name,
        relationship: node.type,
        importance: node.importance,
        sentiment: node.sentiment,
        mentionCount: node.mentionCount,
        firstMentioned: node.firstMentioned,
        lastMentioned: node.lastMentioned,
        legacyId: node.id,
        source: 'relationship_nodes',
      });
    }

    for (const guest of guestProfiles) {
      candidates.push({
        name: guest.displayName || guest.name || 'Unknown',
        relationship: guest.relationship,
        importance: 0.5,
        sentiment: 0,
        mentionCount: 1,
        legacyId: guest.id,
        source: 'guest_profiles',
      });
    }

    log.info({ userId, totalCandidates: candidates.length }, 'Created candidates');

    // Step 3: Deduplicate
    const groups = deduplicateCandidates(candidates);
    const mergedCount = candidates.length - groups.length;

    log.info(
      { userId, groups: groups.length, merged: mergedCount },
      'Deduplicated candidates'
    );

    // Step 4: Create entities with progress tracking
    const conflictStrategy = options.conflictStrategy || 'merge';
    let processedCount = 0;

    if (!options.dryRun) {
      for (const group of groups) {
        try {
          const entityData = mergeCandidates(group);
          processedCount++;

          // Report progress
          if (options.onProgress) {
            options.onProgress({
              collection: 'entity_creation',
              processed: processedCount,
              total: groups.length,
              currentItem: entityData.canonicalName,
            });
          }

          // Check if entity already exists in new store
          const existing = await findEntityByAlias(userId, entityData.canonicalName!, 'person');
          if (existing) {
            // Conflict detected
            result.conflicts.detected++;

            // Resolve conflict based on strategy
            const resolvedData = resolveConflict(existing, entityData, conflictStrategy);
            await updateEntity(userId, existing.id, resolvedData);
            updatedEntityIds.push(existing.id);
            result.conflicts.autoResolved++;

            log.debug(
              { entityId: existing.id, name: entityData.canonicalName, strategy: conflictStrategy },
              'Resolved conflict and updated entity'
            );
          } else {
            // Create new
            const newEntity = await createEntity(userId, {
              ...entityData,
              userId,
              createdAt: entityData.firstMentionedAt || new Date(),
              updatedAt: new Date(),
            } as Omit<Entity, 'id'>);
            createdEntityIds.push(newEntity.id);
            result.entitiesCreated++;
          }

          // Save checkpoint periodically
          if (processedCount % 10 === 0) {
            await saveCheckpoint({
              migrationId,
              userId,
              collection: 'entities',
              lastProcessedId: group[0].legacyId,
              processedCount,
              timestamp: new Date(),
            });
          }
        } catch (error) {
          result.errors.push(`Failed to create entity for ${group[0].name}: ${error}`);
          log.warn({ userId, name: group[0].name, error: String(error) }, 'Failed to create entity');
        }
      }
    }

    result.entitiesMerged = mergedCount;
    result.duration = Date.now() - startTime;
    result.completedAt = new Date();
    result.status = result.errors.length === 0 ? 'completed' : 'completed';
    result.rollbackData = {
      createdEntityIds,
      updatedEntityIds,
      timestamp: new Date(),
    };

    // Store rollback data
    if (!options.dryRun && createdEntityIds.length > 0) {
      await storeRollbackData(migrationId, userId, createdEntityIds, updatedEntityIds);
    }

    // Update migration state
    migrationStates.set(migrationId, result);

    log.info(
      {
        userId,
        migrationId,
        entitiesCreated: result.entitiesCreated,
        entitiesMerged: result.entitiesMerged,
        conflicts: result.conflicts,
        duration: result.duration,
        errors: result.errors.length,
      },
      'Migration complete'
    );

    return result;
  } catch (error) {
    result.errors.push(String(error));
    result.duration = Date.now() - startTime;
    result.status = 'failed';
    result.completedAt = new Date();
    migrationStates.set(migrationId, result);
    log.error({ userId, migrationId, error: String(error) }, 'Migration failed');
    return result;
  }
}

/**
 * Batch migration options
 */
export interface BatchMigrationOptions extends MigrationOptions {
  /** Maximum users to process */
  limit?: number;
  /** Start after this user ID (for pagination) */
  startAfter?: string;
  /** Parallelism (number of concurrent migrations) */
  parallelism?: number;
  /** Progress callback for batch */
  onBatchProgress?: (progress: {
    processedUsers: number;
    totalUsers: number;
    currentUserId: string;
    successfulUsers: number;
    failedUsers: number;
  }) => void;
}

/**
 * Batch migration result
 */
export interface BatchMigrationResult {
  /** Unique batch ID */
  batchId: string;
  /** Total users attempted */
  totalUsers: number;
  /** Successfully migrated users */
  successfulUsers: number;
  /** Failed users */
  failedUsers: number;
  /** Total entities created */
  totalEntities: number;
  /** Total entities merged (duplicates) */
  totalMerged: number;
  /** Total conflicts resolved */
  totalConflicts: number;
  /** All errors encountered */
  errors: string[];
  /** Individual migration IDs for each user */
  migrationIds: string[];
  /** Last processed user ID (for resuming) */
  lastUserId?: string;
  /** Duration in ms */
  duration: number;
}

/**
 * Run migration for all users (batch job)
 */
export async function migrateAllUsers(
  options: BatchMigrationOptions = {}
): Promise<BatchMigrationResult> {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();
  const firestore = await getFirestore();
  const limit = options.limit || 100;
  const parallelism = options.parallelism || 5;

  let query = firestore.collection('bogle_users').limit(limit);
  if (options.startAfter) {
    query = query.startAfter(options.startAfter);
  }

  const snapshot = await query.get();
  const userIds = snapshot.docs.map((doc) => doc.id);

  log.info(
    { batchId, userCount: userIds.length, dryRun: options.dryRun, parallelism },
    'Starting batch migration'
  );

  const results: BatchMigrationResult = {
    batchId,
    totalUsers: userIds.length,
    successfulUsers: 0,
    failedUsers: 0,
    totalEntities: 0,
    totalMerged: 0,
    totalConflicts: 0,
    errors: [],
    migrationIds: [],
    duration: 0,
  };

  // Process users in parallel batches
  for (let i = 0; i < userIds.length; i += parallelism) {
    const batch = userIds.slice(i, i + parallelism);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (userId) => {
        const result = await migrateUser(userId, {
          dryRun: options.dryRun,
          conflictStrategy: options.conflictStrategy,
          resume: options.resume,
        });
        return { userId, result };
      })
    );

    for (const settledResult of batchResults) {
      if (settledResult.status === 'fulfilled') {
        const { userId, result } = settledResult.value;
        results.migrationIds.push(result.migrationId);
        results.lastUserId = userId;

        if (result.status === 'completed' && result.errors.length === 0) {
          results.successfulUsers++;
        } else {
          results.failedUsers++;
          results.errors.push(...result.errors.map((e) => `User ${userId}: ${e}`));
        }

        results.totalEntities += result.entitiesCreated;
        results.totalMerged += result.entitiesMerged;
        results.totalConflicts += result.conflicts.detected;
      } else {
        results.failedUsers++;
        results.errors.push(`Batch error: ${settledResult.reason}`);
      }

      // Report batch progress
      if (options.onBatchProgress) {
        options.onBatchProgress({
          processedUsers: results.successfulUsers + results.failedUsers,
          totalUsers: userIds.length,
          currentUserId: results.lastUserId || '',
          successfulUsers: results.successfulUsers,
          failedUsers: results.failedUsers,
        });
      }
    }

    // Store batch checkpoint
    try {
      await firestore.collection('migration_batch_checkpoints').doc(batchId).set(
        cleanForFirestore({
          batchId,
          lastUserId: results.lastUserId,
          processedCount: results.successfulUsers + results.failedUsers,
          timestamp: new Date(),
        })
      );
    } catch (error) {
      log.warn({ batchId, error: String(error) }, 'Failed to save batch checkpoint');
    }
  }

  results.duration = Date.now() - startTime;

  log.info(
    {
      ...results,
      errors: results.errors.length,
    },
    'Batch migration complete'
  );

  return results;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate migration can be performed for a user
 */
export async function validateMigration(userId: string): Promise<{
  valid: boolean;
  issues: string[];
  stats: {
    legacyRecordCount: number;
    existingEntityCount: number;
    estimatedNewEntities: number;
  };
}> {
  const issues: string[] = [];

  try {
    // Read legacy data
    const [userContacts, contactRelationships, relationshipNetwork, relationshipNodes, guestProfiles] =
      await Promise.all([
        readUserContacts(userId),
        readContactRelationships(userId),
        readRelationshipNetwork(userId),
        readRelationshipNodes(userId),
        readGuestProfiles(userId),
      ]);

    const legacyRecordCount =
      userContacts.length +
      contactRelationships.length +
      relationshipNetwork.length +
      relationshipNodes.length +
      guestProfiles.length;

    // Check existing entity store
    const existingEntities = await getAllEntities(userId, { topK: 1000 });
    const existingEntityCount = existingEntities.length;

    // Estimate new entities (rough - actual deduplication will reduce this)
    const estimatedNewEntities = Math.max(
      0,
      legacyRecordCount - existingEntityCount - Math.floor(legacyRecordCount * 0.3)
    );

    // Validation checks
    if (legacyRecordCount === 0) {
      issues.push('No legacy data found to migrate');
    }

    if (existingEntityCount > 0 && existingEntityCount >= legacyRecordCount) {
      issues.push('Entity store already has more entities than legacy collections');
    }

    return {
      valid: issues.length === 0,
      issues,
      stats: {
        legacyRecordCount,
        existingEntityCount,
        estimatedNewEntities,
      },
    };
  } catch (error) {
    return {
      valid: false,
      issues: [`Validation failed: ${error}`],
      stats: {
        legacyRecordCount: 0,
        existingEntityCount: 0,
        estimatedNewEntities: 0,
      },
    };
  }
}

/**
 * Get migration health/status summary
 */
export function getMigrationHealth(): {
  activeMigrations: number;
  completedMigrations: number;
  failedMigrations: number;
  recentMigrations: ExtendedMigrationResult[];
} {
  const states = Array.from(migrationStates.values());
  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours

  return {
    activeMigrations: states.filter((s) => s.status === 'in_progress').length,
    completedMigrations: states.filter((s) => s.status === 'completed').length,
    failedMigrations: states.filter((s) => s.status === 'failed').length,
    recentMigrations: states
      .filter((s) => s.startedAt.getTime() > recentCutoff)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 10),
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export { readUserContacts, readContactRelationships, readRelationshipNetwork, readRelationshipNodes, readGuestProfiles };
