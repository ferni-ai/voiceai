/**
 * Batching for deep extraction. Each job costs 4 sequential LLM calls
 * (entities, facts, relationships, self-question). Running it on every turn
 * put ~11 runs (84 s) into one 2.5-minute call on the agent's single event
 * loop. Turns now collect per session and run as one job every few turns.
 * Later turns of the same call still read the results (hybrid search reads
 * deep-extraction vectors), so this delays recall by a few turns rather than
 * moving it to after the call.
 */
import type { DeepExtractionJob } from './deep-extraction-worker.js';
import { createTurnBatcher, type TurnBatcher, type TurnBatcherOptions } from './turn-batcher.js';

export const DEEP_EXTRACTION_BATCH_TURNS = 4;
export const DEEP_EXTRACTION_IDLE_MS = 30_000;

const PRIORITY_RANK: Record<DeepExtractionJob['priority'], number> = { low: 0, normal: 1, high: 2 };

/** One job covering several turns of the same session, in turn order. */
export function mergeDeepExtractionJobs(jobs: readonly DeepExtractionJob[]): DeepExtractionJob {
  if (jobs.length === 1) return jobs[0];
  const ordered = [...jobs].sort((a, b) => a.turnNumber - b.turnNumber);
  const last = ordered[ordered.length - 1];
  const priority = ordered.reduce<DeepExtractionJob['priority']>(
    (best, j) => (PRIORITY_RANK[j.priority] > PRIORITY_RANK[best] ? j.priority : best),
    'low'
  );
  return {
    ...last,
    jobId: `${last.jobId}+${ordered.length - 1}`,
    priority,
    transcript: ordered.map((j) => j.transcript).join('\n'),
    fastCaptureHints: {
      mentionedEntities: ordered.flatMap((j) => j.fastCaptureHints.mentionedEntities),
      emotionSignals: ordered.flatMap((j) => j.fastCaptureHints.emotionSignals),
      topicHints: [...new Set(ordered.flatMap((j) => j.fastCaptureHints.topicHints))],
      dateSignals: ordered.flatMap((j) => j.fastCaptureHints.dateSignals),
      relationshipSignals: ordered.flatMap((j) => j.fastCaptureHints.relationshipSignals),
    },
  };
}

/**
 * Batcher that hands merged jobs to `run`. High-priority jobs skip the wait:
 * anything already buffered for that session goes out with them.
 */
export interface DeepExtractionBatchOptions extends Pick<
  TurnBatcherOptions<DeepExtractionJob>,
  'setTimer' | 'clearTimer'
> {
  /** Turns per job; 1 disables batching (job-level tests). */
  batchTurns?: number;
}

export function createDeepExtractionBatcher(
  run: (job: DeepExtractionJob) => void,
  options: DeepExtractionBatchOptions = {}
): Pick<TurnBatcher<DeepExtractionJob>, 'add' | 'flushAll' | 'pendingCount'> {
  const batcher = createTurnBatcher<DeepExtractionJob>({
    maxItems: Math.max(1, options.batchTurns ?? DEEP_EXTRACTION_BATCH_TURNS),
    idleMs: DEEP_EXTRACTION_IDLE_MS,
    keyOf: (job) => `${job.userId}:${job.sessionId}`,
    flush: (_key, jobs) => run(mergeDeepExtractionJobs(jobs)),
    setTimer: options.setTimer,
    clearTimer: options.clearTimer,
  });
  return {
    add(job: DeepExtractionJob): void {
      batcher.add(job);
      if (job.priority === 'high') batcher.flushKey(`${job.userId}:${job.sessionId}`);
    },
    flushAll: () => batcher.flushAll(),
    pendingCount: (key: string) => batcher.pendingCount(key),
  };
}
