#!/usr/bin/env npx tsx
/**
 * Copies what callers asked Ferni to remember before REMEMBER_TO_RECALL into
 * dynamic_facts, so recall can find it by meaning (#2474,
 * memory/dynamic/remembered-facts.ts). rememberAboutUser wrote only
 * bogle_users/{uid}/memories, which recall never reads.
 *
 * Which memories: written by rememberAboutUser through the memory service (id
 * mem_..., type 'summary', not archived). Its 'goal' category is stored as
 * 'commitment', the same type the after-call signal extractor writes, so goals
 * are left out rather than copying call lines as things the caller asserted.
 *
 * The same document the live write makes (rememberedFactDoc: caller_asserted,
 * factDocId id, the spoken-credential filter), embedded the same way, and
 * created only: a fact already there, including one the caller forgot, is
 * never written over, so a rerun changes nothing.
 *
 * Dry run by default: reads and counts, no embedding calls, no writes, no cursor.
 * Logs counts only, never memory text or user ids.
 *
 * USAGE:
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/memory/backfill-remembered-facts.ts \
 *     --database=ferni-dev [--dry-run=false] [--rate=5] [--batch=20] [--limit=N] \
 *     [--uid=<user id>] [--cursor=<file>] [--restart]
 *   (default) also needs --confirm-prod, with FIRESTORE_DATABASE unset.
 *
 * Resumable: after each batch the last memory path goes to the cursor file
 * (real runs only); --restart ignores it.
 *
 * @module scripts/memory/backfill-remembered-facts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FieldPath, Firestore } from '@google-cloud/firestore';
import { withFactEmbeddings } from '../../src/memory/dynamic/fact-embeddings.js';
import { rememberedFactDoc, type FactDocWrite } from '../../src/memory/dynamic/remembered-facts.js';
import {
  defaultEmbedder,
  defaultEmbeddingModel,
  type RetrievalEmbedder,
} from '../../src/memory/recall/semantic-recall.js';

const READ_FIELDS = ['content', 'type', 'archived'];
const ALREADY_EXISTS = 6;

export interface MemoryDoc {
  /** bogle_users/{uid}/memories/{id} */
  path: string;
  data: Record<string, unknown>;
}

/** The slice of Firestore the backfill touches, so tests can pass a fake. */
export interface MemorySource {
  /** Up to `size` memories documents, in path order, after `after`. */
  page(after: string | undefined, size: number): Promise<MemoryDoc[]>;
  /** Creates the fact in the user's dynamic_facts; rejects (code 6) when it is already there. */
  create(userId: string, doc: FactDocWrite): Promise<void>;
}

export interface BackfillOptions {
  database: string;
  dryRun: boolean;
  /** Batches per second. */
  rate: number;
  /** Memories per embedding request. */
  batch: number;
  limit?: number;
  /** Only this user. */
  uid?: string;
}

export interface BackfillDeps {
  source: MemorySource;
  embed: RetrievalEmbedder;
  model: () => Promise<string>;
  cursor: { read(): string | undefined; write(after: string): void };
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (counts: Record<string, unknown>) => void;
}

export interface BackfillCounts {
  scanned: number;
  /** Not written by rememberAboutUser, or archived. */
  skipped: number;
  /** Empty, or a spoken credential. */
  notKept: number;
  toWrite: number;
  created: number;
  /** Already in dynamic_facts (the live write, an earlier run, or forgotten). */
  existing: number;
  failed: number;
  requests: number;
}

/** Why this run must not touch `database`, or undefined when it may (as backfill-fact-embeddings). */
export function databaseRefusal(
  database: string | undefined,
  argv: readonly string[],
  env: Record<string, string | undefined>
): string | undefined {
  if (!database) return 'Refusing: --database is required (ferni-dev, or (default) for prod).';
  if (database !== '(default)') return undefined;
  if (!argv.includes('--confirm-prod')) return 'Refusing (default): pass --confirm-prod.';
  if (env.FIRESTORE_DATABASE) {
    return 'Refusing (default): FIRESTORE_DATABASE is set; unset it to run against prod.';
  }
  return undefined;
}

/** A memory rememberAboutUser wrote (memory-service.ts write: fact -> 'summary'), still live. */
export function isRemembered(doc: MemoryDoc): boolean {
  const [root, , , id] = doc.path.split('/');
  return (
    root === 'bogle_users' &&
    (id ?? '').startsWith('mem_') &&
    doc.data.type === 'summary' &&
    doc.data.archived !== true
  );
}

export async function backfill(opts: BackfillOptions, deps: BackfillDeps): Promise<BackfillCounts> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const c: BackfillCounts = {
    scanned: 0,
    skipped: 0,
    notKept: 0,
    toWrite: 0,
    created: 0,
    existing: 0,
    failed: 0,
    requests: 0,
  };
  const model = opts.dryRun ? undefined : await deps.model();
  const gap = 1000 / opts.rate;
  let nextAt = 0;
  let after = opts.dryRun ? undefined : deps.cursor.read();
  const pageSize = Math.max(opts.batch * 10, 200);
  const at = new Date(now()).toISOString();

  for (;;) {
    const docs = await deps.source.page(after, pageSize);
    if (docs.length === 0) break;
    const room = opts.limit === undefined ? docs.length : opts.limit - c.scanned;
    const seen = docs.slice(0, Math.max(room, 0));
    for (let i = 0; i < seen.length; i += opts.batch) {
      const group = seen.slice(i, i + opts.batch);
      const todo: Array<{ userId: string; doc: FactDocWrite }> = [];
      for (const doc of group) {
        c.scanned++;
        const [, userId = '', , memoryId = ''] = doc.path.split('/');
        if ((opts.uid && userId !== opts.uid) || !isRemembered(doc)) {
          c.skipped++;
          continue;
        }
        const fact = rememberedFactDoc({ fact: String(doc.data.content ?? ''), memoryId }, at);
        if (fact) todo.push({ userId, doc: fact });
        else c.notKept++;
      }
      c.toWrite += todo.length;
      if (!opts.dryRun && todo.length > 0) {
        const wait = nextAt - now();
        if (wait > 0) await sleep(wait);
        nextAt = Math.max(now(), nextAt) + gap;
        c.requests++;
        const embedded = await withFactEmbeddings(
          todo.map((t) => t.doc.data),
          { enabled: true, embed: deps.embed, model: async () => model ?? '' }
        );
        const results = await Promise.allSettled(
          todo.map((t, j) => deps.source.create(t.userId, { id: t.doc.id, data: embedded[j] }))
        );
        for (const r of results) {
          if (r.status === 'fulfilled') c.created++;
          else if ((r.reason as { code?: number })?.code === ALREADY_EXISTS) c.existing++;
          else c.failed++;
        }
      }
      after = group[group.length - 1].path;
      if (!opts.dryRun) deps.cursor.write(after);
    }
    deps.log?.({ ...c });
    if (seen.length < docs.length || (opts.limit !== undefined && c.scanned >= opts.limit)) break;
  }
  return c;
}

/** bogle_users/{uid}/memories (one user, or all by collection group), by path. */
export function firestoreMemorySource(db: Firestore, uid?: string): MemorySource {
  return {
    async page(after, size) {
      let q = (
        uid
          ? db.collection('bogle_users').doc(uid).collection('memories')
          : db.collectionGroup('memories')
      )
        .orderBy(FieldPath.documentId())
        .select(...READ_FIELDS)
        .limit(size);
      // One user's collection orders by document id, the collection group by path.
      if (after) q = q.startAfter(uid ? after.split('/').pop() : after);
      const snap = await q.get();
      return snap.docs.map((d) => ({ path: d.ref.path, data: d.data() }));
    },
    async create(userId, doc) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('dynamic_facts')
        .doc(doc.id)
        .create(doc.data);
    },
  };
}

function arg(argv: readonly string[], name: string): string | undefined {
  return argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(argv: readonly string[]): Promise<void> {
  const database = arg(argv, 'database');
  const refusal = databaseRefusal(database, argv, process.env);
  if (refusal || !database) throw new Error(refusal);
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT is required (Firestore and Vertex).');
  const limit = arg(argv, 'limit');
  const opts: BackfillOptions = {
    database,
    dryRun: arg(argv, 'dry-run') !== 'false',
    rate: Number(arg(argv, 'rate') ?? 5),
    batch: Number(arg(argv, 'batch') ?? 20),
    limit: limit === undefined ? undefined : Number(limit),
    uid: arg(argv, 'uid'),
  };
  const badLimit = opts.limit !== undefined && !(opts.limit > 0);
  if (!(opts.rate > 0) || !(opts.batch > 0 && opts.batch <= 100) || badLimit) {
    throw new Error('--rate and --limit must be > 0, --batch 1..100');
  }
  const file = arg(argv, 'cursor') ?? `backfill-remembered-facts.${database}.cursor`;
  const restart = argv.includes('--restart');
  const db = new Firestore({ projectId, databaseId: database, ignoreUndefinedProperties: true });
  const log = (counts: Record<string, unknown>) =>
    console.log(JSON.stringify({ database, dryRun: opts.dryRun, ...counts }));
  const counts = await backfill(opts, {
    source: firestoreMemorySource(db, opts.uid),
    embed: defaultEmbedder,
    model: defaultEmbeddingModel,
    cursor: {
      read: () => (!restart && existsSync(file) ? readFileSync(file, 'utf8').trim() : undefined),
      write: (after) => writeFileSync(file, after),
    },
    log,
  });
  log({ done: true, ...counts });
  if (counts.failed > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
