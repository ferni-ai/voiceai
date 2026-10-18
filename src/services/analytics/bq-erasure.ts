/**
 * Account erasure for the ferni_events rows (bq-events.ts). The rows are pseudonymous, keyed
 * by user_hash, so an erased account's rows must go too.
 *
 * At erasure the account's user_hash (and its linked phone profiles') is queued in
 * bq_erasure/{user_hash}; the queue holds the hash alone, never the uid. A daily job deletes
 * those hashes' rows with one DML DELETE per table. BigQuery refuses DML on rows still in the
 * streaming buffer (up to ~90 minutes after insert), so a hash waits HOLD_MS before its first
 * delete, and a failed delete leaves it queued for the next run.
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
  await Promise.all(
    hashes.map((userHash) =>
      db.collection(ERASURE_QUEUE).doc(userHash).set({ userHash, queuedAt: now.toISOString() })
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
  failedTables: string[];
}

/** Deletes the rows of every queued hash older than HOLD_MS, then drops those hashes from the queue. */
export async function runBqErasure(
  db: Db,
  opts: { run?: RunDml; now?: Date } = {}
): Promise<ErasureRun> {
  const run = opts.run ?? runDml;
  const cutoff = new Date((opts.now ?? new Date()).getTime() - HOLD_MS).toISOString();
  const snap = await db
    .collection(ERASURE_QUEUE)
    .where('queuedAt', '<=', cutoff)
    .limit(BATCH)
    .get();
  const hashes = snap.docs.map((d) => d.id).filter((h) => /^[0-9a-f]{32}$/.test(h));
  if (hashes.length === 0) return { due: 0, erased: 0, failedTables: [] };
  const failedTables: string[] = [];
  for (const table of ERASABLE_TABLES) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one table at a time keeps the job light
      await run(
        `DELETE FROM \`johnb-2025.ferni_events.${table}\` WHERE user_hash IN UNNEST(@hashes)`,
        hashes
      );
    } catch (error) {
      failedTables.push(table);
      log.warn(
        { table, error: error instanceof Error ? error.name : 'unknown' },
        'BQ erasure failed'
      );
    }
  }
  if (failedTables.length > 0) return { due: hashes.length, erased: 0, failedTables };
  await Promise.all(hashes.map((h) => db.collection(ERASURE_QUEUE).doc(h).delete()));
  return { due: hashes.length, erased: hashes.length, failedTables };
}
