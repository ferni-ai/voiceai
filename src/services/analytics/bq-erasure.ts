/**
 * Account erasure for the ferni_events rows (bq-events.ts). The rows are pseudonymous, keyed
 * by user_hash, so an erased account's rows must go too.
 *
 * At erasure the account's user_hash (and its linked phone profiles') is queued in
 * bq_erasure/{user_hash}; the queue holds the hash alone, never the uid. A daily job deletes
 * those hashes' rows with one DML DELETE per table. BigQuery refuses DML on rows still in the
 * streaming buffer (up to ~90 minutes after insert), so a hash is first due HOLD_MS after it
 * is queued.
 *
 * Progress is per hash: doneTables lists the tables already cleared, and the document goes
 * only when every table is done. A hash that fails backs off (nextAttemptAt), so newer hashes
 * go ahead of it, and a table whose batch fails is retried hash by hash, so one bad hash or
 * one bad table never holds up the rest. A hash still queued OVERDUE_MS after it was queued
 * logs BQ_ERASURE_OVERDUE at error level (GDPR allows 30 days).
 *
 * @module services/analytics/bq-erasure
 */
import type { Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { BQ_TABLES, bqHash, type BqTable } from './bq-events.js';

const log = createLogger({ module: 'bq-erasure' });

type Db = FirebaseFirestore.Firestore;
export const ERASURE_QUEUE = 'bq_erasure';
/** Longer than the streaming buffer holds rows (~90 min). */
export const HOLD_MS = 3 * 60 * 60_000;
const HOUR = 60 * 60_000;
export const OVERDUE_MS = 7 * 24 * HOUR;
/** 6 h, 12 h, 24 h, then every 48 h: well inside the 30 days even with a daily job. */
export const backoffMs = (attempts: number): number =>
  Math.min(6 * HOUR * 2 ** (attempts - 1), 48 * HOUR);
/** Consecutive single-hash failures that mean the table itself is failing. */
const TABLE_DOWN_AFTER = 2;
const BATCH = 500;
const QUERY_URL = 'https://bigquery.googleapis.com/bigquery/v2/projects/johnb-2025/queries';

/** Tables with a user_hash column. */
export const ERASABLE_TABLES = (Object.keys(BQ_TABLES) as BqTable[]).filter(
  (t) => 'user_hash' in BQ_TABLES[t]
);

/** Queues these accounts' hashes. Without LOG_HASH_SECRET no row carries a hash, so none is queued. */
export async function queueBqErasure(
  db: Db,
  userIds: readonly string[],
  env: Env = process.env,
  now: Date = new Date()
): Promise<number> {
  const hashes = [...new Set(userIds.map((id) => bqHash('user', id, env)))].filter(
    (h): h is string => h !== null
  );
  const nextAttemptAt = new Date(now.getTime() + HOLD_MS).toISOString();
  // A re-queue starts over: rows may have been written since a table was cleared.
  await Promise.all(
    hashes.map((userHash) =>
      db
        .collection(ERASURE_QUEUE)
        .doc(userHash)
        .set({ userHash, queuedAt: now.toISOString(), nextAttemptAt, attempts: 0, doneTables: [] })
    )
  );
  return hashes.length;
}

/** Runs one parameterised DML statement; resolves when BigQuery reports it done. */
export type RunDml = (sql: string, hashes: readonly string[]) => Promise<void>;

async function runDml(sql: string, hashes: readonly string[]): Promise<void> {
  const { GoogleAuth } = await import('google-auth-library');
  const client = await new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/bigquery'],
  }).getClient();
  const res = await client.request<{ jobComplete?: boolean; errors?: unknown[] }>({
    url: QUERY_URL,
    method: 'POST',
    timeout: 120_000,
    data: {
      query: sql,
      useLegacySql: false,
      timeoutMs: 110_000,
      parameterMode: 'NAMED',
      queryParameters: [
        {
          name: 'hashes',
          parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
          parameterValue: { arrayValues: hashes.map((value) => ({ value })) },
        },
      ],
    },
  });
  if (!res.data?.jobComplete || res.data.errors?.length) throw new Error('DML did not complete');
}

export interface ErasureRun {
  due: number;
  erased: number;
  retrying: number;
  failedTables: string[];
  overdue: number;
}

interface QueuedHash {
  hash: string;
  doneTables: string[];
  attempts: number;
}

const deleteSql = (table: string): string =>
  `DELETE FROM \`johnb-2025.ferni_events.${table}\` WHERE user_hash IN UNNEST(@hashes)`;

/**
 * Clears `table` for `pending`: one statement for all of them, and when that fails, one per
 * hash so a single bad hash fails alone. Stops early when the table itself is failing.
 * Returns the hashes the table is now done for.
 */
async function clearTable(run: RunDml, table: BqTable, pending: string[]): Promise<string[]> {
  const attempt = async (hashes: string[]): Promise<boolean> =>
    run(deleteSql(table), hashes).then(
      () => true,
      (error: unknown) => {
        log.warn(
          { table, hashes: hashes.length, error: error instanceof Error ? error.name : 'unknown' },
          'BQ erasure failed'
        );
        return false;
      }
    );
  if (await attempt(pending)) return pending;
  if (pending.length === 1) return [];
  const done: string[] = [];
  let failedInRow = 0;
  for (const hash of pending) {
    // eslint-disable-next-line no-await-in-loop -- one statement at a time per table
    if (await attempt([hash])) {
      done.push(hash);
      failedInRow = 0;
    } else if (++failedInRow >= TABLE_DOWN_AFTER) break;
  }
  return done;
}

/** Logs BQ_ERASURE_OVERDUE (error level, for alerting) when any hash is queued past OVERDUE_MS. */
async function reportOverdue(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - OVERDUE_MS).toISOString();
  const snap = await db
    .collection(ERASURE_QUEUE)
    .where('queuedAt', '<=', cutoff)
    .orderBy('queuedAt')
    .limit(BATCH)
    .get();
  if (snap.docs.length > 0) {
    const oldest = String(snap.docs[0]?.data().queuedAt ?? '');
    log.error({ overdue: snap.docs.length, oldestQueuedAt: oldest }, 'BQ_ERASURE_OVERDUE');
  }
  return snap.docs.length;
}

/**
 * Clears every due hash (nextAttemptAt <= now, oldest first) from each table it isn't done
 * for. A hash done everywhere is dequeued; any other records its progress and backs off.
 */
export async function runBqErasure(
  db: Db,
  opts: { run?: RunDml; now?: Date } = {}
): Promise<ErasureRun> {
  const run = opts.run ?? runDml;
  const now = opts.now ?? new Date();
  const snap = await db
    .collection(ERASURE_QUEUE)
    .where('nextAttemptAt', '<=', now.toISOString())
    .orderBy('nextAttemptAt')
    .limit(BATCH)
    .get();
  const due: QueuedHash[] = snap.docs
    .filter((d) => /^[0-9a-f]{32}$/.test(d.id))
    .map((d) => {
      const data = d.data();
      return {
        hash: d.id,
        doneTables: Array.isArray(data.doneTables) ? data.doneTables.map(String) : [],
        attempts: typeof data.attempts === 'number' ? data.attempts : 0,
      };
    });
  const failedTables: string[] = [];
  for (const table of ERASABLE_TABLES) {
    const pending = due.filter((q) => !q.doneTables.includes(table));
    if (pending.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop -- one table at a time keeps the job light
    const done = new Set(
      await clearTable(
        run,
        table,
        pending.map((q) => q.hash)
      )
    );
    if (done.size < pending.length) failedTables.push(table);
    for (const q of pending) if (done.has(q.hash)) q.doneTables.push(table);
  }
  const finished = due.filter((q) => ERASABLE_TABLES.every((t) => q.doneTables.includes(t)));
  const retry = due.filter((q) => !finished.includes(q));
  await Promise.all([
    ...finished.map((q) => db.collection(ERASURE_QUEUE).doc(q.hash).delete()),
    ...retry.map((q) =>
      db
        .collection(ERASURE_QUEUE)
        .doc(q.hash)
        .set(
          {
            doneTables: q.doneTables,
            attempts: q.attempts + 1,
            nextAttemptAt: new Date(now.getTime() + backoffMs(q.attempts + 1)).toISOString(),
          },
          { merge: true }
        )
    ),
  ]);
  const overdue = await reportOverdue(db, now);
  return {
    due: due.length,
    erased: finished.length,
    retrying: retry.length,
    failedTables,
    overdue,
  };
}
