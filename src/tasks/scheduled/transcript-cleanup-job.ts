/**
 * Transcript cleanup: removes conversations, group sessions and summaries past
 * their retention periods (moved out of memory-jobs.ts unchanged).
 *
 * @module tasks/scheduled/transcript-cleanup-job
 */

import {
  GROUP_TRANSCRIPT_RETENTION_DAYS,
  SUMMARY_RETENTION_DAYS,
  TRANSCRIPT_RETENTION_DAYS,
} from '../../services/session/constants.js';
import { runFirestoreQuery } from '../../utils/firestore-query.js';
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

export interface TranscriptCleanupJobConfig extends BaseJobConfig {
  /** Retention period for transcripts in days (default: from env or 90) */
  transcriptRetentionDays: number;
  /** Retention period for summaries in days (default: from env or 365) */
  summaryRetentionDays: number;
  /** Retention period for group transcripts in days (default: from env or 180) */
  groupTranscriptRetentionDays: number;
  /** Maximum documents to delete per run (default: 500) */
  maxDeletesPerRun: number;
  /** Maximum users to process per run (default: 100) */
  maxUsersPerRun: number;
}

export interface TranscriptCleanupJobResult extends Record<string, unknown> {
  transcriptsDeleted: number;
  summariesDeleted: number;
  groupTranscriptsDeleted: number;
  usersProcessed: number;
  bytesRecovered: number;
}

/**
 * Transcript Cleanup Job
 *
 * Removes old transcripts, summaries, and group conversation data
 * based on configurable retention periods.
 *
 * Environment Variables:
 * - TRANSCRIPT_RETENTION_DAYS: Raw transcript retention (default: 90)
 * - SUMMARY_RETENTION_DAYS: Conversation summary retention (default: 365)
 * - GROUP_TRANSCRIPT_RETENTION_DAYS: Group conversation retention (default: 180)
 *
 * Best run nightly to keep storage costs manageable.
 */
export class TranscriptCleanupJob extends ScheduledJob<
  TranscriptCleanupJobConfig,
  TranscriptCleanupJobResult
> {
  readonly name = 'TranscriptCleanupJob';
  readonly defaultConfig: TranscriptCleanupJobConfig = {
    dryRun: false,
    transcriptRetentionDays: TRANSCRIPT_RETENTION_DAYS,
    summaryRetentionDays: SUMMARY_RETENTION_DAYS,
    groupTranscriptRetentionDays: GROUP_TRANSCRIPT_RETENTION_DAYS,
    maxDeletesPerRun: 500,
    maxUsersPerRun: 100,
  };

  protected async execute(
    config: TranscriptCleanupJobConfig,
    ctx: JobContext
  ): Promise<TranscriptCleanupJobResult> {
    ctx.log.info(
      {
        transcriptRetentionDays: config.transcriptRetentionDays,
        summaryRetentionDays: config.summaryRetentionDays,
        groupTranscriptRetentionDays: config.groupTranscriptRetentionDays,
      },
      'Starting transcript cleanup with TTL configuration'
    );

    let transcriptsDeleted = 0;
    let summariesDeleted = 0;
    let groupTranscriptsDeleted = 0;
    let usersProcessed = 0;

    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();

      // Calculate cutoff dates
      const now = new Date();
      const transcriptCutoff = new Date(now);
      transcriptCutoff.setDate(transcriptCutoff.getDate() - config.transcriptRetentionDays);

      const summaryCutoff = new Date(now);
      summaryCutoff.setDate(summaryCutoff.getDate() - config.summaryRetentionDays);

      const groupCutoff = new Date(now);
      groupCutoff.setDate(groupCutoff.getDate() - config.groupTranscriptRetentionDays);

      ctx.log.info(
        {
          transcriptCutoff: transcriptCutoff.toISOString(),
          summaryCutoff: summaryCutoff.toISOString(),
          groupCutoff: groupCutoff.toISOString(),
        },
        'Cleanup cutoff dates'
      );

      // 1. Clean up old conversations from bogle_users/{userId}/conversations
      const conversationsSnapshot = await runFirestoreQuery(
        db
          .collectionGroup('conversations')
          .where('startedAt', '<', transcriptCutoff.toISOString())
          .limit(config.maxDeletesPerRun),
        { context: 'TranscriptCleanupJob conversations' }
      );

      for (const doc of conversationsSnapshot.docs) {
        ctx.counters.processed++;
        if (config.dryRun) {
          ctx.log.debug({ docId: doc.id }, 'DRY RUN: Would delete conversation');
          ctx.counters.skipped++;
          continue;
        }

        try {
          // Delete the conversation and its subcollection of turns
          const turnsSnapshot = await doc.ref.collection('turns').get();
          const batch = db.batch();

          for (const turn of turnsSnapshot.docs) {
            batch.delete(turn.ref);
          }
          batch.delete(doc.ref);

          await batch.commit();
          transcriptsDeleted++;
          ctx.counters.success++;
        } catch (error) {
          ctx.counters.errors++;
          ctx.log.warn({ error: String(error), docId: doc.id }, 'Failed to delete conversation');
        }
      }

      // 2. Clean up old group sessions
      const groupSessionsSnapshot = await runFirestoreQuery(
        db
          .collectionGroup('group_sessions')
          .where('startedAt', '<', groupCutoff.toISOString())
          .limit(config.maxDeletesPerRun),
        { context: 'TranscriptCleanupJob group_sessions' }
      );

      for (const doc of groupSessionsSnapshot.docs) {
        ctx.counters.processed++;
        if (config.dryRun) {
          ctx.log.debug({ docId: doc.id }, 'DRY RUN: Would delete group session');
          ctx.counters.skipped++;
          continue;
        }

        try {
          // Delete transcript subcollection
          const transcriptSnapshot = await doc.ref.collection('transcript').get();
          const actionItemsSnapshot = await doc.ref.collection('action_items').get();
          const batch = db.batch();

          for (const sub of transcriptSnapshot.docs) {
            batch.delete(sub.ref);
          }
          for (const sub of actionItemsSnapshot.docs) {
            batch.delete(sub.ref);
          }
          batch.delete(doc.ref);

          await batch.commit();
          groupTranscriptsDeleted++;
          ctx.counters.success++;
        } catch (error) {
          ctx.counters.errors++;
          ctx.log.warn({ error: String(error), docId: doc.id }, 'Failed to delete group session');
        }
      }

      // 3. Clean up old conversation summaries from bogle_users/{userId}/conversation_summaries
      const summariesSnapshot = await runFirestoreQuery(
        db
          .collectionGroup('conversation_summaries')
          .where('createdAt', '<', summaryCutoff.toISOString())
          .limit(config.maxDeletesPerRun),
        { context: 'TranscriptCleanupJob conversation_summaries' }
      );

      for (const doc of summariesSnapshot.docs) {
        ctx.counters.processed++;
        if (config.dryRun) {
          ctx.log.debug({ docId: doc.id }, 'DRY RUN: Would delete old summary');
          ctx.counters.skipped++;
          continue;
        }

        try {
          await doc.ref.delete();
          summariesDeleted++;
          ctx.counters.success++;
        } catch (error) {
          ctx.counters.errors++;
          ctx.log.warn({ error: String(error), docId: doc.id }, 'Failed to delete summary');
        }
      }

      // Count unique users processed (approximate from docs)
      const userIdsProcessed = new Set<string>();
      for (const doc of [...conversationsSnapshot.docs, ...groupSessionsSnapshot.docs]) {
        const parentPath = doc.ref.parent.parent?.id;
        if (parentPath) {
          userIdsProcessed.add(parentPath);
        }
      }
      usersProcessed = userIdsProcessed.size;
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Transcript cleanup failed');
      ctx.counters.errors++;
    }

    ctx.log.info(
      {
        transcriptsDeleted,
        summariesDeleted,
        groupTranscriptsDeleted,
        usersProcessed,
        dryRun: config.dryRun,
      },
      'Transcript cleanup complete'
    );

    return {
      transcriptsDeleted,
      summariesDeleted,
      groupTranscriptsDeleted,
      usersProcessed,
      bytesRecovered: 0, // Would need document size tracking to calculate
    };
  }
}

