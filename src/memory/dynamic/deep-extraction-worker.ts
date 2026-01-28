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
import type { VectorDocument } from '../vector-store-interface.js';

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
export class DeepExtractionWorker {
  private log = createLogger({ module: 'DeepExtractionWorker' });
  private jobQueue: DeepExtractionJob[] = [];
  private isProcessing = false;
  private running = false;
  private extractionStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    avgExtractionTimeMs: 0,
    totalEntitiesExtracted: 0,
    totalFactsExtracted: 0,
  };

  constructor() {
    // Don't auto-subscribe - wait for explicit start()
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
    this.running = false;
    this.log.info('🧠 [MEMORY-AUDIT] Deep extraction worker stopped');
  }

  private setupEventListener(): void {
    // Listen for deep extraction events via DI wrapper (avoids layer violation)
    const registered = safeOnEvent('memory:deep-extraction', (job: unknown) => {
      this.log.info(
        { jobId: (job as DeepExtractionJob)?.jobId, userId: (job as DeepExtractionJob)?.userId },
        '🧠 [MEMORY-AUDIT] Received deep extraction job'
      );
      if (this.running) {
        this.enqueue(job as DeepExtractionJob);
      } else {
        this.log.warn('🧠 [MEMORY-AUDIT] Received job but worker not running');
      }
    });

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

      // Store each entity
      for (const entity of result.entities) {
        const entityRef = db
          .collection('bogle_users')
          .doc(userId)
          .collection('dynamic_entities')
          .doc();

        batch.set(entityRef, {
          ...entity,
          extractedAt: timestamp,
          sessionId: job.sessionId,
          turnNumber: job.turnNumber,
          source: 'deep_extraction',
        });
      }

      // Store each fact
      for (const fact of result.facts) {
        const factRef = db.collection('bogle_users').doc(userId).collection('dynamic_facts').doc();

        batch.set(factRef, {
          ...fact,
          extractedAt: timestamp,
          sessionId: job.sessionId,
          turnNumber: job.turnNumber,
          source: 'deep_extraction',
        });
      }

      // Store each relationship
      for (const rel of result.relationships) {
        const relRef = db
          .collection('bogle_users')
          .doc(userId)
          .collection('dynamic_relationships')
          .doc();

        batch.set(relRef, {
          ...rel,
          extractedAt: timestamp,
          sessionId: job.sessionId,
          turnNumber: job.turnNumber,
          source: 'deep_extraction',
        });
      }

      // Store extraction metadata
      const metaRef = db
        .collection('bogle_users')
        .doc(userId)
        .collection('extraction_history')
        .doc(job.jobId);

      batch.set(metaRef, {
        jobId: job.jobId,
        sessionId: job.sessionId,
        turnNumber: job.turnNumber,
        transcript: job.transcript.slice(0, 500),
        entityCount: result.entities.length,
        factCount: result.facts.length,
        relationshipCount: result.relationships.length,
        categories: result.categories,
        importanceScore: result.importanceScore,
        extractedAt: timestamp,
      });

      await batch.commit();

      this.log.debug(
        {
          userId,
          entityCount: result.entities.length,
          factCount: result.facts.length,
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

      const vectorDocs: VectorDocument[] = [];
      const timestamp = new Date(timestampStr); // Convert ISO string to Date

      // Create vector documents for entities
      for (const entity of result.entities) {
        // Build searchable text that includes entity name, type, and attributes
        const attributeText = Object.entries(entity.attributes)
          .map(([k, v]) => `${k}: ${v}`)
          .join('. ');

        const searchableText = [
          `${entity.name} (${entity.type})`,
          attributeText,
          `Mentioned in conversation with ${job.personaId || 'Ferni'}`,
        ]
          .filter(Boolean)
          .join('. ');

        vectorDocs.push({
          id: `entity-${userId}-${entity.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          text: searchableText,
          metadata: {
            source: 'deep_extraction',
            userId,
            category: 'entity',
            entityName: entity.name,
            entityType: entity.type,
            sessionId: job.sessionId,
            turnNumber: job.turnNumber,
            timestamp,
            confidence: entity.confidence,
          },
        });
      }

      // Create vector documents for facts (these are often the most valuable for memory)
      for (const fact of result.facts) {
        const searchableText = [
          `${fact.entityName}: ${fact.key} is ${fact.value}`,
          fact.temporalContext ? `(${fact.temporalContext})` : '',
          `Type: ${fact.factType}`,
        ]
          .filter(Boolean)
          .join('. ');

        vectorDocs.push({
          id: `fact-${userId}-${fact.entityName.toLowerCase().replace(/\s+/g, '-')}-${fact.key}-${Date.now()}`,
          text: searchableText,
          metadata: {
            source: 'deep_extraction',
            userId,
            category: 'fact',
            entityName: fact.entityName,
            factType: fact.factType,
            factKey: fact.key,
            factValue: fact.value,
            sessionId: job.sessionId,
            turnNumber: job.turnNumber,
            timestamp,
            confidence: fact.confidence,
          },
        });
      }

      // Create vector documents for relationships
      for (const rel of result.relationships) {
        const searchableText = [
          `${rel.source} ${rel.type} ${rel.target}`,
          rel.bidirectional ? '(bidirectional relationship)' : '',
          `Relationship strength: ${rel.strength}`,
        ]
          .filter(Boolean)
          .join('. ');

        vectorDocs.push({
          id: `rel-${userId}-${rel.source.toLowerCase()}-${rel.target.toLowerCase()}-${Date.now()}`,
          text: searchableText,
          metadata: {
            source: 'deep_extraction',
            userId,
            category: 'relationship',
            sourceEntity: rel.source,
            targetEntity: rel.target,
            relationType: rel.type,
            sessionId: job.sessionId,
            turnNumber: job.turnNumber,
            timestamp,
            strength: rel.strength,
          },
        });
      }

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
      // Non-blocking - log but don't fail the extraction
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
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) return null;

      const { getExtractionModel } = await import('../../config/gemini-config.js');
      const genAI = new GoogleGenerativeAI(apiKey);
      return genAI.getGenerativeModel({ model: getExtractionModel() });
    } catch {
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
