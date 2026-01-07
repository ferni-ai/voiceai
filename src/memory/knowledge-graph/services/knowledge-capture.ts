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

// Rate limiting
const recentCaptures = new Map<string, number>(); // userId -> lastCaptureTime
const MIN_CAPTURE_INTERVAL_MS = 500; // Don't capture more than 2x per second per user

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Initialize the knowledge capture service
 */
export async function initializeKnowledgeCapture(): Promise<void> {
  if (isInitialized) return;

  try {
    // Verify entity store is available
    const { isEntityStoreReady } = await import('../../entity-store/integration.js');
    if (!isEntityStoreReady()) {
      log.warn('Entity store not ready, knowledge capture will be limited');
    }

    isInitialized = true;
    log.info('Knowledge capture service initialized');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize knowledge capture');
  }
}

/**
 * Enable or disable knowledge capture
 */
export function setKnowledgeCaptureEnabled(enabled: boolean): void {
  captureEnabled = enabled;
  log.info({ enabled }, 'Knowledge capture enabled state changed');
}

/**
 * Check if knowledge capture is ready
 */
export function isKnowledgeCaptureReady(): boolean {
  return isInitialized && captureEnabled;
}

/**
 * Capture knowledge from a conversation turn
 *
 * This is the main entry point, called from the turn processor.
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
    return result;
  }

  // Rate limiting
  const lastCapture = recentCaptures.get(input.userId) || 0;
  if (Date.now() - lastCapture < MIN_CAPTURE_INTERVAL_MS) {
    log.debug({ userId: input.userId }, 'Skipping capture due to rate limit');
    return result;
  }
  recentCaptures.set(input.userId, Date.now());

  // Skip very short messages
  if (input.transcript.trim().length < 10) {
    return result;
  }

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

    if (entityExtractionResult.entities.length === 0) {
      result.metrics.totalTimeMs = Date.now() - startTime;
      return result;
    }

    // 2. Resolve entities to knowledge graph (create or match existing)
    const storageStart = Date.now();

    const { resolvePerson } = await import('../../entity-store/entity-resolver.js');
    const { createMention, upsertRelationship } = await import('../../entity-store/storage.js');

    const resolvedEntities: Array<{
      extracted: ExtractedEntity;
      id: string;
      name: string;
      isNew: boolean;
    }> = [];

    for (const extracted of entityExtractionResult.entities) {
      try {
        if (extracted.type === 'person') {
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
          // Note: Mention creation moved to after fact extraction so facts can be included
        }
        // TODO: Handle other entity types (place, event, goal, etc.)
      } catch (error) {
        log.warn(
          { error: String(error), entityName: extracted.name },
          'Failed to resolve entity'
        );
      }
    }

    // 3. Extract facts about resolved entities AND create mentions with facts
    if (resolvedEntities.length > 0) {
      let extractedFacts: Array<{ entityId?: string; type: string; key: string; value: string; confidence: number }> = [];

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
        result.facts.entityIds = [...new Set(factResult.facts.map((f) => f.entityId).filter(Boolean) as string[])];
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
          log.warn(
            { error: String(error), entityId: resolved.id },
            'Failed to create mention'
          );
        }
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
              id: '', // Will be generated
              userId: input.userId,
              fromEntityId: rel.fromEntityId,
              toEntityId: rel.toEntityId,
              type: rel.type,
              label: rel.label,
              strength: rel.confidence,
              sentiment: rel.sentiment || 0,
              bidirectional: ['family_of', 'friend_of', 'works_with', 'romantic_with', 'knows'].includes(rel.type),
              createdAt: new Date(),
              updatedAt: new Date(),
              lastMentionedAt: new Date(),
              mentionCount: 1,
            });
          } catch (error) {
            log.warn({ error: String(error) }, 'Failed to store relationship');
          }
        }
      } catch (error) {
        log.warn({ error: String(error) }, 'Relationship extraction failed');
      }
    }

    result.metrics.storageTimeMs = Date.now() - storageStart;
    result.metrics.totalTimeMs = Date.now() - startTime;

    log.debug(
      {
        userId: input.userId,
        entitiesCreated: result.entities.created,
        entitiesUpdated: result.entities.updated,
        factsCount: result.facts.count,
        relationshipsCount: result.relationships.count,
        totalTimeMs: result.metrics.totalTimeMs,
      },
      'Knowledge captured from turn'
    );

    return result;
  } catch (error) {
    log.error(
      { error: String(error), userId: input.userId },
      'Knowledge capture failed'
    );
    result.metrics.totalTimeMs = Date.now() - startTime;
    return result;
  }
}

/**
 * Batch capture for processing multiple turns (e.g., importing history)
 */
export async function captureBatch(
  inputs: TurnCaptureInput[]
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];

  for (const input of inputs) {
    const result = await captureTurn(input);
    results.push(result);

    // Small delay between captures to avoid overwhelming the system
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { TurnCaptureInput, CaptureResult };
