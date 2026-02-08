/**
 * Knowledge Capture Service
 *
 * Real-time capture of entities, facts, and relationships from conversation.
 * This is the "ears" of the knowledge graph - everything the user says gets
 * processed here to build their personal knowledge graph.
 *
 * Flow:
 * 1. User speaks
 * 2. Turn processor calls captureTurn()
 * 3. LLM extracts entities, facts, relationships
 * 4. Entity resolver resolves/creates entities
 * 5. Storage layer persists everything
 * 6. Knowledge graph grows smarter
 *
 * @module memory/knowledge-graph/services/knowledge-capture
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  extractEntities,
  extractFacts,
  extractRelationships,
  type ExtractedEntity,
  type ExtractionContext,
} from '../extractors/index.js';

const log = createLogger({ module: 'KnowledgeCaptureService' });

// ============================================================================
// TYPES
// ============================================================================

export interface TurnCaptureInput {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Turn number in conversation */
  turnNumber: number;
  /** User's message transcript */
  transcript: string;
  /** Active persona ID */
  personaId?: string;
  /** Detected emotion */
  emotion?: {
    primary?: string;
    intensity?: number;
    valence?: number;
  };
  /** Current topic */
  topic?: string;
  /** Recent conversation context (for disambiguation) */
  recentContext?: string;
}

export interface CaptureResult {
  /** Entities created or updated */
  entities: {
    created: number;
    updated: number;
    resolved: Array<{ id: string; name: string; isNew: boolean }>;
  };
  /** Facts extracted */
  facts: {
    count: number;
    entityIds: string[];
  };
  /** Relationships extracted */
  relationships: {
    count: number;
  };
  /** Processing metrics */
  metrics: {
    totalTimeMs: number;
    extractionTimeMs: number;
    storageTimeMs: number;
  };
}

// ============================================================================
// SERVICE STATE
// ============================================================================

let isInitialized = false;
let captureEnabled = true;
let entityStoreReady = false;
let initializationAttempted = false;

// Rate limiting
const recentCaptures = new Map<string, number>(); // userId -> lastCaptureTime
const MIN_CAPTURE_INTERVAL_MS = 500; // Don't capture more than 2x per second per user

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Initialize the knowledge capture service
 *
 * MEMORY FIX: Now continues even if entity store isn't ready.
 * Extraction will still run (for logging/metrics), just won't persist to entity store.
 * This ensures we capture knowledge even in degraded mode.
 */
export async function initializeKnowledgeCapture(): Promise<void> {
  if (isInitialized) {
    log.debug('🧠 [MEMORY-AUDIT] Knowledge capture already initialized');
    return;
  }

  initializationAttempted = true;
  log.info('🧠 [MEMORY-AUDIT] Initializing knowledge capture service...');

  try {
    // Check entity store availability (but don't fail if not ready)
    const { isEntityStoreReady, initializeEntityStore } =
      await import('../../entity-store/integration.js');

    // Try to initialize entity store
    try {
      await initializeEntityStore();
      entityStoreReady = isEntityStoreReady();
      log.info({ entityStoreReady }, '🧠 [MEMORY-AUDIT] Entity store status checked');
    } catch (entityStoreErr) {
      log.warn(
        { error: String(entityStoreErr) },
        '🧠 [MEMORY-AUDIT] Entity store init failed (will continue with extraction-only mode)'
      );
      entityStoreReady = false;
    }

    // IMPORTANT: Mark as initialized even if entity store isn't ready
    // This allows extraction to run (for deep extraction worker)
    isInitialized = true;

    log.info(
      { isInitialized, entityStoreReady, captureEnabled },
      '🧠 [MEMORY-AUDIT] Knowledge capture service initialized successfully'
    );
  } catch (error) {
    // Even on error, mark as initialized to prevent blocking
    isInitialized = true;
    log.error(
      { error: String(error), isInitialized, entityStoreReady },
      '🧠 [MEMORY-AUDIT] Knowledge capture initialization had errors but continuing'
    );
  }
}

/**
 * Enable or disable knowledge capture
 */
export function setKnowledgeCaptureEnabled(enabled: boolean): void {
  captureEnabled = enabled;
  log.info(
    { enabled, isInitialized, entityStoreReady },
    '🧠 [MEMORY-AUDIT] Knowledge capture enabled state changed'
  );
}

/**
 * Check if knowledge capture is ready
 *
 * MEMORY FIX: Now returns true as long as:
 * - Initialization was attempted (even if it had errors)
 * - Capture is enabled
 *
 * Entity store not being ready just means we won't persist, but extraction still runs.
 */
export function isKnowledgeCaptureReady(): boolean {
  const ready = (isInitialized || initializationAttempted) && captureEnabled;

  // Log state periodically for debugging
  if (!ready) {
    log.debug(
      {
        isInitialized,
        initializationAttempted,
        captureEnabled,
        entityStoreReady,
        ready,
      },
      '🧠 [MEMORY-AUDIT] Knowledge capture readiness check returned false'
    );
  }

  return ready;
}

/**
 * Check if entity store is available for persistence
 */
export function isEntityStorePersistenceReady(): boolean {
  return entityStoreReady;
}

/**
 * Capture knowledge from a conversation turn
 *
 * This is the main entry point, called from the turn processor.
 *
 * MEMORY FIX: Now runs extraction even if entity store isn't ready.
 * Extraction results are logged and can trigger deep extraction worker.
 * Persistence only happens if entity store is available.
 */
export async function captureTurn(input: TurnCaptureInput): Promise<CaptureResult> {
  const startTime = Date.now();

  // Default result
  const result: CaptureResult = {
    entities: { created: 0, updated: 0, resolved: [] },
    facts: { count: 0, entityIds: [] },
    relationships: { count: 0 },
    metrics: { totalTimeMs: 0, extractionTimeMs: 0, storageTimeMs: 0 },
  };

  if (!captureEnabled) {
    log.debug({ userId: input.userId }, '🧠 [MEMORY-AUDIT] Capture disabled, skipping');
    return result;
  }

  // Rate limiting
  const lastCapture = recentCaptures.get(input.userId) || 0;
  if (Date.now() - lastCapture < MIN_CAPTURE_INTERVAL_MS) {
    log.debug({ userId: input.userId }, '🧠 [MEMORY-AUDIT] Skipping capture due to rate limit');
    return result;
  }
  recentCaptures.set(input.userId, Date.now());

  // Skip very short messages
  if (input.transcript.trim().length < 10) {
    log.debug(
      { userId: input.userId, length: input.transcript.trim().length },
      '🧠 [MEMORY-AUDIT] Skipping capture - message too short'
    );
    return result;
  }

  // Log that we're starting capture
  log.info(
    {
      userId: input.userId,
      sessionId: input.sessionId,
      turnNumber: input.turnNumber,
      transcriptLength: input.transcript.length,
      entityStoreReady,
    },
    '🧠 [MEMORY-AUDIT] Starting knowledge capture for turn'
  );

  try {
    const extractionStart = Date.now();

    // 1. Extract entities from transcript
    const extractionContext: ExtractionContext = {
      userId: input.userId,
      sessionId: input.sessionId,
      turnNumber: input.turnNumber,
      personaId: input.personaId,
      recentContext: input.recentContext,
    };

    const entityExtractionResult = await extractEntities(input.transcript, extractionContext);

    result.metrics.extractionTimeMs = Date.now() - extractionStart;

    // Log extraction results (even if we can't persist)
    log.info(
      {
        userId: input.userId,
        entitiesExtracted: entityExtractionResult.entities.length,
        extractionTimeMs: result.metrics.extractionTimeMs,
        entityNames: entityExtractionResult.entities.map((e) => e.name).slice(0, 5),
      },
      '🧠 [MEMORY-AUDIT] LLM entity extraction complete'
    );

    if (entityExtractionResult.entities.length === 0) {
      result.metrics.totalTimeMs = Date.now() - startTime;
      log.debug({ userId: input.userId }, '🧠 [MEMORY-AUDIT] No entities extracted from turn');
      return result;
    }

    // 2. Resolve entities to knowledge graph (create or match existing)
    // MEMORY FIX: Only persist if entity store is ready, but continue with extraction logging
    const storageStart = Date.now();

    const resolvedEntities: Array<{
      extracted: ExtractedEntity;
      id: string;
      name: string;
      isNew: boolean;
    }> = [];

    // Only attempt to resolve/persist if entity store is ready
    if (entityStoreReady) {
      const { resolvePerson } = await import('../../entity-store/entity-resolver.js');
      const { createMention, upsertRelationship } = await import('../../entity-store/storage.js');

      for (const extracted of entityExtractionResult.entities) {
        try {
          if (extracted.type === 'person') {
            // Person entities use specialized resolution (fuzzy matching, dedup)
            const resolved = await resolvePerson(input.userId, {
              name: extracted.name,
              relationship: extracted.relationship,
              phone: extracted.attributes.phone as string | undefined,
              email: extracted.attributes.email as string | undefined,
            });

            resolvedEntities.push({
              extracted,
              id: resolved.entity.id,
              name: resolved.entity.canonicalName,
              isNew: resolved.isNew,
            });

            result.entities.resolved.push({
              id: resolved.entity.id,
              name: resolved.entity.canonicalName,
              isNew: resolved.isNew,
            });

            if (resolved.isNew) {
              result.entities.created++;
            } else {
              result.entities.updated++;
            }
          } else {
            // Non-person entities (place, event, goal, concept, etc.)
            // Use generic entity creation via entity store
            const { createEntity: createEntityStorage } =
              await import('../../entity-store/storage.js');
            const { createEntity: buildEntity } = await import('../../entity-store/types.js');

            // Map extracted type to valid EntityType, defaulting to 'topic' for unknown
            const typeMap: Record<string, string> = {
              place: 'place',
              event: 'event',
              goal: 'goal',
              concept: 'concept',
              thing: 'topic', // 'thing' maps to 'topic' in entity store
              organization: 'topic',
            };
            const entityType = (typeMap[extracted.type] || 'topic') as
              | 'place'
              | 'event'
              | 'goal'
              | 'concept'
              | 'topic';
            // Build non-person entity with minimal required fields
            const entityData = buildEntity(input.userId, entityType, extracted.name, {
              _type: entityType,
            } as Parameters<typeof buildEntity>[3]);

            // createEntity expects Omit<Entity, 'id'>, embedding is generated lazily
            const entity = await createEntityStorage(input.userId, {
              ...entityData,
              embedding: [], // Empty — will be populated by background indexer
            } as Omit<Awaited<ReturnType<typeof createEntityStorage>>, 'id'>);

            resolvedEntities.push({
              extracted,
              id: entity.id,
              name: entity.canonicalName,
              isNew: true,
            });

            result.entities.resolved.push({
              id: entity.id,
              name: entity.canonicalName,
              isNew: true,
            });

            result.entities.created++;

            log.debug(
              { entityType, name: extracted.name, id: entity.id },
              '🧠 [MEMORY] Created non-person entity'
            );
          }
        } catch (error) {
          log.warn(
            { error: String(error), entityName: extracted.name },
            '🧠 [MEMORY] Failed to resolve entity'
          );
        }
      }
    } else {
      // Entity store not ready - log what we would have captured
      log.info(
        {
          userId: input.userId,
          entitiesFound: entityExtractionResult.entities.length,
          entityNames: entityExtractionResult.entities.map((e) => ({ name: e.name, type: e.type })),
          reason: 'entity_store_not_ready',
        },
        '🧠 [MEMORY-AUDIT] Extracted entities but cannot persist (entity store not ready)'
      );

      // Still emit for deep extraction worker even without persistence
      // The deep extraction worker can persist to its own collections
    }

    // 3. Extract facts about resolved entities AND create mentions with facts
    // MEMORY FIX: Only persist if entity store is ready
    if (resolvedEntities.length > 0 && entityStoreReady) {
      // Import storage functions for persistence
      const { createMention, upsertRelationship } = await import('../../entity-store/storage.js');

      let extractedFacts: Array<{
        entityId?: string;
        type: string;
        key: string;
        value: string;
        confidence: number;
      }> = [];

      // First, extract facts
      try {
        const factResult = await extractFacts({
          transcript: input.transcript,
          knownEntities: resolvedEntities.map((e) => ({
            id: e.id,
            name: e.name,
            type: e.extracted.type,
          })),
          userId: input.userId,
          sessionId: input.sessionId,
        });

        extractedFacts = factResult.facts;
        result.facts.count = factResult.facts.length;
        result.facts.entityIds = [
          ...new Set(factResult.facts.map((f) => f.entityId).filter(Boolean) as string[]),
        ];
      } catch (error) {
        log.warn({ error: String(error) }, 'Fact extraction failed');
      }

      // Now create mentions for each resolved entity WITH their facts
      for (const resolved of resolvedEntities) {
        try {
          // Get facts specific to this entity
          const entityFacts = extractedFacts.filter((f) => f.entityId === resolved.id);

          await createMention(input.userId, {
            userId: input.userId,
            entityId: resolved.id,
            sessionId: input.sessionId,
            personaId: input.personaId || 'ferni',
            timestamp: new Date(),
            transcript: resolved.extracted.sourceText || input.transcript,
            mentionType: resolved.isNew ? 'reference' : 'reference',
            sentiment: input.emotion?.valence || 0,
            emotionalIntensity: input.emotion?.intensity || 0.5,
            topics: input.topic ? [input.topic] : [],
            facts: entityFacts.map((f) => ({
              type: f.type as 'attribute' | 'event' | 'relationship' | 'state',
              key: f.key,
              value: f.value,
              confidence: f.confidence,
              entityId: f.entityId,
            })),
          });

          log.debug(
            { entityId: resolved.id, factsCount: entityFacts.length },
            'Created mention with facts'
          );
        } catch (error) {
          log.warn({ error: String(error), entityId: resolved.id }, 'Failed to create mention');
        }
      }

      // 4. Extract relationships between entities
      if (resolvedEntities.length >= 2) {
        try {
          const relationshipResult = await extractRelationships({
            transcript: input.transcript,
            knownEntities: resolvedEntities.map((e) => ({
              id: e.id,
              name: e.name,
              type: e.extracted.type,
            })),
            userId: input.userId,
            sessionId: input.sessionId,
          });

          result.relationships.count = relationshipResult.relationships.length;

          // Store relationships
          for (const rel of relationshipResult.relationships) {
            try {
              await upsertRelationship(input.userId, {
                fromEntity: rel.fromEntityId,
                toEntity: rel.toEntityId,
                type: rel.type as import('../../entity-store/types.js').EdgeType,
                label: rel.label,
                strength: rel.confidence,
                bidirectional: [
                  'family_of',
                  'friend_of',
                  'works_with',
                  'romantic_with',
                  'knows',
                ].includes(rel.type),
                firstLinked: new Date(),
                lastReinforced: new Date(),
                reinforcementCount: 1,
              });
            } catch (error) {
              log.warn({ error: String(error) }, 'Failed to store relationship');
            }
          }
        } catch (error) {
          log.warn({ error: String(error) }, 'Relationship extraction failed');
        }
      }
    } else if (resolvedEntities.length > 0 && !entityStoreReady) {
      // Entity store not ready - just log fact extraction would happen
      log.info(
        { userId: input.userId, entitiesCount: resolvedEntities.length },
        '🧠 [MEMORY-AUDIT] Skipping fact/mention persistence (entity store not ready)'
      );
    }

    result.metrics.storageTimeMs = Date.now() - storageStart;
    result.metrics.totalTimeMs = Date.now() - startTime;

    // Use info level for successful captures to ensure visibility
    log.info(
      {
        userId: input.userId,
        sessionId: input.sessionId,
        turnNumber: input.turnNumber,
        entitiesCreated: result.entities.created,
        entitiesUpdated: result.entities.updated,
        factsCount: result.facts.count,
        relationshipsCount: result.relationships.count,
        totalTimeMs: result.metrics.totalTimeMs,
        entityStoreReady,
      },
      '🧠 [MEMORY-AUDIT] Knowledge capture complete'
    );

    return result;
  } catch (error) {
    log.error(
      {
        error: String(error),
        userId: input.userId,
        sessionId: input.sessionId,
        entityStoreReady,
      },
      '🧠 [MEMORY-AUDIT] Knowledge capture failed'
    );
    result.metrics.totalTimeMs = Date.now() - startTime;
    return result;
  }
}

/**
 * Batch capture for processing multiple turns (e.g., importing history)
 */
export async function captureBatch(inputs: TurnCaptureInput[]): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  for (const input of inputs) {
    const result = await captureTurn(input);
    results.push(result);

    // Small delay between captures to avoid overwhelming the system
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

// NOTE: TurnCaptureInput and CaptureResult are already exported above with their interface declarations
