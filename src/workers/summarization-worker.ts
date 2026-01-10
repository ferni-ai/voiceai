/**
 * Summarization Worker
 *
 * Background worker for LLM-intensive summarization operations.
 * Offloads heavy LLM processing from session end.
 *
 * Operations handled:
 * - Conversation summarization (runs at session end)
 * - Memory consolidation (periodic)
 * - Topic extraction and threading
 * - Emotional highlight identification
 *
 * This prevents 2-5s LLM summarization from blocking session cleanup.
 */

/* eslint-disable no-restricted-imports -- Workers need direct service imports */
/* eslint-disable no-await-in-loop -- Sequential processing required for summarization jobs */

import { LocalWorker, type WorkerConfig } from './base-worker.js';
import { AsyncEvents, type EventPayload } from '../services/async-events/index.js';
import { removeUndefined } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SummarizationWorker' });

// ============================================================================
// TYPES
// ============================================================================

export interface SummarizationJob {
  type: 'conversation' | 'memory_consolidation' | 'topic_thread' | 'emotional_summary';
  userId: string;
  sessionId?: string;
  conversationId?: string;
  turns?: Array<{ role: string; content: string; timestamp?: number }>;
  priority: 'high' | 'normal' | 'low';
}

export interface SummarizationResult {
  jobId: string;
  summary?: string;
  topics?: string[];
  emotionalHighlights?: string[];
  keyMoments?: string[];
  durationMs: number;
  tokensUsed?: number;
}

// ============================================================================
// WORKER IMPLEMENTATION
// ============================================================================

// Backpressure: max jobs in queue before rejecting new ones
const MAX_QUEUE_DEPTH = 200;

export class SummarizationWorker extends LocalWorker {
  private jobQueue: Array<SummarizationJob & { jobId: string }> = [];
  private isProcessing = false;
  private maxConcurrentJobs = 2; // Limit concurrent LLM calls
  private summaryStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    avgDurationMs: 0,
    durations: [] as number[],
    totalTokens: 0,
  };

  constructor(config?: Partial<WorkerConfig>) {
    super({
      name: 'SummarizationWorker',
      subscriptionName: 'ferni-summarization-sub',
      handleTypes: [
        'summarization:conversation',
        'summarization:memory-consolidation',
      ] as WorkerConfig['handleTypes'],
      ...config,
    });
  }

  protected async process(payload: EventPayload): Promise<void> {
    const { type, data, sessionId, userId } = payload;

    switch (type) {
      case 'summarization:conversation':
        if (userId) {
          await this.handleConversationEnd(userId, sessionId, data);
        }
        break;

      case 'summarization:memory-consolidation':
        if (userId) {
          await this.handleSummarizationRequest({
            type: 'memory_consolidation',
            userId,
            priority: 'normal',
          });
        }
        break;

      default:
        this.log.debug({ type }, 'Unhandled summarization event type');
    }
  }

  /**
   * Handle conversation end - trigger summarization
   */
  private async handleConversationEnd(
    userId: string,
    sessionId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    const turnCount = (data.turnCount as number) || 0;

    // Only summarize conversations with enough turns
    if (turnCount < 3) {
      this.log.debug({ userId, turnCount }, 'Skipping summarization (too few turns)');
      return;
    }

    // Backpressure check
    if (this.jobQueue.length >= MAX_QUEUE_DEPTH) {
      this.log.warn(
        { queueDepth: this.jobQueue.length },
        'Backpressure: dropping summarization job'
      );
      return;
    }

    const jobId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.jobQueue.push({
      jobId,
      type: 'conversation',
      userId,
      sessionId,
      conversationId: data.conversationId as string,
      turns: data.turns as SummarizationJob['turns'],
      priority: 'normal',
    });

    this.summaryStats.totalJobs++;
    this.log.debug({ userId, jobId, turnCount }, 'Queued conversation summarization');

    await this.processQueue();
  }

  /**
   * Handle explicit summarization request
   */
  private async handleSummarizationRequest(job: SummarizationJob): Promise<void> {
    const jobId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.jobQueue.push({
      jobId,
      ...job,
    });

    this.summaryStats.totalJobs++;
    await this.processQueue();
  }

  /**
   * Process queued summarization jobs
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (this.jobQueue.length === 0) return;

    this.isProcessing = true;

    try {
      // Sort by priority
      this.jobQueue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      // Process with limited concurrency
      while (this.jobQueue.length > 0) {
        const jobs = this.jobQueue.splice(0, this.maxConcurrentJobs);
        await Promise.all(jobs.map(async (job) => this.processJob(job)));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single summarization job
   */
  private async processJob(job: SummarizationJob & { jobId: string }): Promise<void> {
    const startTime = Date.now();

    try {
      let result: SummarizationResult;

      switch (job.type) {
        case 'conversation':
          result = await this.summarizeConversation(job);
          break;

        case 'memory_consolidation':
          result = await this.consolidateMemoriesAsync(job);
          break;

        case 'topic_thread':
          result = await this.extractTopicThread(job);
          break;

        case 'emotional_summary':
          result = await this.summarizeEmotionalJourney(job);
          break;

        default:
          this.log.warn({ jobId: job.jobId, type: job.type }, 'Unknown summarization type');
          return;
      }

      const durationMs = Date.now() - startTime;

      // Update stats
      this.summaryStats.completedJobs++;
      this.summaryStats.durations.push(durationMs);
      if (this.summaryStats.durations.length > 100) {
        this.summaryStats.durations.shift();
      }
      this.summaryStats.avgDurationMs =
        this.summaryStats.durations.reduce((a, b) => a + b, 0) / this.summaryStats.durations.length;
      if (result.tokensUsed != null && result.tokensUsed > 0) {
        this.summaryStats.totalTokens += result.tokensUsed;
      }

      this.log.info(
        {
          jobId: job.jobId,
          type: job.type,
          userId: job.userId,
          durationMs,
        },
        'Summarization complete'
      );

      // Emit completion event
      AsyncEvents.emit('summarization:complete' as never, {
        ...result,
        jobId: job.jobId,
        userId: job.userId,
        type: job.type,
      });
    } catch (error) {
      this.summaryStats.failedJobs++;
      this.log.warn({ jobId: job.jobId, error: String(error) }, 'Summarization failed');
    }
  }

  /**
   * Summarize a conversation
   */
  private async summarizeConversation(
    job: SummarizationJob & { jobId: string }
  ): Promise<SummarizationResult> {
    const startTime = Date.now();

    try {
      // Get conversation history if not provided
      const turns = job.turns || [];

      if (turns.length === 0) {
        return {
          jobId: job.jobId,
          summary: '',
          durationMs: Date.now() - startTime,
        };
      }

      // Use summarizer
      const { summarizeConversation } = await import('../memory/summarizer.js');
      const typedTurns = turns.map((t) => ({
        role: t.role as 'user' | 'assistant',
        content: t.content,
        timestamp: t.timestamp ?? Date.now(),
      }));
      const result = await summarizeConversation(job.userId, typedTurns as never);

      // Save to Firestore
      const summaryText = (result as { text?: string }).text || '';
      if (summaryText) {
        try {
          const { getFirestore } = await import('firebase-admin/firestore');
          const db = getFirestore();

          await db
            .collection('bogle_users')
            .doc(job.userId)
            .collection('conversation_summaries')
            .doc(job.conversationId || `conv_${Date.now()}`)
            .set(
              removeUndefined({
                summary: summaryText,
                topics: (result as { topics?: string[] }).topics || [],
                emotionalHighlights:
                  (result as { emotionalHighlights?: string[] }).emotionalHighlights || [],
                keyMoments: (result as { keyMoments?: string[] }).keyMoments || [],
                turnCount: turns.length,
                createdAt: new Date(),
                embedding: (result as { embedding?: number[] }).embedding || null,
              })
            );
        } catch (saveError) {
          log.warn({ error: String(saveError) }, 'Failed to save summary to Firestore');
        }
      }

      return {
        jobId: job.jobId,
        summary: summaryText,
        topics: (result as { topics?: string[] }).topics,
        emotionalHighlights: (result as { emotionalHighlights?: string[] }).emotionalHighlights,
        keyMoments: (result as { keyMoments?: string[] }).keyMoments,
        durationMs: Date.now() - startTime,
        tokensUsed: (result as { tokensUsed?: number }).tokensUsed,
      };
    } catch (error) {
      log.warn({ jobId: job.jobId, error: String(error) }, 'Conversation summarization failed');
      throw error;
    }
  }

  /**
   * Consolidate user memories using the MemoryConsolidator.
   * Merges related memories into richer representations.
   */
  private async consolidateMemoriesAsync(
    job: SummarizationJob & { jobId: string }
  ): Promise<SummarizationResult> {
    const startTime = Date.now();

    log.info({ userId: job.userId, jobId: job.jobId }, 'Starting memory consolidation');

    try {
      // 1. Load user's memory index
      const { getConversationPrimingMemories } = await import('../memory/advanced-retrieval.js');
      const memories = getConversationPrimingMemories(job.userId, 'ferni');

      if (memories.length < 5) {
        log.debug({ userId: job.userId, memoryCount: memories.length }, 'Too few memories to consolidate');
        return {
          jobId: job.jobId,
          summary: 'Insufficient memories for consolidation',
          durationMs: Date.now() - startTime,
        };
      }

      // 2. Run consolidation pass
      const { getMemoryConsolidator } = await import('../memory/memory-consolidator.js');
      const consolidator = getMemoryConsolidator();

      // Convert to MemoryItem format expected by consolidator
      // Note: The consolidator expects MemoryItem[] but we work with what we have
      const memoryItems = memories.map((m) => ({
        id: m.id,
        type: 'moment' as const,
        content: m.content,
        timestamp: m.timestamp || new Date(),
        emotionalWeight: m.emotionalWeight,
        relevanceDecay: 0.8,
        baseImportance: m.emotionalWeight,
        embedding: m.embedding || [],
      }));

      // Cast to satisfy type - consolidator uses duck typing internally
      const result = await consolidator.runConsolidationPass(memoryItems as never);

      // 3. Save consolidated memories to Firestore
      if (result.consolidated.length > 0) {
        try {
          const { getFirestore } = await import('firebase-admin/firestore');
          const db = getFirestore();
          const batch = db.batch();

          for (const consolidated of result.consolidated) {
            const docRef = db
              .collection('bogle_users')
              .doc(job.userId)
              .collection('consolidated_memories')
              .doc(consolidated.id);

            batch.set(docRef, removeUndefined({
              topic: consolidated.topic,
              consolidatedContent: consolidated.consolidatedContent,
              sourceMemoryIds: consolidated.sourceMemoryIds,
              consolidatedAt: consolidated.consolidatedAt,
              frequency: consolidated.frequency,
              emotionalSignature: consolidated.emotionalSignature,
              themes: consolidated.themes,
              evolution: consolidated.evolution,
            }));
          }

          await batch.commit();
        } catch (saveError) {
          log.warn({ error: String(saveError) }, 'Failed to save consolidated memories');
        }
      }

      log.info(
        {
          userId: job.userId,
          consolidated: result.consolidated.length,
          processed: result.memoriesProcessed,
          durationMs: result.durationMs,
        },
        'Memory consolidation complete'
      );

      return {
        jobId: job.jobId,
        summary: `Consolidated ${result.consolidated.length} memory groups from ${result.memoriesProcessed} memories`,
        topics: result.consolidated.map((c) => c.topic),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      log.warn({ userId: job.userId, error: String(error) }, 'Memory consolidation failed');
      return {
        jobId: job.jobId,
        summary: `Consolidation error: ${String(error)}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync wrapper for consolidateMemories (backwards compatible).
   */
  private consolidateMemories(job: SummarizationJob & { jobId: string }): SummarizationResult {
    // Fire async consolidation and return immediately
    void this.consolidateMemoriesAsync(job);

    return {
      jobId: job.jobId,
      summary: 'Memory consolidation started (async)',
      durationMs: 0,
    };
  }

  /**
   * Extract topic thread across conversations.
   * Groups related topics and identifies patterns.
   *
   * NOTE: Full implementation requires integration with memory search.
   */
  private async extractTopicThread(
    job: SummarizationJob & { jobId: string }
  ): Promise<SummarizationResult> {
    const startTime = Date.now();

    try {
      const { searchMemoriesByTopic } = await import('../memory/advanced-retrieval.js');

      // Search memories by topic
      const topicQuery = (job as { topic?: string }).topic ?? 'general discussion';
      const memories = await searchMemoriesByTopic(job.userId, topicQuery);

      // Extract unique topics by analyzing content patterns
      const topics: string[] = [];

      // Use keywords from retrieved memories to identify topics
      for (const memory of memories.slice(0, 20)) {
        // Simple topic extraction from content
        const words = memory.item.content.toLowerCase().split(/\s+/);
        const significantWords = words.filter((w) => w.length > 5);
        for (const word of significantWords.slice(0, 3)) {
          if (!topics.includes(word)) {
            topics.push(word);
          }
        }
      }

      log.debug(
        { userId: job.userId, topicsFound: topics.length },
        'Topic thread extraction complete'
      );

      return {
        jobId: job.jobId,
        topics: topics.slice(0, 10),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      log.warn({ userId: job.userId, error: String(error) }, 'Topic thread extraction failed');
      return {
        jobId: job.jobId,
        topics: [],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Summarize emotional journey across sessions.
   * Identifies emotional patterns and highlights.
   *
   * NOTE: Full implementation requires integration with memory search.
   */
  private async summarizeEmotionalJourney(
    job: SummarizationJob & { jobId: string }
  ): Promise<SummarizationResult> {
    const startTime = Date.now();

    try {
      const { getConversationPrimingMemories } = await import('../memory/advanced-retrieval.js');

      // Get recent memories for the user (personaId defaults to 'ferni')
      const memories = getConversationPrimingMemories(job.userId, 'ferni');

      // Filter by emotional weight as proxy for emotional significance
      const emotionalMemories = memories.filter((m) => m.emotionalWeight > 0.5);

      // Sort by emotional weight (highest first) and take top highlights
      const sorted = emotionalMemories
        .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
        .slice(0, 10);

      const emotionalHighlights = sorted.map((m) => m.content.substring(0, 200));

      log.debug(
        {
          userId: job.userId,
          highlightsFound: emotionalHighlights.length,
          memoriesSearched: memories.length,
        },
        'Emotional journey summarization complete'
      );

      return {
        jobId: job.jobId,
        emotionalHighlights,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      log.warn(
        { userId: job.userId, error: String(error) },
        'Emotional journey summarization failed'
      );
      return {
        jobId: job.jobId,
        emotionalHighlights: [],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get worker stats
   */
  getSummarizationStats(): typeof this.summaryStats {
    return { ...this.summaryStats };
  }
}

// ============================================================================
// SINGLETON & STARTUP
// ============================================================================

let summarizationWorkerInstance: SummarizationWorker | null = null;

export function getSummarizationWorker(): SummarizationWorker {
  if (!summarizationWorkerInstance) {
    summarizationWorkerInstance = new SummarizationWorker();
  }
  return summarizationWorkerInstance;
}

export async function startSummarizationWorker(): Promise<SummarizationWorker> {
  const worker = getSummarizationWorker();
  await worker.start();
  return worker;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Queue conversation summarization (fire-and-forget)
 */
export function queueConversationSummarization(
  userId: string,
  conversationId: string,
  turns?: Array<{ role: string; content: string }>
): void {
  AsyncEvents.emit('summarization:request' as never, {
    type: 'conversation',
    userId,
    conversationId,
    turns,
    priority: 'normal',
  });
}

/**
 * Queue memory consolidation (fire-and-forget)
 */
export function queueMemoryConsolidation(userId: string): void {
  AsyncEvents.emit('summarization:request' as never, {
    type: 'memory_consolidation',
    userId,
    priority: 'low',
  });
}

export default SummarizationWorker;
