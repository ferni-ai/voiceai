/**
 * Conversation Catch-Up Job
 *
 * Scheduled sweep that summarizes conversations which ended without a
 * summary (dropped calls, worker crashes). See
 * services/memory/conversation-catchup.ts for what "summarize" covers.
 *
 * Cloud Scheduler: `conversation-catchup` (infra/cloud-scheduler-memory.yaml)
 * → POST /api/jobs/conversation-catchup.
 *
 * @module tasks/scheduled/conversation-catchup-job
 */

import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';
import type { CatchUpDeps } from '../../services/memory/conversation-catchup.js';

export interface ConversationCatchUpConfig extends BaseJobConfig {
  /** Quiet this long → the conversation is over */
  idleMinutes: number;
  /** Ignore conversations started more than this many days ago */
  lookbackDays: number;
  /** Max conversations per run */
  batchSize: number;
}

export interface ConversationCatchUpResult extends Record<string, unknown> {
  scanned: number;
  summarized: number;
  skippedActive: number;
  failed: number;
}

export class ConversationCatchUpJob extends ScheduledJob<
  ConversationCatchUpConfig,
  ConversationCatchUpResult
> {
  readonly name = 'ConversationCatchUpJob';

  readonly defaultConfig: ConversationCatchUpConfig = {
    dryRun: false,
    idleMinutes: 30,
    lookbackDays: 7,
    batchSize: 50,
    timeoutMs: 9 * 60_000,
  };

  constructor(private readonly depsOverride?: CatchUpDeps) {
    super();
  }

  protected async execute(
    config: ConversationCatchUpConfig,
    ctx: JobContext
  ): Promise<ConversationCatchUpResult> {
    const { runConversationCatchUp, createDefaultCatchUpDeps } =
      await import('../../services/memory/conversation-catchup.js');
    const deps = this.depsOverride ?? (await createDefaultCatchUpDeps());

    const result = await runConversationCatchUp(deps, {
      idleMs: config.idleMinutes * 60_000,
      lookbackMs: config.lookbackDays * 24 * 60 * 60_000,
      batchSize: config.batchSize,
      dryRun: config.dryRun,
    });

    ctx.counters.processed = result.scanned;
    ctx.counters.success = result.summarized;
    ctx.counters.skipped = result.skippedActive;
    ctx.counters.errors = result.failed;

    return {
      scanned: result.scanned,
      summarized: result.summarized,
      skippedActive: result.skippedActive,
      failed: result.failed,
    };
  }
}
