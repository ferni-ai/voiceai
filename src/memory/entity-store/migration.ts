/**
 * Migration: Fragmented Collections → Unified Entity Store
 *
 * Migrates user data from 50+ legacy Firestore collections
 * to the unified entity store with full deduplication.
 *
 * @module memory/entity-store/migration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getEntityStore } from './store.js';
import type {
  Entity,
  EntityType,
  PersonAttributes,
  CommitmentAttributes,
  EventAttributes,
  ValueAttributes,
  DreamAttributes,
  PatternAttributes,
} from './types.js';

const log = createLogger({ module: 'EntityMigration' });

// ============================================================================
// TYPES
// ============================================================================

interface MigrationResult {
  userId: string;
  entitiesCreated: number;
  entitiesMerged: number;
  relationshipsCreated: number;
  errors: string[];
  durationMs: number;
}

interface LegacyContact {
  id: string;
  displayName: string;
  nicknames?: string[];
  relationship?: string;
  phones?: Array<{ number: string }>;
  emails?: Array<{ address: string }>;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface LegacyRelationshipPerson {
  id: string;
  name: string;
  type: string;
  sentiment?: number;
  importance?: number;
  lastMentioned?: Date;
  mentionCount?: number;
  topics?: string[];
}

interface LegacyCommitment {
  id: string;
  type: string;
  statement: string;
  status: string;
  targetDate?: Date;
  createdAt?: Date;
  relatedPersons?: string[];
}

interface LegacyDream {
  id: string;
  dream: string;
  category?: string;
  status?: string;
  obstacles?: string[];
  createdAt?: Date;
}

interface LegacyValue {
  id: string;
  value: string;
  category?: string;
  strength?: string;
  demonstrations?: string[];
  createdAt?: Date;
}

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

let db: FirebaseFirestore.Firestore | null = null;

async function getDb(): Promise<FirebaseFirestore.Firestore> {
  if (db) return db;

  const { Firestore } = await import('@google-cloud/firestore');
  db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE || '(default)',
  });
  return db;
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Migrate a single user to the unified entity store
 */
export async function migrateUserToEntities(userId: string): Promise<MigrationResult> {
  const startTime = Date.now();
  const store = getEntityStore();
  await store.initialize();

  const result: MigrationResult = {
    userId,
    entitiesCreated: 0,
    entitiesMerged: 0,
    relationshipsCreated: 0,
    errors: [],
    durationMs: 0,
  };

  const entityMap = new Map<string, Entity>(); // Track created entities for relationships

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Migrate Contacts (user_contacts + contact_relationships)
    // ═══════════════════════════════════════════════════════════════════════

    log.info({ userId }, 'Phase 1: Migrating contacts...');

    const contacts = await loadLegacyContacts(userId);
    const contactRelationships = await loadLegacyContactRelationships(userId);

    // Merge contacts from both sources
    const mergedPeople = new Map<string, {
      name: string;
      aliases: string[];
      relationship: string;
      phone?: string;
      email?: string;
      sentiment: number;
      lastSeen?: Date;
      mentionCount: number;
    }>();

    // Add from user_contacts
    for (const contact of contacts) {
      const key = normalizeNameKey(contact.displayName);
      const existing = mergedPeople.get(key);

      if (existing) {
        // Merge
        existing.aliases.push(...(contact.nicknames ?? []));
        if (contact.phones?.[0]?.number && !existing.phone) {
          existing.phone = contact.phones[0].number;
        }
        if (contact.emails?.[0]?.address && !existing.email) {
          existing.email = contact.emails[0].address;
        }
        result.entitiesMerged++;
      } else {
        mergedPeople.set(key, {
          name: contact.displayName,
          aliases: contact.nicknames ?? [],
          relationship: contact.relationship ?? 'unknown',
          phone: contact.phones?.[0]?.number,
          email: contact.emails?.[0]?.address,
          sentiment: 0,
          lastSeen: contact.updatedAt,
          mentionCount: 1,
        });
      }
    }

    // Add from contact_relationships
    for (const rel of contactRelationships) {
      const key = normalizeNameKey(rel.name);
      const existing = mergedPeople.get(key);

      if (existing) {
        // Merge - relationship service has richer data
        if (rel.sentiment !== undefined) existing.sentiment = rel.sentiment;
        if (rel.lastSeen) existing.lastSeen = rel.lastSeen;
        if (rel.mentionCount) existing.mentionCount += rel.mentionCount;
        result.entitiesMerged++;
      } else {
        mergedPeople.set(key, {
          name: rel.name,
          aliases: [],
          relationship: rel.relationship ?? 'unknown',
          phone: rel.phone,
          email: rel.email,
          sentiment: rel.sentiment ?? 0,
          lastSeen: rel.lastSeen,
          mentionCount: rel.mentionCount ?? 1,
        });
      }
    }

    // Create person entities
    for (const [key, person] of mergedPeople) {
      try {
        const entity = await store.createEntity(
          userId,
          'person',
          person.name,
          {
            _type: 'person',
            relationship: person.relationship,
            relationshipCategory: categorizeRelationship(person.relationship),
            phone: person.phone,
            email: person.email,
            sentiment: person.sentiment,
          } as PersonAttributes,
          {
            aliases: person.aliases.filter(Boolean),
          }
        );

        entityMap.set(`person:${key}`, entity);
        result.entitiesCreated++;
      } catch (error) {
        result.errors.push(`Failed to create person ${person.name}: ${error}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Migrate Relationship Network
    // ═══════════════════════════════════════════════════════════════════════

    log.info({ userId }, 'Phase 2: Migrating relationship network...');

    const networkPeople = await loadLegacyRelationshipNetwork(userId);

    for (const person of networkPeople) {
      const key = normalizeNameKey(person.name);

      // Check if already migrated from contacts
      if (entityMap.has(`person:${key}`)) {
        // Update existing entity with richer network data
        const existing = entityMap.get(`person:${key}`)!;
        await store.updateEntity(existing.id, {
          salienceScore: person.importance ?? existing.salienceScore,
          mentionCount: Math.max(existing.mentionCount, person.mentionCount ?? 1),
        });
        result.entitiesMerged++;
        continue;
      }

      // Create new person entity
      try {
        const entity = await store.createEntity(
          userId,
          'person',
          person.name,
          {
            _type: 'person',
            relationship: person.type,
            relationshipCategory: categorizeRelationship(person.type),
            sentiment: person.sentiment ?? 0,
          } as PersonAttributes,
          {
            aliases: [],
          }
        );

        entityMap.set(`person:${key}`, entity);
        result.entitiesCreated++;
      } catch (error) {
        result.errors.push(`Failed to create network person ${person.name}: ${error}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: Migrate Commitments
    // ═══════════════════════════════════════════════════════════════════════

    log.info({ userId }, 'Phase 3: Migrating commitments...');

    const commitments = await loadLegacyCommitments(userId);

    for (const commitment of commitments) {
      try {
        const entity = await store.createEntity(
          userId,
          'commitment',
          commitment.statement.substring(0, 100),
          {
            _type: 'commitment',
            commitmentType: mapCommitmentType(commitment.type),
            status: mapCommitmentStatus(commitment.status),
            targetDate: commitment.targetDate,
            relatedPeople: [],
            accountability: 'self',
            originalStatement: commitment.statement,
          } as CommitmentAttributes
        );

        entityMap.set(`commitment:${commitment.id}`, entity);
        result.entitiesCreated++;

        // Create relationships to mentioned people
        if (commitment.relatedPersons) {
          for (const personName of commitment.relatedPersons) {
            const personKey = normalizeNameKey(personName);
            const personEntity = entityMap.get(`person:${personKey}`);

            if (personEntity) {
              await store.createRelationship(entity.id, personEntity.id, 'involves', {
                context: 'commitment mentions this person',
              });
              result.relationshipsCreated++;
            }
          }
        }
      } catch (error) {
        result.errors.push(`Failed to create commitment: ${error}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: Migrate Dreams
    // ═══════════════════════════════════════════════════════════════════════

    log.info({ userId }, 'Phase 4: Migrating dreams...');

    const dreams = await loadLegacyDreams(userId);

    for (const dream of dreams) {
      try {
        const entity = await store.createEntity(
          userId,
          'dream',
          dream.dream.substring(0, 100),
          {
            _type: 'dream',
            dreamCategory: mapDreamCategory(dream.category),
            status: mapDreamStatus(dream.status),
            obstacles: dream.obstacles,
          } as DreamAttributes
        );

        entityMap.set(`dream:${dream.id}`, entity);
        result.entitiesCreated++;
      } catch (error) {
        result.errors.push(`Failed to create dream: ${error}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: Migrate Values
    // ═══════════════════════════════════════════════════════════════════════

    log.info({ userId }, 'Phase 5: Migrating values...');

    const values = await loadLegacyValues(userId);

    for (const value of values) {
      try {
        const entity = await store.createEntity(
          userId,
          'value',
          value.value,
          {
            _type: 'value',
            valueCategory: mapValueCategory(value.category),
            strength: mapValueStrength(value.strength),
            demonstrations: value.demonstrations,
          } as ValueAttributes
        );

        entityMap.set(`value:${value.id}`, entity);
        result.entitiesCreated++;
      } catch (error) {
        result.errors.push(`Failed to create value: ${error}`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 6: Migrate Patterns (from various superhuman services)
    // ═══════════════════════════════════════════════════════════════════════

    log.info({ userId }, 'Phase 6: Migrating patterns...');

    const patterns = await loadLegacyPatterns(userId);

    for (const pattern of patterns) {
      try {
        const entity = await store.createEntity(
          userId,
          'pattern',
          pattern.description.substring(0, 100),
          {
            _type: 'pattern',
            patternType: pattern.type,
            description: pattern.description,
            evidence: pattern.evidence ?? [],
            patternConfidence: pattern.confidence ?? 0.5,
            userAware: pattern.userAware ?? false,
            shouldSurface: true,
          } as PatternAttributes
        );

        result.entitiesCreated++;
      } catch (error) {
        result.errors.push(`Failed to create pattern: ${error}`);
      }
    }

    log.info(
      {
        userId,
        created: result.entitiesCreated,
        merged: result.entitiesMerged,
        relationships: result.relationshipsCreated,
        errors: result.errors.length,
      },
      '✅ Migration complete'
    );
  } catch (error) {
    result.errors.push(`Migration failed: ${error}`);
    log.error({ userId, error: String(error) }, '❌ Migration failed');
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Run migration for all users
 */
export async function runFullMigration(options?: {
  batchSize?: number;
  dryRun?: boolean;
}): Promise<{ totalUsers: number; successful: number; failed: number }> {
  const batchSize = options?.batchSize ?? 10;
  const dryRun = options?.dryRun ?? false;

  const database = await getDb();

  // Get all user IDs
  const usersSnapshot = await database.collection('bogle_users').select().get();
  const userIds = usersSnapshot.docs.map((doc) => doc.id);

  log.info(
    { totalUsers: userIds.length, batchSize, dryRun },
    'Starting full migration'
  );

  let successful = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map((userId) =>
        dryRun
          ? Promise.resolve({ userId, errors: [], entitiesCreated: 0 } as MigrationResult)
          : migrateUserToEntities(userId)
      )
    );

    for (const result of results) {
      if (result.errors.length === 0) {
        successful++;
      } else {
        failed++;
      }
    }

    log.info(
      { progress: i + batch.length, total: userIds.length, successful, failed },
      'Migration batch complete'
    );
  }

  return { totalUsers: userIds.length, successful, failed };
}

// ============================================================================
// LEGACY DATA LOADERS
// ============================================================================

async function loadLegacyContacts(userId: string): Promise<LegacyContact[]> {
  const database = await getDb();
  const snapshot = await database
    .collection('user_contacts')
    .where('userId', '==', userId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<LegacyContact, 'id'>),
  }));
}

async function loadLegacyContactRelationships(userId: string): Promise<
  Array<{
    id: string;
    name: string;
    relationship?: string;
    phone?: string;
    email?: string;
    sentiment?: number;
    lastSeen?: Date;
    mentionCount?: number;
  }>
> {
  const database = await getDb();
  const snapshot = await database
    .collection('contact_relationships')
    .where('userId', '==', userId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name as string,
      relationship: data.relationship as string | undefined,
      phone: data.phone as string | undefined,
      email: data.email as string | undefined,
      sentiment: data.sentiment as number | undefined,
      lastSeen: data.lastInteraction?.toDate?.() as Date | undefined,
      mentionCount: data.interactionCount as number | undefined,
    };
  });
}

async function loadLegacyRelationshipNetwork(userId: string): Promise<LegacyRelationshipPerson[]> {
  const database = await getDb();
  const snapshot = await database
    .collection('bogle_users')
    .doc(userId)
    .collection('relationship_network')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name as string,
      type: data.type as string,
      sentiment: data.sentiment as number | undefined,
      importance: data.importance as number | undefined,
      lastMentioned: data.lastMentioned?.toDate?.() as Date | undefined,
      mentionCount: data.mentionCount as number | undefined,
      topics: data.topics as string[] | undefined,
    };
  });
}

async function loadLegacyCommitments(userId: string): Promise<LegacyCommitment[]> {
  const database = await getDb();
  const snapshot = await database
    .collection('bogle_users')
    .doc(userId)
    .collection('commitments')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      type: data.type as string,
      statement: data.statement as string,
      status: data.status as string,
      targetDate: data.targetDate?.toDate?.() as Date | undefined,
      createdAt: data.createdAt?.toDate?.() as Date | undefined,
      relatedPersons: data.relatedPersons as string[] | undefined,
    };
  });
}

async function loadLegacyDreams(userId: string): Promise<LegacyDream[]> {
  const database = await getDb();
  const snapshot = await database
    .collection('bogle_users')
    .doc(userId)
    .collection('dreams')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      dream: data.dream as string,
      category: data.category as string | undefined,
      status: data.status as string | undefined,
      obstacles: data.obstacles as string[] | undefined,
      createdAt: data.createdAt?.toDate?.() as Date | undefined,
    };
  });
}

async function loadLegacyValues(userId: string): Promise<LegacyValue[]> {
  const database = await getDb();
  const snapshot = await database
    .collection('bogle_users')
    .doc(userId)
    .collection('values')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      value: data.value as string,
      category: data.category as string | undefined,
      strength: data.strength as string | undefined,
      demonstrations: data.demonstrations as string[] | undefined,
      createdAt: data.createdAt?.toDate?.() as Date | undefined,
    };
  });
}

async function loadLegacyPatterns(userId: string): Promise<
  Array<{
    type: PatternAttributes['patternType'];
    description: string;
    evidence?: string[];
    confidence?: number;
    userAware?: boolean;
  }>
> {
  const database = await getDb();
  const patterns: Array<{
    type: PatternAttributes['patternType'];
    description: string;
    evidence?: string[];
    confidence?: number;
    userAware?: boolean;
  }> = [];

  // Load from various pattern collections
  const collections = [
    { name: 'patterns', type: 'behavioral' as const },
    { name: 'emotional_patterns', type: 'emotional' as const },
    { name: 'energy_patterns', type: 'energy' as const },
    { name: 'temporal_patterns', type: 'temporal' as const },
  ];

  for (const { name, type } of collections) {
    try {
      const snapshot = await database
        .collection('bogle_users')
        .doc(userId)
        .collection(name)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        patterns.push({
          type,
          description: (data.description || data.pattern || data.name) as string,
          evidence: data.evidence as string[] | undefined,
          confidence: data.confidence as number | undefined,
          userAware: data.userAware as boolean | undefined,
        });
      }
    } catch {
      // Collection might not exist, skip
    }
  }

  return patterns;
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_');
}

function categorizeRelationship(
  relationship: string
): PersonAttributes['relationshipCategory'] {
  const rel = relationship.toLowerCase();

  if (
    ['mother', 'father', 'mom', 'dad', 'brother', 'sister', 'son', 'daughter', 'wife', 'husband', 'spouse', 'parent', 'child', 'grandparent', 'aunt', 'uncle', 'cousin'].includes(
      rel
    )
  ) {
    return 'family';
  }

  if (['friend', 'best friend', 'close friend'].includes(rel)) {
    return 'friend';
  }

  if (
    ['boss', 'coworker', 'colleague', 'manager', 'employee', 'client', 'vendor'].includes(rel)
  ) {
    return 'colleague';
  }

  if (['doctor', 'lawyer', 'therapist', 'accountant', 'advisor'].includes(rel)) {
    return 'professional';
  }

  if (['acquaintance', 'neighbor'].includes(rel)) {
    return 'acquaintance';
  }

  return 'other';
}

function mapCommitmentType(type: string): CommitmentAttributes['commitmentType'] {
  const t = type.toLowerCase();
  if (t.includes('promise')) return 'promise';
  if (t.includes('goal')) return 'goal';
  if (t.includes('decision')) return 'decision';
  return 'intention';
}

function mapCommitmentStatus(status: string): CommitmentAttributes['status'] {
  const s = status.toLowerCase();
  if (s.includes('complete')) return 'completed';
  if (s.includes('abandon')) return 'abandoned';
  if (s.includes('defer')) return 'deferred';
  return 'active';
}

function mapDreamCategory(category?: string): DreamAttributes['dreamCategory'] {
  if (!category) return 'other';
  const c = category.toLowerCase();
  if (c.includes('career') || c.includes('work')) return 'career';
  if (c.includes('family')) return 'family';
  if (c.includes('creative') || c.includes('art')) return 'creative';
  if (c.includes('travel')) return 'travel';
  if (c.includes('lifestyle')) return 'lifestyle';
  if (c.includes('learn')) return 'learning';
  return 'other';
}

function mapDreamStatus(status?: string): DreamAttributes['status'] {
  if (!status) return 'someday';
  const s = status.toLowerCase();
  if (s.includes('active') || s.includes('pursuing')) return 'active_pursuit';
  if (s.includes('achieved') || s.includes('done')) return 'achieved';
  if (s.includes('abandon')) return 'abandoned';
  if (s.includes('back') || s.includes('later')) return 'back_burner';
  return 'someday';
}

function mapValueCategory(category?: string): ValueAttributes['valueCategory'] {
  if (!category) return 'other';
  const c = category.toLowerCase();
  if (c.includes('family')) return 'family';
  if (c.includes('career') || c.includes('work')) return 'career';
  if (c.includes('health')) return 'health';
  if (c.includes('relationship')) return 'relationships';
  if (c.includes('growth') || c.includes('personal')) return 'growth';
  if (c.includes('creative')) return 'creativity';
  if (c.includes('security') || c.includes('safe')) return 'security';
  if (c.includes('freedom') || c.includes('independence')) return 'freedom';
  return 'other';
}

function mapValueStrength(strength?: string): ValueAttributes['strength'] {
  if (!strength) return 'mentioned';
  const s = strength.toLowerCase();
  if (s.includes('core') || s.includes('fundamental')) return 'core_identity';
  if (s.includes('evident') || s.includes('strong')) return 'evident';
  return 'mentioned';
}
