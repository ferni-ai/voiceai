/**
 * Transcript Cleanup Job (retention) — OFF BY DEFAULT.
 *
 * Product decision: a user's memories are kept until the user deletes them
 * (see docs/architecture/USER-MEMORY-CONTROL.md). This job therefore deletes
 * nothing unless an operator opts in per category with an env var:
 *
 * - TRANSCRIPT_RETENTION_DAYS        raw 1:1 transcripts (conversation + turns)
 * - SUMMARY_RETENTION_DAYS           conversation summaries (+ their embeddings)
 * - GROUP_TRANSCRIPT_RETENTION_DAYS  group sessions (transcript + action items)
 *
 * Dates are stored as Firestore Timestamps (older docs: ISO strings), and
 * Firestore never compares across types, so each cutoff is queried both ways.
 *
 * @module tasks/scheduled/transcript-cleanup-job
 */

import type { DocumentData, Firestore, QueryDocumentSnapshot } from '@google-cloud/firestore';
import { runFirestoreQuery } from '../../utils/firestore-query.js';
import { ScheduledJob, type BaseJobConfig, type JobContext } from './base-job.js';

export interface TranscriptCleanupJobConfig extends BaseJobConfig {
  /** Days to keep raw transcripts; null = keep forever (default unless env set). */
  transcriptRetentionDays: number | null;
  /** Days to keep conversation summaries; null = keep forever. */
  summaryRetentionDays: number | null;
  /** Days to keep group transcripts; null = keep forever. */
  groupTranscriptRetentionDays: number | null;
  /** Maximum documents to delete per category per run (default: 500) */
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
  /** True when no retention period is configured, so nothing was considered. */
  retentionDisabled: boolean;
}

/** A positive whole number of days from the env, or null (= keep forever). */
export function readRetentionDays(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return null;
  const days = Number(raw);
  return Number.isInteger(days) && days > 0 ? days : null;
}

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** True for `bogle_users/{uid}/<collection>/{id}` (not same-named collections elsewhere). */
function isUserScoped(doc: QueryDocumentSnapshot<DocumentData>): boolean {
  return doc.ref.parent.parent?.parent?.id === 'bogle_users';
}

async function olderThan(
  db: Firestore,
  collection: string,
  field: string,
  before: Date,
  limit: number
): Promise<Array<QueryDocumentSnapshot<DocumentData>>> {
  const byId = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const value of [before, before.toISOString()]) {
    const snap = await runFirestoreQuery(
      db.collectionGroup(collection).where(field, '<', value).limit(limit),
      { context: `TranscriptCleanupJob ${collection}` }
    );
    for (const doc of snap.docs) byId.set(doc.ref.path, doc);
  }
  return [...byId.values()].slice(0, limit);
}

async function deleteSubcollection(
  doc: QueryDocumentSnapshot<DocumentData>,
  name: string
): Promise<void> {
  for (;;) {
    const snap = await doc.ref.collection(name).limit(300).get();
    if (snap.empty) return;
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    if (snap.size < 300) return;
  }
}

export class TranscriptCleanupJob extends ScheduledJob<
  TranscriptCleanupJobConfig,
  TranscriptCleanupJobResult
> {
  readonly name = 'TranscriptCleanupJob';
  readonly defaultConfig: TranscriptCleanupJobConfig = {
    dryRun: false,
    transcriptRetentionDays: readRetentionDays('TRANSCRIPT_RETENTION_DAYS'),
    summaryRetentionDays: readRetentionDays('SUMMARY_RETENTION_DAYS'),
    groupTranscriptRetentionDays: readRetentionDays('GROUP_TRANSCRIPT_RETENTION_DAYS'),
    maxDeletesPerRun: 500,
    maxUsersPerRun: 100,
  };

  protected async execute(
    config: TranscriptCleanupJobConfig,
    ctx: JobContext
  ): Promise<TranscriptCleanupJobResult> {
    const result: TranscriptCleanupJobResult = {
      transcriptsDeleted: 0,
      summariesDeleted: 0,
      groupTranscriptsDeleted: 0,
      usersProcessed: 0,
      bytesRecovered: 0,
      retentionDisabled: false,
    };
    const { transcriptRetentionDays, summaryRetentionDays, groupTranscriptRetentionDays } = config;

    if (!transcriptRetentionDays && !summaryRetentionDays && !groupTranscriptRetentionDays) {
      ctx.log.info('Retention disabled (memories are kept until the user deletes them)');
      result.retentionDisabled = true;
      return result;
    }

    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore() as unknown as Firestore;
    const users = new Set<string>();

    const sweep = async (
      collection: string,
      field: string,
      days: number,
      remove: (doc: QueryDocumentSnapshot<DocumentData>) => Promise<void>
    ): Promise<number> => {
      let deleted = 0;
      const docs = await olderThan(db, collection, field, cutoff(days), config.maxDeletesPerRun);
      for (const doc of docs) {
        if (collection !== 'group_sessions' && !isUserScoped(doc)) continue;
        ctx.counters.processed++;
        if (config.dryRun) {
          ctx.counters.skipped++;
          continue;
        }
        try {
          await remove(doc);
          deleted++;
          ctx.counters.success++;
          const owner = doc.ref.parent.parent?.id;
          if (owner) users.add(owner);
        } catch (error) {
          ctx.counters.errors++;
          ctx.log.warn(
            { error: String(error), path: doc.ref.path },
            `Failed to delete ${collection}`
          );
        }
      }
      return deleted;
    };

    try {
      if (transcriptRetentionDays) {
        result.transcriptsDeleted = await sweep(
          'conversations',
          'startedAt',
          transcriptRetentionDays,
          async (doc) => {
            await deleteSubcollection(doc, 'turns');
            await doc.ref.delete();
          }
        );
      }
      if (groupTranscriptRetentionDays) {
        result.groupTranscriptsDeleted = await sweep(
          'group_sessions',
          'startedAt',
          groupTranscriptRetentionDays,
          async (doc) => {
            await deleteSubcollection(doc, 'transcript');
            await deleteSubcollection(doc, 'action_items');
            await doc.ref.delete();
          }
        );
      }
      if (summaryRetentionDays) {
        result.summariesDeleted = await sweep(
          'summaries',
          'timestamp',
          summaryRetentionDays,
          async (doc) => {
            await doc.ref.delete();
            const { getFirestoreVectorStore } =
              await import('../../memory/firestore-vector-store.js');
            // Summary embeddings are indexed as `conversation_<summaryId>`.
            await getFirestoreVectorStore().removeDocument(`conversation_${doc.id}`);
          }
        );
      }
    } catch (error) {
      ctx.log.error({ error: String(error) }, 'Transcript cleanup failed');
      ctx.counters.errors++;
    }

    result.usersProcessed = users.size;
    ctx.log.info({ ...result, dryRun: config.dryRun }, 'Transcript cleanup complete');
    return result;
  }
}
