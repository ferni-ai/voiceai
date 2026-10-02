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
 * Jobs arrive on the `memory:deep-extraction` async event and go into a
 * durable queue (extraction-queue.ts): Firestore when available, so nothing
 * is lost on restart or deploy and failed jobs retry with backoff before they
 * are dead-lettered. On start the worker drains whatever is pending, then
 * polls for retries whose backoff has elapsed.
 *
 * Facts are upserted under deterministic ids (fact-store.ts): re-learning a
 * fact merges, user edits and tombstones are respected.
 *
 * @see docs/architecture/DYNAMIC-MEMORY-ARCHITECTURE.md
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { registerInterval } from '../../utils/interval-manager.js';
import { createLogger } from '../../utils/safe-logger.js';
import { safeOnEvent } from './async-events-config.js';
import {
  formatTranscriptForExtraction,
  loadPreviousAssistantTurn,
  type ExtractionContext,
} from './extraction-context.js';
import {
  runExtraction,
  type ExtractedEntity,
  type ExtractedFact,
  type ExtractedRelationship,
  type GenerateText,
} from './extraction-llm.js';
import { persistExtraction } from './extraction-persistence.js';
import {
  FirestoreExtractionQueue,
  InMemoryExtractionQueue,
  type ExtractionQueue,
  type LeasedJob,
} from './extraction-queue.js';
import type {
  DateSignal,
  EmotionSignal,
  EntityMention,
  RelationshipSignal,
} from './fast-capture.js';
import type { FirestoreLike } from './firestore-shapes.js';

export type { ExtractedEntity, ExtractedFact, ExtractedRelationship } from './extraction-llm.js';
export type { ExtractionContext } from './extraction-context.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DeepExtractionJob {
  jobId: string;
  userId: string;
  sessionId: string;
  /** The Firestore conversation (bogle_users/{uid}/conversations/{id}); provenance for facts. */
  conversationId?: string;
  turnNumber: number;
  transcript: string;
  timestamp: Date;
  personaId?: string;
  priority: 'high' | 'normal' | 'low';
  /** Conversational context; when absent it is looked up from the conversation's turns. */
  context?: ExtractionContext;
  fastCaptureHints: {
    mentionedEntities: EntityMention[];
    emotionSignals: EmotionSignal[];
    topicHints: string[];
    dateSignals: DateSignal[];
    relationshipSignals: RelationshipSignal[];
  };
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

export interface QueueStats {
  durable: boolean;
  /** Failed attempts that will be retried. */
  retriedJobs: number;
  /** Jobs that exhausted their retries. */
  deadLetteredJobs: number;
  /** Jobs the durable queue refused that were kept in memory instead. */
  fallbackJobs: number;
}

export interface DeepExtractionWorkerOptions {
  /** Queue to use; default: Firestore when available, else in-memory. */
  queue?: ExtractionQueue<DeepExtractionJob>;
  /** Firestore for persistence/context; default getFirestoreDb(). null disables persistence. */
  db?: FirestoreLike | null;
  /** Text generator; default Gemini extraction model. null forces hint-only extraction. */
  generate?: GenerateText | null;
  /** How often to look for retries whose backoff elapsed. */
  pollIntervalMs?: number;
}

const CLAIM_BATCH = 10;
const DEFAULT_POLL_MS = 30_000;

// ============================================================================
// WORKER IMPLEMENTATION
// ============================================================================

export class DeepExtractionWorker {
  private log = createLogger({ module: 'DeepExtractionWorker' });
  private running = false;
  private isProcessing = false;
  private pumpRequested = false;
  private stopPolling: (() => void) | null = null;
  private readonly pollName = `deep-extraction-poll-${Math.random().toString(36).slice(2, 8)}`;
  private listenerRegistered = false;
  private queue: ExtractionQueue<DeepExtractionJob> | null;
  /** Takes jobs the durable queue could not accept, so a Firestore blip loses nothing in-process. */
  private readonly fallbackQueue = new InMemoryExtractionQueue<DeepExtractionJob>();
  private extractionStats: ExtractionStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    avgExtractionTimeMs: 0,
    totalEntitiesExtracted: 0,
    totalFactsExtracted: 0,
  };
  private queueStats = { retriedJobs: 0, deadLetteredJobs: 0, fallbackJobs: 0 };

  constructor(private readonly options: DeepExtractionWorkerOptions = {}) {
    this.queue = options.queue ?? null;
  }

  private getDb(): FirestoreLike | null {
    if (this.options.db !== undefined) return this.options.db;
    // The real client satisfies the structural FirestoreLike slice.
    return getFirestoreDb() as unknown as FirestoreLike | null;
  }

  private getQueue(): ExtractionQueue<DeepExtractionJob> {
    if (!this.queue) {
      const db = process.env.MEMORY_EXTRACTION_QUEUE === 'memory' ? null : this.getDb();
      const canLease =
        db !== null &&
        typeof db.collectionGroup === 'function' &&
        typeof db.runTransaction === 'function';
      this.queue = canLease
        ? new FirestoreExtractionQueue<DeepExtractionJob>(db)
        : this.fallbackQueue;
      this.log.info({ durable: this.queue.durable }, '🧠 [MEMORY-AUDIT] Extraction queue selected');
    }
    return this.queue;
  }

  /**
   * Start the worker: listen for jobs and drain anything left from before a restart.
   */
  start(): void {
    if (this.running) {
      this.log.warn('🧠 [MEMORY-AUDIT] Deep extraction worker already running');
      return;
    }

    this.running = true;
    if (!this.listenerRegistered) this.setupEventListener();
    this.getQueue();
    // Startup drain: jobs queued before the last restart or deploy.
    this.requestPump();
    const interval = this.options.pollIntervalMs ?? DEFAULT_POLL_MS;
    if (interval > 0) {
      this.stopPolling = registerInterval(this.pollName, () => this.requestPump(), interval);
    }
    this.log.info(
      '🧠 [MEMORY-AUDIT] Deep extraction worker started - ready to process memory jobs'
    );
  }

  /**
   * Stop the worker. Leased jobs not finished return to the queue when their lease expires.
   */
  stop(): void {
    this.running = false;
    if (this.stopPolling) {
      this.stopPolling();
      this.stopPolling = null;
    }
    this.log.info('🧠 [MEMORY-AUDIT] Deep extraction worker stopped');
  }

  private setupEventListener(): void {
    const listener = (job: unknown) => {
      const j = job as DeepExtractionJob;
      this.log.info(
        { jobId: j?.jobId, userId: j?.userId },
        '🧠 [MEMORY-AUDIT] Received deep extraction job'
      );
      if (this.running) {
        void this.enqueue(j);
      } else {
        this.log.warn('🧠 [MEMORY-AUDIT] Received job but worker not running');
      }
    };
    const registered = safeOnEvent('memory:deep-extraction', listener);

    if (registered) {
      // AsyncEvents has no off(); the listener stays for this instance's lifetime
      // and ignores jobs while stopped, so restarting never registers a second one.
      this.listenerRegistered = true;
      this.log.info('🧠 [MEMORY-AUDIT] Event listener registered for memory:deep-extraction');
    } else {
      this.log.warn(
        '🧠 [MEMORY-AUDIT] AsyncEvents not configured - deep extraction will not receive jobs'
      );
      this.log.warn(
        '🧠 [MEMORY-AUDIT] Ensure configureAsyncEvents() is called in global-services.ts'
      );
    }
  }

  /**
   * Get health status for monitoring
   */
  getHealthStatus(): {
    running: boolean;
    queueDepth: number;
    isProcessing: boolean;
    queue: QueueStats;
    stats: ExtractionStats;
  } {
    return {
      running: this.running,
      queueDepth: this.getQueueDepth(),
      isProcessing: this.isProcessing,
      queue: { durable: this.queue?.durable ?? false, ...this.queueStats },
      stats: { ...this.extractionStats },
    };
  }

  private async enqueue(job: DeepExtractionJob): Promise<void> {
    if (!job || typeof job.jobId !== 'string' || typeof job.userId !== 'string') {
      this.log.warn('🧠 [MEMORY-AUDIT] Ignoring malformed deep extraction job');
      return;
    }
    this.extractionStats.totalJobs++;
    const queue = this.getQueue();
    try {
      await queue.enqueue(job);
    } catch (error) {
      this.log.warn(
        { error: String(error), jobId: job.jobId },
        '🧠 [MEMORY-AUDIT] Durable enqueue failed; keeping job in memory'
      );
      this.queueStats.fallbackJobs++;
      await this.fallbackQueue.enqueue(job);
    }
    this.requestPump();
  }

  /** Ask the processing loop to run; coalesces concurrent requests. */
  private requestPump(): void {
    this.pumpRequested = true;
    if (!this.isProcessing) void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      while (this.running && this.pumpRequested) {
        this.pumpRequested = false;
        const queues =
          this.queue && this.queue !== this.fallbackQueue
            ? [this.queue, this.fallbackQueue]
            : [this.fallbackQueue];
        for (const queue of queues) {
          await this.drain(queue);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async drain(queue: ExtractionQueue<DeepExtractionJob>): Promise<void> {
    while (this.running) {
      let batch: Array<LeasedJob<DeepExtractionJob>>;
      try {
        batch = await queue.claim(CLAIM_BATCH);
      } catch (error) {
        this.log.warn(
          { error: String(error) },
          '🧠 [MEMORY-AUDIT] Could not claim extraction jobs'
        );
        return;
      }
      if (batch.length === 0) return;
      for (const leased of batch) {
        await this.runLeased(queue, leased);
      }
    }
  }

  private async runLeased(
    queue: ExtractionQueue<DeepExtractionJob>,
    leased: LeasedJob<DeepExtractionJob>
  ): Promise<void> {
    try {
      await this.processJob(leased.job);
      this.extractionStats.completedJobs++;
      await queue
        .complete(leased)
        .catch((error: unknown) =>
          this.log.warn(
            { error: String(error), jobId: leased.job.jobId },
            'Could not mark job complete'
          )
        );
    } catch (error) {
      this.extractionStats.failedJobs++;
      const outcome = await queue.fail(leased, String(error)).catch(() => 'retry' as const);
      if (outcome === 'dead') this.queueStats.deadLetteredJobs++;
      else this.queueStats.retriedJobs++;
      this.log.error(
        { error: String(error), jobId: leased.job.jobId, attempts: leased.attempts, outcome },
        'Deep extraction failed'
      );
    }
  }

  private async processJob(job: DeepExtractionJob): Promise<void> {
    const startTime = Date.now();
    const db = this.getDb();
    const timestamp = job.timestamp instanceof Date ? job.timestamp : new Date(job.timestamp);
    const hints = job.fastCaptureHints ?? {
      mentionedEntities: [],
      emotionSignals: [],
      topicHints: [],
      dateSignals: [],
      relationshipSignals: [],
    };

    // Conversational context: given with the job, or the preceding assistant turn.
    const context: ExtractionContext = job.context?.previousAssistantTurn
      ? job.context
      : {
          previousAssistantTurn: await loadPreviousAssistantTurn(
            db,
            job.userId,
            job.conversationId,
            timestamp
          ),
        };
    const transcriptBlock = formatTranscriptForExtraction(job.transcript ?? '', context);

    const generate =
      this.options.generate !== undefined ? this.options.generate : await this.getGenerator();
    const refined = await runExtraction(generate, transcriptBlock, hints);
    const facts = refined.facts.filter((f) => f && f.entityName && f.key && f.value !== undefined);
    const importanceScore = this.calculateImportance({ ...refined, facts }, hints);
    const shouldPersist = importanceScore > 0.3 || refined.entities.length > 0 || facts.length > 0;

    if (shouldPersist && db) {
      await persistExtraction(
        db,
        job.userId,
        {
          entities: refined.entities,
          facts,
          relationships: refined.relationships,
          categories: hints.topicHints,
          importanceScore,
        },
        {
          jobId: job.jobId,
          transcript: job.transcript ?? '',
          sessionId: job.sessionId,
          conversationId: job.conversationId,
          turnNumber: job.turnNumber,
          personaId: job.personaId,
        }
      );
    }

    const extractionTimeMs = Date.now() - startTime;
    const done = this.extractionStats.completedJobs + 1;
    this.extractionStats.avgExtractionTimeMs =
      done > 1
        ? (this.extractionStats.avgExtractionTimeMs * (done - 1) + extractionTimeMs) / done
        : extractionTimeMs;
    this.extractionStats.totalEntitiesExtracted += refined.entities.length;
    this.extractionStats.totalFactsExtracted += facts.length;

    this.log.info(
      {
        jobId: job.jobId,
        extractionTimeMs,
        entityCount: refined.entities.length,
        factCount: facts.length,
        relationshipCount: refined.relationships.length,
        importanceScore,
        hadContext: Boolean(context.previousAssistantTurn),
      },
      'Deep extraction complete'
    );
  }

  private async getGenerator(): Promise<GenerateText | null> {
    try {
      const { getExtractionModel } = await import('../../config/gemini-config.js');
      const { getGenerativeModel } = await import('../../config/generative-model.js');
      const model = await getGenerativeModel({ model: getExtractionModel() });
      if (!model) return null;
      return async (prompt) => (await model.generateContent(prompt)).response.text();
    } catch (error) {
      this.log.warn({ error: String(error) }, 'Gemini unavailable for deep extraction');
      return null;
    }
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
    score += Math.min(result.entities.length * 0.1, 0.3);
    score += Math.min(result.facts.length * 0.1, 0.3);
    score += Math.min(result.relationships.length * 0.15, 0.2);
    if ((hints.emotionSignals ?? []).some((e) => e.intensity === 'high')) score += 0.2;
    if ((hints.dateSignals ?? []).length > 0) score += 0.1;
    return Math.min(score, 1);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  public getStats(): ExtractionStats {
    return { ...this.extractionStats };
  }

  public getQueueDepth(): number {
    const main = this.queue && this.queue !== this.fallbackQueue ? this.queue.depth() : 0;
    return main + this.fallbackQueue.depth();
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
