/**
 * Deep Extraction Worker - Async LLM-powered memory extraction
 *
 * Implements state-of-the-art memory extraction patterns:
 * - Mem0: Entity + relationship extraction
 * - ProMem: Self-questioning refinement
 * - HiMem: Hierarchical categorization
 *
 * Runs in background, never blocks conversation.
 *
 * @see docs/architecture/DYNAMIC-MEMORY-ARCHITECTURE.md
 */

import { safeOnEvent } from './async-events-config.js';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  EntityMention,
  EmotionSignal,
  DateSignal,
  RelationshipSignal,
} from './fast-capture.js';
// 🧠 MEMORY FIX: Import vector store for semantic search capability
import { getFirestoreVectorStore } from '../firestore-vector-store/index.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { buildExtractionFirestoreWritePayloads } from './extraction-firestore-docs.js';
import { buildExtractionVectorDocuments } from './extraction-vector-docs.js';
import { getMemoryMetricsCollector } from '../memory-metrics.js';
import { createDeepExtractionBatcher } from './deep-extraction-batch.js';
import type { DeepExtractionBatchOptions } from './deep-extraction-batch.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DeepExtractionJob {
  jobId: string;
  userId: string;
  sessionId: string;
  turnNumber: number;
  transcript: string;
  timestamp: Date;
  personaId?: string;
  priority: 'high' | 'normal' | 'low';
  fastCaptureHints: {
    mentionedEntities: EntityMention[];
    emotionSignals: EmotionSignal[];
    topicHints: string[];
    dateSignals: DateSignal[];
    relationshipSignals: RelationshipSignal[];
  };
}

export interface ExtractedEntity {
  name: string;
  type: 'person' | 'place' | 'organization' | 'event' | 'concept' | 'thing';
  attributes: Record<string, string>;
  confidence: number;
}

export interface ExtractedFact {
  entityName: string;
  factType: 'attribute' | 'event' | 'relationship' | 'state' | 'preference';
  key: string;
  value: string;
  confidence: number;
  temporalContext?: string;
}

export interface ExtractedRelationship {
  source: string;
  target: string;
  type: string;
  strength: number;
  bidirectional: boolean;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  relationships: ExtractedRelationship[];
  categories: string[];
  importanceScore: number;
  shouldPersist: boolean;
}

/**
 * Stats for the deep extraction worker (Jan 2026)
 */
export interface ExtractionStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  avgExtractionTimeMs: number;
  totalEntitiesExtracted: number;
  totalFactsExtracted: number;
}

// ============================================================================
// LLM EXTRACTION PROMPTS
// ============================================================================

const ENTITY_EXTRACTION_PROMPT = `You are an expert at identifying entities (people, places, events, concepts) in conversation.

Given this transcript from a personal conversation, extract all meaningful entities.

For each entity, determine:
1. name: The entity's name or description
2. type: person, place, organization, event, concept, or thing
3. attributes: Any properties mentioned (e.g., role, location, date)
4. confidence: 0-1 how confident you are

Focus on entities that matter for personal memory - people in the user's life, places they go, events happening.

Return JSON array of entities.`;

const FACT_EXTRACTION_PROMPT = `You are extracting factual information that should be remembered about entities.

Given entities and transcript, extract NEW FACTS learned about each entity.

Fact types:
- attribute: A property (birthday, job, location)
- event: Something that happened or will happen
- relationship: How entities relate
- state: Current situation
- preference: Likes, dislikes, preferences

Only extract facts explicitly stated or strongly implied. Be conservative.

Return JSON array with: entityName, factType, key, value, confidence, temporalContext.`;

const RELATIONSHIP_EXTRACTION_PROMPT = `You are mapping relationships between entities mentioned in conversation.

Types of relationships:
- family (parent, sibling, spouse, child)
- social (friend, neighbor, acquaintance)  
- professional (colleague, boss, client)
- romantic (partner, ex, dating)
- other

For each relationship, determine:
- source: First entity name
- target: Second entity name
- type: Relationship category
- strength: 0-1 (how close/important)
- bidirectional: Is it mutual?

Return JSON array of relationships.`;

const SELF_QUESTIONING_PROMPT = `You are refining memory extraction through self-questioning.

Given the current extraction results, answer these questions:

1. MISSING ENTITIES: What entities might have been missed? Look for:
   - Pronouns that refer to specific people ("he", "she", "they")
   - Implicit references ("the doctor", "my neighbor")
   - Places or events mentioned in passing

2. IMPLICIT FACTS: What facts are implied but not extracted?
   - Emotional states from context
   - Time relationships
   - Cause-effect relationships

3. RELATIONSHIP GAPS: What relationships are implied?
   - If A knows B and B knows C, might A know C?
   - Professional relationships from context
   - Social connections

4. CONTRADICTIONS: Does anything contradict what we already know?

5. IMPORTANCE: What here is most worth remembering long-term?

Return refined extraction with any additions.`;

// ============================================================================
// WORKER IMPLEMENTATION
// ============================================================================

/**
 * Deep Extraction Worker
 *
 * Standalone worker that processes LLM extraction jobs from the async event queue.
 * Does not extend LocalWorker to avoid Pub/Sub dependency.
 */
const MAX_QUEUE_SIZE = 1000;

export class DeepExtractionWorker {
  private log = createLogger({ module: 'DeepExtractionWorker' });
  private jobQueue: DeepExtractionJob[] = [];
  private isProcessing = false;
  private running = false;
  private eventListenerCleanup: (() => void) | null = null;
  private batcher: ReturnType<typeof createDeepExtractionBatcher>;
  private extractionStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    avgExtractionTimeMs: 0,
    totalEntitiesExtracted: 0,
    totalFactsExtracted: 0,
  };

  constructor(options: DeepExtractionBatchOptions = {}) {
    this.batcher = createDeepExtractionBatcher((job) => this.enqueue(job), options);
  }

  /**
   * Start the worker and begin processing jobs
   */
  start(): void {
    if (this.running) {
      this.log.warn('🧠 [MEMORY-AUDIT] Deep extraction worker already running');
      return;
    }

    this.running = true;
    this.setupEventListener();
    this.log.info(
      '🧠 [MEMORY-AUDIT] Deep extraction worker started - ready to process memory jobs'
    );
  }

  /**
   * Stop the worker
   */
  stop(): void {
    this.batcher.flushAll(); // don't drop turns still waiting for their batch
    this.running = false;
    if (this.eventListenerCleanup) {
      this.eventListenerCleanup();
      this.eventListenerCleanup = null;
    }
    this.log.info('🧠 [MEMORY-AUDIT] Deep extraction worker stopped');
  }

  private setupEventListener(): void {
    // Listen for deep extraction events via DI wrapper (avoids layer violation)
    const listener = (job: unknown) => {
      const { jobId, userId } = (job ?? {}) as Partial<DeepExtractionJob>;
      this.log.info({ jobId, userId }, '🧠 [MEMORY-AUDIT] Received deep extraction job');
      if (this.running) this.batcher.add(job as DeepExtractionJob);
      else this.log.warn('🧠 [MEMORY-AUDIT] Received job but worker not running');
    };
    const registered = safeOnEvent('memory:deep-extraction', listener);

    if (registered) {
      // Store cleanup function to remove the listener on stop()
      this.eventListenerCleanup = () => {
        try {
          // safeOnEvent wraps EventEmitter - attempt to remove the listener
          const { getAsyncEvents } = require('./async-events-config.js');
          const emitter = getAsyncEvents?.();
          if (emitter?.removeListener) {
            emitter.removeListener('memory:deep-extraction', listener);
          }
        } catch {
          // Best-effort cleanup
        }
      };
    }

    if (!registered) {
      this.log.warn(
        '🧠 [MEMORY-AUDIT] AsyncEvents not configured - deep extraction will not receive jobs'
      );
      this.log.warn(
        '🧠 [MEMORY-AUDIT] Ensure configureAsyncEvents() is called in global-services.ts'
      );
    } else {
      this.log.info('🧠 [MEMORY-AUDIT] Event listener registered for memory:deep-extraction');
    }
  }

  /**
   * Get health status for monitoring
   */
  getHealthStatus(): {
    running: boolean;
    queueDepth: number;
    isProcessing: boolean;
    stats: ExtractionStats;
  } {
    return {
      running: this.running,
      queueDepth: this.jobQueue.length,
      isProcessing: this.isProcessing,
      stats: { ...this.extractionStats },
    };
  }

  private enqueue(job: DeepExtractionJob): void {
    // Enforce queue size limit to prevent unbounded memory growth
    if (this.jobQueue.length >= MAX_QUEUE_SIZE) {
      const dropped = this.jobQueue.shift();
      this.log.warn(
        { droppedJobId: dropped?.jobId, queueSize: MAX_QUEUE_SIZE },
        '🧠 [MEMORY-AUDIT] Job queue full, dropping oldest job'
      );
    }

    // Priority queue: high priority jobs go first
    if (job.priority === 'high') {
      this.jobQueue.unshift(job);
    } else {
      this.jobQueue.push(job);
    }

    this.extractionStats.totalJobs++;
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.jobQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.jobQueue.length > 0) {
      const job = this.jobQueue.shift()!;

      try {
        await this.processJob(job);
        this.extractionStats.completedJobs++;
      } catch (error) {
        this.extractionStats.failedJobs++;
        this.log.error({ error: String(error), jobId: job.jobId }, 'Deep extraction failed');
      }
    }

    this.isProcessing = false;
  }

  private async processJob(job: DeepExtractionJob): Promise<void> {
    const startTime = Date.now();

    this.log.debug({ jobId: job.jobId, userId: job.userId }, 'Starting deep extraction');

    // 1. LLM Entity Extraction
    const entities = await this.extractEntities(job.transcript, job.fastCaptureHints);

    // 2. LLM Fact Extraction
    const facts = await this.extractFacts(job.transcript, entities);

    // 3. LLM Relationship Extraction
    const relationships = await this.extractRelationships(job.transcript, entities);

    // 4. Self-Questioning Refinement (ProMem pattern)
    const refined = await this.selfQuestionRefine({
      entities,
      facts,
      relationships,
      transcript: job.transcript,
    });

    // 5. Calculate importance
    const importanceScore = this.calculateImportance(refined, job.fastCaptureHints);

    // 6. Determine if worth persisting
    const shouldPersist =
      importanceScore > 0.3 || refined.entities.length > 0 || refined.facts.length > 0;

    // 7. Write to memory store
    if (shouldPersist) {
      await this.persistExtraction(
        job.userId,
        {
          ...refined,
          importanceScore,
          shouldPersist,
          categories: job.fastCaptureHints.topicHints,
        },
        job
      );
    }

    // Update stats
    const extractionTimeMs = Date.now() - startTime;
    // Avoid division by zero - use running average only when we have previous jobs
    if (this.extractionStats.completedJobs > 1) {
      this.extractionStats.avgExtractionTimeMs =
        (this.extractionStats.avgExtractionTimeMs * (this.extractionStats.completedJobs - 1) +
          extractionTimeMs) /
        this.extractionStats.completedJobs;
    } else {
      // First job - set the extraction time directly
      this.extractionStats.avgExtractionTimeMs = extractionTimeMs;
    }
    this.extractionStats.totalEntitiesExtracted += refined.entities.length;
    this.extractionStats.totalFactsExtracted += refined.facts.length;

    this.log.info(
      {
        jobId: job.jobId,
        extractionTimeMs,
        entityCount: refined.entities.length,
        factCount: refined.facts.length,
        relationshipCount: refined.relationships.length,
        importanceScore,
      },
      'Deep extraction complete'
    );
  }

  // ============================================================================
  // EXTRACTION METHODS
  // ============================================================================

  private async extractEntities(
    transcript: string,
    hints: DeepExtractionJob['fastCaptureHints']
  ): Promise<ExtractedEntity[]> {
    try {
      const model = await this.getGeminiModel();
      if (!model) {
        return this.fallbackEntityExtraction(transcript, hints);
      }

      const prompt = `${ENTITY_EXTRACTION_PROMPT}

Hints from fast extraction (may be incomplete):
- Detected entities: ${JSON.stringify(hints.mentionedEntities)}
- Topics: ${hints.topicHints.join(', ')}

Transcript:
"${transcript}"

Extract entities as JSON array:`;

      // @ts-expect-error - Gemini SDK types are dynamic
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return this.parseJsonArray<ExtractedEntity>(text);
    } catch (error) {
      this.log.warn({ error: String(error) }, 'LLM entity extraction failed, using fallback');
      return this.fallbackEntityExtraction(transcript, hints);
    }
  }

  private async extractFacts(
    transcript: string,
    entities: ExtractedEntity[]
  ): Promise<ExtractedFact[]> {
    if (entities.length === 0) {
      return [];
    }

    try {
      const model = await this.getGeminiModel();
      if (!model) {
        return [];
      }

      const entityList = entities.map((e) => `${e.name} (${e.type})`).join('\n');

      const prompt = `${FACT_EXTRACTION_PROMPT}

Entities found:
${entityList}

Transcript:
"${transcript}"

Extract facts as JSON array:`;

      // @ts-expect-error - Gemini SDK types are dynamic
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return this.parseJsonArray<ExtractedFact>(text);
    } catch (error) {
      this.log.warn({ error: String(error) }, 'LLM fact extraction failed');
      return [];
    }
  }

  private async extractRelationships(
    transcript: string,
    entities: ExtractedEntity[]
  ): Promise<ExtractedRelationship[]> {
    if (entities.length < 2) {
      return [];
    }

    try {
      const model = await this.getGeminiModel();
      if (!model) {
        return [];
      }

      const entityList = entities.map((e) => `${e.name} (${e.type})`).join('\n');

      const prompt = `${RELATIONSHIP_EXTRACTION_PROMPT}

Entities found:
${entityList}

Transcript:
"${transcript}"

Extract relationships as JSON array:`;

      // @ts-expect-error - Gemini SDK types are dynamic
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return this.parseJsonArray<ExtractedRelationship>(text);
    } catch (error) {
      this.log.warn({ error: String(error) }, 'LLM relationship extraction failed');
      return [];
    }
  }

  private async selfQuestionRefine(current: {
    entities: ExtractedEntity[];
    facts: ExtractedFact[];
    relationships: ExtractedRelationship[];
    transcript: string;
  }): Promise<{
    entities: ExtractedEntity[];
    facts: ExtractedFact[];
    relationships: ExtractedRelationship[];
  }> {
    try {
      const model = await this.getGeminiModel();
      if (!model) {
        return current;
      }

      const prompt = `${SELF_QUESTIONING_PROMPT}

Current extraction:
Entities: ${JSON.stringify(current.entities)}
Facts: ${JSON.stringify(current.facts)}
Relationships: ${JSON.stringify(current.relationships)}

Original transcript:
"${current.transcript}"

Return refined extraction as JSON with: entities, facts, relationships arrays:`;

      // @ts-expect-error - Gemini SDK types are dynamic
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      const refined = this.parseJson<{
        entities?: ExtractedEntity[];
        facts?: ExtractedFact[];
        relationships?: ExtractedRelationship[];
      }>(text);

      return {
        entities: refined?.entities || current.entities,
        facts: refined?.facts || current.facts,
        relationships: refined?.relationships || current.relationships,
      };
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Self-questioning refinement failed');
      return current;
    }
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private async persistExtraction(
    userId: string,
    result: ExtractionResult,
    job: DeepExtractionJob
  ): Promise<void> {
    try {
      // Import entity store dynamically
      const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
      const db = getFirestoreDb();
      if (!db) return;

      const batch = db.batch();
      const timestamp = new Date().toISOString();

      const payloads = buildExtractionFirestoreWritePayloads(
        userId,
        result,
        job,
        timestamp,
        this.log
      );

      const totalDropped =
        payloads.dropped.entities + payloads.dropped.facts + payloads.dropped.relationships;
      if (totalDropped > 0) {
        getMemoryMetricsCollector().recordExtractionDrop(totalDropped);
        this.log.debug(
          { userId, dropped: payloads.dropped },
          '🧠 [MEMORY-AUDIT] Dropped malformed extraction items before Firestore write'
        );
      }

      const userRoot = db.collection('bogle_users').doc(userId);

      for (const entityDoc of payloads.entities) {
        const entityRef = userRoot.collection('dynamic_entities').doc();
        batch.set(entityRef, entityDoc);
      }

      for (const factDoc of payloads.facts) {
        const factRef = userRoot.collection('dynamic_facts').doc();
        batch.set(factRef, factDoc);
      }

      for (const relDoc of payloads.relationships) {
        const relRef = userRoot.collection('dynamic_relationships').doc();
        batch.set(relRef, relDoc);
      }

      // Store extraction metadata
      const metaRef = db
        .collection('bogle_users')
        .doc(userId)
        .collection('extraction_history')
        .doc(job.jobId);

      batch.set(
        metaRef,
        cleanForFirestore({
          jobId: job.jobId,
          sessionId: job.sessionId,
          turnNumber: job.turnNumber,
          transcript: job.transcript.slice(0, 500),
          entityCount: payloads.entities.length,
          factCount: payloads.facts.length,
          relationshipCount: payloads.relationships.length,
          categories: result.categories,
          importanceScore: result.importanceScore,
          extractedAt: timestamp,
          droppedMalformed: totalDropped,
        })
      );

      await batch.commit();

      this.log.debug(
        {
          userId,
          entityCount: payloads.entities.length,
          factCount: payloads.facts.length,
        },
        'Persisted extraction results to Firestore'
      );

      // 🧠 MEMORY FIX: Also store in vector store for semantic search
      // This is the critical missing piece - without this, context builders return empty
      await this.persistToVectorStore(userId, result, job, timestamp);
    } catch (error) {
      this.log.error({ error: String(error), userId }, 'Failed to persist extraction');
    }
  }

  /**
   * Persist extracted entities and facts to the vector store for semantic search.
   * This enables "Better Than Human" memory - context builders can find relevant
   * memories by semantic similarity, not just exact match.
   *
   * 🧠 MEMORY FIX (January 2026): This was the missing link!
   * - Firestore collections stored raw data (worked)
   * - But vector store was empty (no semantic search possible)
   * - Context builders returned [] because nothing to search
   */
  private async persistToVectorStore(
    userId: string,
    result: ExtractionResult,
    job: DeepExtractionJob,
    timestampStr: string
  ): Promise<void> {
    try {
      const vectorStore = getFirestoreVectorStore();
      await vectorStore.initialize();

      const timestamp = new Date(timestampStr); // Convert ISO string to Date

      // Entities/facts/relationships are LLM JSON output — fields can be
      // missing or malformed. buildExtractionVectorDocuments validates each
      // item, sanitizes generated Firestore ids (free text can contain "/"),
      // and drops anything malformed rather than throwing.
      const vectorDocs = buildExtractionVectorDocuments(userId, result, job, timestamp, this.log);

      // Batch add to vector store (auto-generates embeddings)
      if (vectorDocs.length > 0) {
        await vectorStore.addDocuments(vectorDocs);

        this.log.info(
          {
            userId,
            vectorDocsAdded: vectorDocs.length,
            entities: result.entities.length,
            facts: result.facts.length,
            relationships: result.relationships.length,
          },
          '🧠 [MEMORY-AUDIT] Persisted to vector store for semantic search'
        );
      }
    } catch (error) {
      getMemoryMetricsCollector().recordVectorPersistWarn();
      this.log.warn(
        { error: String(error), userId },
        '🧠 [MEMORY-AUDIT] Failed to persist to vector store (non-blocking)'
      );
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getGeminiModel(): Promise<unknown | null> {
    try {
      const { getExtractionModel } = await import('../../config/gemini-config.js');
      const { getGenerativeModel } = await import('../../config/generative-model.js');
      return await getGenerativeModel({ model: getExtractionModel() });
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Gemini unavailable for deep extraction');
      return null;
    }
  }

  private parseJsonArray<T>(text: string): T[] {
    try {
      // Extract JSON array from response
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return [];
      return JSON.parse(match[0]) as T[];
    } catch {
      return [];
    }
  }

  private parseJson<T>(text: string): T | null {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }

  private fallbackEntityExtraction(
    _transcript: string,
    hints: DeepExtractionJob['fastCaptureHints']
  ): ExtractedEntity[] {
    // Convert fast capture hints to entities
    return hints.mentionedEntities.map((m) => ({
      name: m.name,
      type: m.type as ExtractedEntity['type'],
      attributes: {},
      confidence: m.confidence,
    }));
  }

  private calculateImportance(
    result: {
      entities: ExtractedEntity[];
      facts: ExtractedFact[];
      relationships: ExtractedRelationship[];
    },
    hints: DeepExtractionJob['fastCaptureHints']
  ): number {
    let score = 0;

    // Entity count
    score += Math.min(result.entities.length * 0.1, 0.3);

    // Fact count
    score += Math.min(result.facts.length * 0.1, 0.3);

    // Relationship count
    score += Math.min(result.relationships.length * 0.15, 0.2);

    // Emotional intensity
    const highEmotion = hints.emotionSignals.some((e) => e.intensity === 'high');
    if (highEmotion) score += 0.2;

    // Date signals (time-sensitive)
    if (hints.dateSignals.length > 0) score += 0.1;

    return Math.min(score, 1);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  public getStats(): ExtractionStats {
    return { ...this.extractionStats };
  }

  public getQueueDepth(): number {
    return this.jobQueue.length;
  }

  public isRunning(): boolean {
    return this.running;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let workerInstance: DeepExtractionWorker | null = null;

export function getDeepExtractionWorker(): DeepExtractionWorker {
  if (!workerInstance) {
    workerInstance = new DeepExtractionWorker();
  }
  return workerInstance;
}

export function startDeepExtractionWorker(): void {
  const worker = getDeepExtractionWorker();
  worker.start();
}
