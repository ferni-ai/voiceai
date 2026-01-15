/**
 * Dual-Write Layer for Entity Store Migration
 *
 * During the migration period, intercepts writes to legacy collections
 * and mirrors them to the unified entity store. This ensures:
 *
 * 1. New data goes to both old and new systems
 * 2. Gradual migration without data loss
 * 3. Easy rollback if issues arise
 *
 * @module memory/entity-store/dual-write
 */

import { createLogger } from '../../utils/safe-logger.js';
import { resolvePerson } from './entity-resolver.js';
import { createMention, recordMention, upsertRelationship } from './storage.js';
import type {
  Entity,
  PersonCaptureInput,
  CaptureContext,
  EdgeType,
  MentionType,
} from './types.js';

const log = createLogger({ module: 'entity-store:dual-write' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface DualWriteConfig {
  /** Whether dual-write is enabled */
  enabled: boolean;
  /** Collections to intercept */
  collections: string[];
  /** Whether to fail silently on entity store errors */
  failSilent: boolean;
  /** Log level for dual-write operations */
  logLevel: 'debug' | 'info' | 'warn';
}

const defaultConfig: DualWriteConfig = {
  enabled: true,
  collections: [
    'user_contacts',
    'contact_relationships',
    'relationship_network',
    'relationship_nodes',
    'guest_profiles',
    'commitments',
    'dreams',
    'values',
    'patterns',
  ],
  failSilent: true,
  logLevel: 'debug',
};

let config = { ...defaultConfig };

/**
 * Configure dual-write behavior
 */
export function configureDualWrite(newConfig: Partial<DualWriteConfig>): void {
  config = { ...config, ...newConfig };
  log.info({ config }, 'Dual-write configuration updated');
}

/**
 * Check if dual-write is enabled
 */
export function isDualWriteEnabled(): boolean {
  return config.enabled;
}

/**
 * Enable or disable dual-write
 */
export function setDualWriteEnabled(enabled: boolean): void {
  config.enabled = enabled;
  log.info({ enabled }, `Dual-write ${enabled ? 'enabled' : 'disabled'}`);
}

// ============================================================================
// MIGRATION STATUS TRACKING
// ============================================================================

interface CollectionMigrationStatus {
  collection: string;
  totalDocuments: number;
  migratedDocuments: number;
  lastMigratedAt: Date | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  errors: string[];
}

const migrationStatus = new Map<string, CollectionMigrationStatus>();

/**
 * Get migration status for a collection
 */
export function getMigrationStatus(collection: string): CollectionMigrationStatus | undefined {
  return migrationStatus.get(collection);
}

/**
 * Get all migration statuses
 */
export function getAllMigrationStatus(): CollectionMigrationStatus[] {
  return Array.from(migrationStatus.values());
}

/**
 * Update migration status for a collection
 */
export function updateMigrationStatus(
  collection: string,
  update: Partial<CollectionMigrationStatus>
): void {
  const existing = migrationStatus.get(collection) || {
    collection,
    totalDocuments: 0,
    migratedDocuments: 0,
    lastMigratedAt: null,
    status: 'pending' as const,
    errors: [],
  };
  migrationStatus.set(collection, { ...existing, ...update });
}

// ============================================================================
// DUAL-WRITE INTERCEPTORS
// ============================================================================

/**
 * Intercept a contact write and mirror to entity store
 */
export async function interceptContactWrite(
  userId: string,
  contactData: {
    id?: string;
    displayName?: string;
    name?: string;
    phone?: string;
    email?: string;
    relationship?: string;
    notes?: string;
  },
  sourceCollection: string,
  context?: Partial<CaptureContext>
): Promise<{ entity: Entity | null; error: string | null }> {
  if (!config.enabled) {
    return { entity: null, error: null };
  }

  try {
    const input: PersonCaptureInput = {
      name: contactData.displayName || contactData.name,
      phone: contactData.phone,
      email: contactData.email,
      relationship: contactData.relationship,
      context: contactData.notes,
    };

    const result = await resolvePerson(userId, input);

    // Record the mention if context provided
    if (context?.transcript && result.entity) {
      await createMention(userId, {
        entityId: result.entity.id,
        userId,
        transcript: context.transcript,
        sessionId: context.sessionId || 'migration',
        personaId: context.personaId || 'system',
        timestamp: new Date(),
        sentiment: 0,
        emotionalIntensity: 0,
        topics: [],
        facts: [],
        mentionType: 'reference' as MentionType,
      });
    }

    log.debug(
      {
        userId,
        sourceCollection,
        entityId: result.entity.id,
        isNew: result.isNew,
      },
      'Dual-write: Contact mirrored to entity store'
    );

    return { entity: result.entity, error: null };
  } catch (error) {
    const errorMsg = `Failed to mirror contact to entity store: ${error}`;
    log.warn({ userId, sourceCollection, error: String(error) }, errorMsg);

    if (!config.failSilent) {
      throw new Error(errorMsg);
    }

    return { entity: null, error: errorMsg };
  }
}

/**
 * Intercept a relationship network person write
 */
export async function interceptRelationshipNetworkWrite(
  userId: string,
  personData: {
    id?: string;
    name: string;
    type?: string;
    importance?: number;
    sentiment?: number;
    mentionCount?: number;
    context?: string[];
  },
  context?: Partial<CaptureContext>
): Promise<{ entity: Entity | null; error: string | null }> {
  if (!config.enabled) {
    return { entity: null, error: null };
  }

  try {
    const input: PersonCaptureInput = {
      name: personData.name,
      relationship: personData.type,
      context: personData.context?.join('. '),
    };

    const result = await resolvePerson(userId, input);

    // Record mention if we have context
    if (context?.transcript && result.entity) {
      await recordMention(userId, result.entity.id, {
        sentiment: personData.sentiment,
        topics: personData.context,
      });
    }

    log.debug(
      {
        userId,
        name: personData.name,
        entityId: result.entity.id,
        isNew: result.isNew,
      },
      'Dual-write: Relationship network person mirrored'
    );

    return { entity: result.entity, error: null };
  } catch (error) {
    const errorMsg = `Failed to mirror relationship network person: ${error}`;
    log.warn({ userId, name: personData.name, error: String(error) }, errorMsg);

    if (!config.failSilent) {
      throw new Error(errorMsg);
    }

    return { entity: null, error: errorMsg };
  }
}

/**
 * Intercept a commitment write and create commitment entity
 */
export async function interceptCommitmentWrite(
  userId: string,
  commitmentData: {
    id?: string;
    content: string;
    type?: 'promise' | 'intention' | 'decision' | 'goal';
    status?: 'active' | 'completed' | 'abandoned' | 'deferred';
    targetDate?: Date;
    relatedPeople?: string[];
  },
  context?: Partial<CaptureContext>
): Promise<{ entity: Entity | null; error: string | null }> {
  if (!config.enabled) {
    return { entity: null, error: null };
  }

  try {
    const { createEntity } = await import('./storage.js');
    const now = new Date();

    const entity = await createEntity(userId, {
      userId,
      type: 'commitment',
      canonicalName: commitmentData.content.slice(0, 100),
      aliases: [],
      searchTokens: commitmentData.content.toLowerCase().split(/\s+/).filter(t => t.length > 2),
      embedding: [],
      firstSeen: now,
      lastSeen: now,
      firstMentioned: now,
      lastMentioned: now,
      mentionCount: 1,
      salienceScore: 0.7,
      emotionalWeight: 0.5,
      importance: 0.7,
      emotionalSalience: 0.5,
      recencyBoost: 1.0,
      temporalContext: {
        peakMoments: [],
        emotionalDecayResistance: 1.0,
      },
      attributes: {
        _type: 'commitment',
        commitmentType: commitmentData.type || 'intention',
        status: commitmentData.status || 'active',
        targetDate: commitmentData.targetDate,
        relatedPeople: commitmentData.relatedPeople || [],
        accountability: 'self',
        originalStatement: commitmentData.content,
      },
      properties: {},
      sourceConversations: context?.conversationId ? [context.conversationId] : [],
      sourcePersonas: context?.personaId ? [context.personaId] : [],
      confidence: 0.8,
      createdAt: now,
      updatedAt: now,
    });

    // Create relationships to related people
    if (commitmentData.relatedPeople && commitmentData.relatedPeople.length > 0) {
      for (const personId of commitmentData.relatedPeople) {
        await upsertRelationship(userId, {
          fromEntity: entity.id,
          toEntity: personId,
          type: 'involves' as EdgeType,
          strength: 0.7,
          firstLinked: now,
          lastReinforced: now,
          reinforcementCount: 1,
          bidirectional: false,
        });
      }
    }

    log.debug(
      { userId, entityId: entity.id, content: commitmentData.content.slice(0, 50) },
      'Dual-write: Commitment mirrored to entity store'
    );

    return { entity, error: null };
  } catch (error) {
    const errorMsg = `Failed to mirror commitment: ${error}`;
    log.warn({ userId, error: String(error) }, errorMsg);

    if (!config.failSilent) {
      throw new Error(errorMsg);
    }

    return { entity: null, error: errorMsg };
  }
}

/**
 * Intercept a dream write and create dream entity
 */
export async function interceptDreamWrite(
  userId: string,
  dreamData: {
    id?: string;
    content: string;
    category?: string;
    status?: string;
    motivation?: string;
    obstacles?: string[];
  },
  context?: Partial<CaptureContext>
): Promise<{ entity: Entity | null; error: string | null }> {
  if (!config.enabled) {
    return { entity: null, error: null };
  }

  try {
    const { createEntity } = await import('./storage.js');
    const now = new Date();

    const entity = await createEntity(userId, {
      userId,
      type: 'dream',
      canonicalName: dreamData.content.slice(0, 100),
      aliases: [],
      searchTokens: dreamData.content.toLowerCase().split(/\s+/).filter(t => t.length > 2),
      embedding: [],
      firstSeen: now,
      lastSeen: now,
      firstMentioned: now,
      lastMentioned: now,
      mentionCount: 1,
      salienceScore: 0.6,
      emotionalWeight: 0.7,
      importance: 0.6,
      emotionalSalience: 0.7,
      recencyBoost: 1.0,
      temporalContext: {
        peakMoments: [],
        emotionalDecayResistance: 1.2, // Dreams decay slower
      },
      attributes: {
        _type: 'dream',
        dreamCategory: (dreamData.category as 'career' | 'family' | 'creative' | 'travel' | 'lifestyle' | 'learning' | 'other') || 'other',
        status: (dreamData.status as 'active_pursuit' | 'someday' | 'back_burner' | 'achieved' | 'abandoned') || 'someday',
        underlyingMotivation: dreamData.motivation,
        obstacles: dreamData.obstacles,
      },
      properties: {},
      sourceConversations: context?.conversationId ? [context.conversationId] : [],
      sourcePersonas: context?.personaId ? [context.personaId] : [],
      confidence: 0.75,
      createdAt: now,
      updatedAt: now,
    });

    log.debug(
      { userId, entityId: entity.id, content: dreamData.content.slice(0, 50) },
      'Dual-write: Dream mirrored to entity store'
    );

    return { entity, error: null };
  } catch (error) {
    const errorMsg = `Failed to mirror dream: ${error}`;
    log.warn({ userId, error: String(error) }, errorMsg);

    if (!config.failSilent) {
      throw new Error(errorMsg);
    }

    return { entity: null, error: errorMsg };
  }
}

/**
 * Intercept a value write and create value entity
 */
export async function interceptValueWrite(
  userId: string,
  valueData: {
    id?: string;
    value: string;
    category?: string;
    strength?: string;
    demonstrations?: string[];
  },
  context?: Partial<CaptureContext>
): Promise<{ entity: Entity | null; error: string | null }> {
  if (!config.enabled) {
    return { entity: null, error: null };
  }

  try {
    const { createEntity } = await import('./storage.js');
    const now = new Date();

    const entity = await createEntity(userId, {
      userId,
      type: 'value',
      canonicalName: valueData.value,
      aliases: [],
      searchTokens: valueData.value.toLowerCase().split(/\s+/).filter(t => t.length > 2),
      embedding: [],
      firstSeen: now,
      lastSeen: now,
      firstMentioned: now,
      lastMentioned: now,
      mentionCount: 1,
      salienceScore: 0.8, // Values are generally important
      emotionalWeight: 0.6,
      importance: 0.8,
      emotionalSalience: 0.6,
      recencyBoost: 1.0,
      temporalContext: {
        peakMoments: [],
        emotionalDecayResistance: 1.5, // Values decay very slowly
      },
      attributes: {
        _type: 'value',
        valueCategory: (valueData.category as 'family' | 'career' | 'health' | 'relationships' | 'growth' | 'creativity' | 'security' | 'freedom' | 'other') || 'other',
        strength: (valueData.strength as 'mentioned' | 'evident' | 'core_identity') || 'mentioned',
        demonstrations: valueData.demonstrations,
      },
      properties: {},
      sourceConversations: context?.conversationId ? [context.conversationId] : [],
      sourcePersonas: context?.personaId ? [context.personaId] : [],
      confidence: 0.7,
      createdAt: now,
      updatedAt: now,
    });

    log.debug(
      { userId, entityId: entity.id, value: valueData.value },
      'Dual-write: Value mirrored to entity store'
    );

    return { entity, error: null };
  } catch (error) {
    const errorMsg = `Failed to mirror value: ${error}`;
    log.warn({ userId, error: String(error) }, errorMsg);

    if (!config.failSilent) {
      throw new Error(errorMsg);
    }

    return { entity: null, error: errorMsg };
  }
}

// ============================================================================
// BATCH DUAL-WRITE
// ============================================================================

interface DualWriteResult {
  successful: number;
  failed: number;
  errors: string[];
}

/**
 * Batch intercept multiple contacts
 */
export async function batchInterceptContacts(
  userId: string,
  contacts: Array<{
    id?: string;
    displayName?: string;
    name?: string;
    phone?: string;
    email?: string;
    relationship?: string;
  }>,
  sourceCollection: string
): Promise<DualWriteResult> {
  const result: DualWriteResult = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  for (const contact of contacts) {
    const { entity, error } = await interceptContactWrite(userId, contact, sourceCollection);
    if (entity) {
      result.successful++;
    } else {
      result.failed++;
      if (error) result.errors.push(error);
    }
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { DualWriteConfig, CollectionMigrationStatus, DualWriteResult };
