/**
 * Account erasure for the ferni_events rows (bq-events.ts). The rows are pseudonymous, keyed
 * by user_hash, so an erased account's rows must go too.
 *
 * Erasure queues bq_erasure/{user_hash} = { queuedAt, nextAttemptAt, attempts, doneTables }:
 * the hash alone, never the uid. A daily run takes the due hashes and, per table, runs ONE
 * parameterised DELETE over those that haven't finished it, recording the table as done right
 * after it succeeds. A failed statement is bisected to isolate a poison hash, within a budget
 * of BUDGET_STATEMENTS statements and BUDGET_MS per run. A doc goes only when every table is
 * done; otherwise it backs off. Every write checks that queuedAt still equals what the run
 * read, so an account re-erased mid-run starts over untouched. BigQuery refuses DML on rows
 * still in the streaming buffer (~90 min), hence HOLD_MS. A hash queued past OVERDUE_MS logs
 * BQ_ERASURE_OVERDUE at error level (GDPR allows 30 days).
 *
 * @module services/analytics/bq-erasure
 */
import type { Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { BQ_TABLES, bqHash, type BqTable } from './bq-events.js';

const log = createLogger({ module: 'bq-erasure' });

type Db = FirebaseFirestore.Firestore;
type Tx = FirebaseFirestore.Transaction;
type Ref = FirebaseFirestore.DocumentReference;
export const ERASURE_QUEUE = 'bq_erasure';
const HOUR = 60 * 60_000;
/** Longer than the streaming buffer holds rows (~90 min). */
export const HOLD_MS = 3 * HOUR;
export const OVERDUE_MS = 7 * 24 * HOUR;
/** 6 h, 12 h, 24 h, then every 48 h: well inside the 30 days even with a daily job. */
export const backoffMs = (attempts: number): number =>
  Math.min(6 * HOUR * 2 ** (attempts - 1), 48 * HOUR);
export const BUDGET_STATEMENTS = 16;
export const BUDGET_MS = 60_000;
const BATCH = 500;
const QUERY_URL = 'https://bigquery.googleapis.com/bigquery/v2/projects/johnb-2025/queries';

/** Tables with a user_hash column. */
export const ERASABLE_TABLES = (Object.keys(BQ_TABLES) as BqTable[]).filter(
  (t) => 'user_hash' in BQ_TABLES[t]
);

const iso = (ms: number): string => new Date(ms).toISOString();
const queueRef = (db: Db, hash: string): Ref => db.collection(ERASURE_QUEUE).doc(hash);

/** Queues (or re-queues, from scratch) these accounts' hashes. None without LOG_HASH_SECRET. */
export async function queueBqErasure(
  db: Db,
  userIds: readonly string[],
  env: Env = process.env,
  now: Date = new Date()
): Promise<number> {
  const hashes = [...new Set(userIds.map((id) => bqHash('user', id, env)))].filter(
    (h): h is string => h !== null
  );
  const doc = {
    queuedAt: now.toISOString(),
    nextAttemptAt: iso(now.getTime() + HOLD_MS),
    attempts: 0,
    doneTables: [],
  };
  await Promise.all(
    hashes.map((h) => db.runTransaction(async (tx) => void tx.set(queueRef(db, h), doc)))
  );
  return hashes.length;
}

/** Runs one parameterised DML statement within timeoutMs; resolves when it completed. */
export type RunDml = (sql: string, hashes: readonly string[], timeoutMs: number) => Promise<void>;

async function runDml(sql: string, hashes: readonly string[], timeoutMs: number): Promise<void> {
  const { GoogleAuth } = await import('google-auth-library');
  const client = await new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/bigquery'],
  }).getClient();
  const res = await client.request<{ jobComplete?: boolean; errors?: unknown[] }>({
    url: QUERY_URL,
    method: 'POST',
    timeout: timeoutMs,
    data: {
      query: sql,
      useLegacySql: false,
      timeoutMs: Math.max(timeoutMs - 1_000, 1_000),
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

interface Due {
  hash: string;
  queuedAt: string;
  attempts: number;
  done: Set<string>;
}

/** Applies `write` only if the doc is still the one this run read (same queuedAt). */
async function ifUnchanged(db: Db, q: Due, write: (tx: Tx, ref: Ref) => void): Promise<void> {
  const ref = queueRef(db, q.hash);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.queuedAt === q.queuedAt) write(tx, ref);
  });
}

/** Due docs, oldest first; a doc missing nextAttemptAt counts as due at queuedAt + HOLD_MS. */
async function dueDocs(db: Db, now: number): Promise<Due[]> {
  const col = db.collection(ERASURE_QUEUE);
  const [scheduled, all] = await Promise.all([
    col.where('nextAttemptAt', '<=', iso(now)).orderBy('nextAttemptAt').limit(BATCH).get(),
    col
      .where('queuedAt', '<=', iso(now - HOLD_MS))
      .orderBy('queuedAt')
      .limit(BATCH)
      .get(),
  ]);
  const legacy = all.docs.filter((d) => typeof d.data().nextAttemptAt !== 'string');
  return [...scheduled.docs, ...legacy]
    .filter((d) => /^[0-9a-f]{32}$/.test(d.id) && typeof d.data().queuedAt === 'string')
    .slice(0, BATCH)
    .map((d) => {
      const data = d.data();
      const done = Array.isArray(data.doneTables) ? data.doneTables.map(String) : [];
      const attempts = typeof data.attempts === 'number' ? data.attempts : 0;
      return { hash: d.id, queuedAt: String(data.queuedAt), attempts, done: new Set(done) };
    });
}

/**
 * Deletes, per table, the rows of the due hashes that haven't finished it. One statement per
 * table first; then the failed ones are bisected while the budget lasts. Each success is
 * recorded at once. A hash left with any table not done backs off; a finished one is dequeued.
 */
export async function runBqErasure(
  db: Db,
  opts: { run?: RunDml; now?: Date; clock?: () => number } = {}
): Promise<ErasureRun> {
  const run = opts.run ?? runDml;
  const clock = opts.clock ?? Date.now;
  const now = (opts.now ?? new Date()).getTime();
  const until = clock() + BUDGET_MS;
  let statements = 0;
  const due = await dueDocs(db, now);

  /** One DELETE; on success the table is marked done for those hashes. False if it failed or no budget. */
  const attempt = async (table: BqTable, qs: Due[]): Promise<boolean> => {
    const left = until - clock();
    if (statements >= BUDGET_STATEMENTS || left <= 0) return false;
    statements++;
    const sql = `DELETE FROM \`johnb-2025.ferni_events.${table}\` WHERE user_hash IN UNNEST(@hashes)`;
    try {
      await run(
        sql,
        qs.map((q) => q.hash),
        left
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : 'unknown';
      log.warn({ table, hashes: qs.length, error: name }, 'BQ erasure statement failed');
      return false;
    }
    await Promise.all(
      qs.map(async (q) => {
        q.done.add(table);
        await ifUnchanged(db, q, (tx, ref) => tx.update(ref, { doneTables: [...q.done] }));
      })
    );
    return true;
  };
  const bisect = async (table: BqTable, qs: Due[]): Promise<void> => {
    const half = Math.ceil(qs.length / 2);
    for (const part of [qs.slice(0, half), qs.slice(half)]) {
      // eslint-disable-next-line no-await-in-loop -- statements run one at a time, in budget
      if (part.length > 0 && !(await attempt(table, part)) && part.length > 1)
        await bisect(table, part); // eslint-disable-line no-await-in-loop
    }
  };

  const pending = (t: BqTable): Due[] => due.filter((q) => !q.done.has(t));
  const failed: BqTable[] = [];
  for (const table of ERASABLE_TABLES) {
    // eslint-disable-next-line no-await-in-loop -- one table at a time
    if (pending(table).length > 0 && !(await attempt(table, pending(table)))) failed.push(table);
  }
  for (const table of failed) {
    // eslint-disable-next-line no-await-in-loop -- one table at a time
    if (pending(table).length > 1) await bisect(table, pending(table));
  }

  const finished = due.filter((q) => ERASABLE_TABLES.every((t) => q.done.has(t)));
  const retry = due.filter((q) => !finished.includes(q));
  await Promise.all([
    ...finished.map(async (q) => ifUnchanged(db, q, (tx, ref) => tx.delete(ref))),
    ...retry.map(async (q) =>
      ifUnchanged(db, q, (tx, ref) =>
        tx.update(ref, {
          attempts: q.attempts + 1,
          nextAttemptAt: iso(now + backoffMs(q.attempts + 1)),
        })
      )
    ),
  ]);
  const overdue = await reportOverdue(db, now);
  const failedTables = ERASABLE_TABLES.filter((t) => pending(t).length > 0);
  return {
    due: due.length,
    erased: finished.length,
    retrying: retry.length,
    failedTables,
    overdue,
  };
}

/** Logs BQ_ERASURE_OVERDUE (error level, for alerting) when any hash is queued past OVERDUE_MS. */
async function reportOverdue(db: Db, now: number): Promise<number> {
  const snap = await db
    .collection(ERASURE_QUEUE)
    .where('queuedAt', '<=', iso(now - OVERDUE_MS))
    .orderBy('queuedAt')
    .limit(BATCH)
    .get();
  if (snap.docs.length > 0) {
    const oldestQueuedAt = String(snap.docs[0]?.data().queuedAt ?? '');
    log.error({ overdue: snap.docs.length, oldestQueuedAt }, 'BQ_ERASURE_OVERDUE');
  }
  return snap.docs.length;
}
