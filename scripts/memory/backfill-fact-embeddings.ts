#!/usr/bin/env npx tsx
/**
 * Stores a retrieval vector beside every existing dynamic_facts document, so
 * RECALL_VECTOR_INDEX can find a caller's older facts by meaning
 * (memory/recall/stored-fact-vectors.ts). The live writer only embeds facts
 * written while the flag is on (memory/dynamic/fact-embeddings.ts); none of the
 * 14,915 prod facts had a vector on 2026-10-22.
 *
 * Same text, embedder, task type and fields as the live writer, so the read path
 * trusts the vector: storedFactText, defaultEmbedder('document'), and
 * embedding (768-d Firestore vector) + embeddingModel + embeddingTask, plus
 * embeddedAt. update() writes only those fields and never recreates a document
 * that was deleted (forgotten) mid-run.
 *
 * Dry run by default: reads and counts, no embedding calls, no writes, no cursor.
 * Logs counts only, never fact text or user ids.
 *
 * USAGE:
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/memory/backfill-fact-embeddings.ts \
 *     --database=ferni-dev [--dry-run=false] [--rate=5] [--batch=20] [--limit=N] \
 *     [--owner=<user id prefix>] [--cursor=<file>] [--restart]
 *   (default) also needs --confirm-prod, with FIRESTORE_DATABASE unset.
 *
 * Resumable: after each batch the last document path goes to the cursor file
 * (real runs only); --restart ignores it. Idempotent: a document that already
 * has a 768-d vector from this model and task is skipped.
 *
 * @module scripts/memory/backfill-fact-embeddings
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FieldPath, FieldValue, Firestore } from '@google-cloud/firestore';
import {
  defaultEmbedder,
  defaultEmbeddingModel,
  type RetrievalEmbedder,
} from '../../src/memory/recall/semantic-recall.js';
import {
  EMBEDDING_TASK,
  FACT_VECTOR_DIMENSION,
  storedFactText,
  vectorOf,
} from '../../src/memory/recall/stored-fact-vectors.js';

/** The fields this script reads; the vector is read only to skip documents that have one. */
const READ_FIELDS = ['entityName', 'key', 'value', 'embedding', 'embeddingModel', 'embeddingTask'];
/** The only fields it ever writes. */
export const WRITTEN_FIELDS = ['embedding', 'embeddingModel', 'embeddingTask', 'embeddedAt'];

export interface FactDoc {
  path: string;
  data: Record<string, unknown>;
}

/** The slice of Firestore the backfill touches, so tests can pass a fake. */
export interface FactSource {
  /** Up to `size` dynamic_facts documents, in document-path order, after `after`. */
  page(after: string | undefined, size: number): Promise<FactDoc[]>;
  /** Sets these fields only; rejects when the document no longer exists. */
  update(path: string, fields: Record<string, unknown>): Promise<void>;
}

export interface BackfillOptions {
  database: string;
  dryRun: boolean;
  /** Embedding requests per second. */
  rate: number;
  /** Facts per embedding request. */
  batch: number;
  limit?: number;
  /** Only users whose id starts with this. */
  owner?: string;
}

export interface BackfillDeps {
  source: FactSource;
  embed: RetrievalEmbedder;
  model: string;
  cursor: { read(): string | undefined; write(after: string): void };
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (counts: Record<string, unknown>) => void;
}

export interface BackfillCounts {
  scanned: number;
  alreadyEmbedded: number;
  noText: number;
  toEmbed: number;
  embedded: number;
  gone: number;
  failed: number;
  requests: number;
  chars: number;
}

/** Why this run must not touch `database`, or undefined when it may. */
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

/** True when the document already has this model's document vector of the index's size. */
export function hasVector(d: Record<string, unknown>, model: string): boolean {
  return (
    d.embeddingModel === model &&
    d.embeddingTask === EMBEDDING_TASK &&
    vectorOf(d.embedding)?.length === FACT_VECTOR_DIMENSION
  );
}

const NOT_FOUND = 5;

export async function backfill(opts: BackfillOptions, deps: BackfillDeps): Promise<BackfillCounts> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const c: BackfillCounts = {
    scanned: 0,
    alreadyEmbedded: 0,
    noText: 0,
    toEmbed: 0,
    embedded: 0,
    gone: 0,
    failed: 0,
    requests: 0,
    chars: 0,
  };
  const gap = 1000 / opts.rate;
  let nextAt = 0;
  let after = opts.dryRun ? undefined : deps.cursor.read();
  const pageSize = Math.max(opts.batch * 10, 200);

  for (;;) {
    const docs = await deps.source.page(after, pageSize);
    if (docs.length === 0) break;
    const room = opts.limit === undefined ? docs.length : opts.limit - c.scanned;
    const seen = docs.slice(0, Math.max(room, 0));
    for (let i = 0; i < seen.length; i += opts.batch) {
      const group = seen.slice(i, i + opts.batch);
      const todo: Array<{ doc: FactDoc; text: string }> = [];
      for (const doc of group) {
        c.scanned++;
        const owner = doc.path.split('/')[1] ?? '';
        if (opts.owner && !owner.startsWith(opts.owner)) continue;
        if (hasVector(doc.data, deps.model)) c.alreadyEmbedded++;
        else if (!doc.data.value) c.noText++;
        else todo.push({ doc, text: storedFactText(doc.data) });
      }
      c.toEmbed += todo.length;
      c.chars += todo.reduce((n, t) => n + t.text.length, 0);
      if (!opts.dryRun && todo.length > 0) {
        const wait = nextAt - now();
        if (wait > 0) await sleep(wait);
        nextAt = Math.max(now(), nextAt) + gap;
        c.requests++;
        const vectors = await deps.embed(
          todo.map((t) => t.text),
          'document'
        );
        // A provider other than the index's (no Vertex project: OpenAI or local) stops the run.
        if (vectors.some((v) => v?.length !== FACT_VECTOR_DIMENSION)) {
          throw new Error(`Embedder returned vectors that are not ${FACT_VECTOR_DIMENSION}-d`);
        }
        const embeddedAt = new Date().toISOString();
        const results = await Promise.allSettled(
          todo.map((t, j) =>
            deps.source.update(t.doc.path, {
              embedding: FieldValue.vector(vectors[j]),
              embeddingModel: deps.model,
              embeddingTask: EMBEDDING_TASK,
              embeddedAt,
            })
          )
        );
        for (const r of results) {
          if (r.status === 'fulfilled') c.embedded++;
          else if ((r.reason as { code?: number })?.code === NOT_FOUND) c.gone++;
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

/** dynamic_facts across all users of one database, by document path. */
export function firestoreFactSource(db: Firestore): FactSource {
  return {
    async page(after, size) {
      let q = db
        .collectionGroup('dynamic_facts')
        .orderBy(FieldPath.documentId())
        .select(...READ_FIELDS)
        .limit(size);
      if (after) q = q.startAfter(after);
      const snap = await q.get();
      return snap.docs.map((d) => ({ path: d.ref.path, data: d.data() }));
    },
    async update(path, fields) {
      await db.doc(path).update(fields);
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
    owner: arg(argv, 'owner'),
  };
  const badLimit = opts.limit !== undefined && !(opts.limit > 0);
  if (!(opts.rate > 0) || !(opts.batch > 0 && opts.batch <= 100) || badLimit) {
    throw new Error('--rate and --limit must be > 0, --batch 1..100');
  }
  const file = arg(argv, 'cursor') ?? `backfill-fact-embeddings.${database}.cursor`;
  const restart = argv.includes('--restart');
  const db = new Firestore({ projectId, databaseId: database, ignoreUndefinedProperties: true });
  const model = await defaultEmbeddingModel();
  const log = (counts: Record<string, unknown>) =>
    console.log(JSON.stringify({ database, dryRun: opts.dryRun, model, ...counts }));
  const counts = await backfill(opts, {
    source: firestoreFactSource(db),
    embed: defaultEmbedder,
    model,
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
