#!/usr/bin/env npx tsx
/**
 * Copies what callers asked Ferni to remember before REMEMBER_TO_RECALL into
 * dynamic_facts, so recall can find it by meaning (#2474,
 * memory/dynamic/remembered-facts.ts). rememberAboutUser wrote only
 * bogle_users/{uid}/memories, which recall never reads.
 *
 * Which memories: rememberAboutUser's (id mem_..., type 'summary', not archived). Its
 * 'goal' category is stored as 'commitment', the type the after-call signal extractor
 * writes, so goals are left out rather than copying call lines as caller assertions.
 *
 * The live write's document (rememberedFactDoc: caller_asserted, factDocId id, the
 * credential filters), embedded the same way, created only: a fact already there, even
 * one the caller forgot, is never written over, so a rerun changes nothing.
 *
 * Never copied: a credential, a non-member's memory, one marked forgottenAt, and with
 * FORGET_EVERY_READER one about a forgotten topic (read fresh per batch, fails closed).
 * What the word rules let through gets the live write's model check (secret-check.ts
 * readSecret, at most 4 at once) and is embedded and written only on a clear no: a
 * timeout, error, unclear reply or missing model counts unchecked. A fact whose vector
 * can't be made counts noVector and is not written, so a rerun can still embed it.
 *
 * Dry run by default (reads and counts; no model calls, embedding, writes or cursor):
 * toCheck is how many model calls a real run makes. Logs counts only, never fact text.
 *
 * USAGE:
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/memory/backfill-remembered-facts.ts \
 *     --database=ferni-dev [--dry-run=false] [--rate=5] [--batch=20] [--limit=N] \
 *     [--uid=<user id>] [--cursor=<file>] [--restart]
 *   (default) also needs --confirm-prod, with FIRESTORE_DATABASE unset. Resumable: each
 *   batch's last memory path goes to the cursor file (real runs only); --restart ignores it.
 *   The cursor is the run's own: the default file is per database and --uid, and a file
 *   saved by another scope is refused. It stops moving at the first batch with an
 *   unchecked, noVector or failed fact, so a rerun retries from there (create-only).
 *
 * @module scripts/memory/backfill-remembered-facts
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FieldPath, Firestore } from '@google-cloud/firestore';
import { CLASSIFICATION_MODEL } from '../../src/config/gemini-config.js';
import { withFactEmbeddings } from '../../src/memory/dynamic/fact-embeddings.js';
import { rememberedFactDoc, type FactDocWrite } from '../../src/memory/dynamic/remembered-facts.js';
import {
  aboutForgotten,
  forgetEveryReaderEnabled,
  type ForgottenCheck,
} from '../../src/memory/recall/forget-every-reader.js';
import { parseTopics } from '../../src/memory/recall/forget.js';
import {
  defaultEmbedder,
  defaultEmbeddingModel,
  type RetrievalEmbedder,
} from '../../src/memory/recall/semantic-recall.js';
import {
  readSecret,
  type SecretCheckDeps,
  type SecretRead,
} from '../../src/memory/secret-check.js';
import { isMemberIdentity } from '../../src/services/identity/member-identity.js';
import { createGeminiCrisisGenerate } from '../../src/services/safety/crisis-classifier.js';

const READ_FIELDS = ['content', 'type', 'archived', 'forgottenAt'];
const ALREADY_EXISTS = 6;
/** Secret-check model calls in flight at once. */
const CHECK_CONCURRENCY = 4;

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
  /** The user's forgotten topics (memory_state/forgotten); null when they can't be read. */
  forgottenTopics(userId: string): Promise<string[] | null>;
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
  /** The live write's model check; no model reads as unchecked (fails closed). */
  secretCheck?: SecretCheckDeps;
  cursor: { read(): string | undefined; write(after: string): void };
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (counts: Record<string, unknown>) => void;
}

export interface BackfillCounts {
  scanned: number;
  /** Not written by rememberAboutUser, or archived. */
  skipped: number;
  /** Empty, or a credential (rememberedFactDoc). */
  notKept: number;
  notMember: number; // a placeholder, anon: or onbehalf: id is one bucket for many callers
  /** Marked forgottenAt, or about a forgotten topic (FORGET_EVERY_READER), or topics unreadable. */
  forgotten: number;
  /** Past the word rules: one model call each in a real run, none in a dry run. */
  toCheck: number;
  /** The model read a secret: not embedded or written. */
  secret: number;
  /** No clear answer (timeout, error, unclear reply, no model): not embedded or written. */
  unchecked: number;
  /** A clear no: to embed and create. */
  toWrite: number;
  /** No vector could be made: not written, so a rerun can embed it. */
  noVector: number;
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

/** forgottenCheck (forget-every-reader.ts) over --database, not the agent's client; null when off. */
export async function forgottenCheckFor(
  userId: string,
  source: MemorySource,
  env: Record<string, string | undefined> = process.env
): Promise<ForgottenCheck | null> {
  if (!forgetEveryReaderEnabled(env) || !isMemberIdentity(userId)) return null;
  const topics = await source.forgottenTopics(userId).catch((): null => null);
  return topics === null ? () => true : (text) => aboutForgotten(text, topics); // null: fail closed
}

export async function backfill(opts: BackfillOptions, deps: BackfillDeps): Promise<BackfillCounts> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const c: BackfillCounts = {
    scanned: 0,
    skipped: 0,
    notKept: 0,
    notMember: 0,
    forgotten: 0,
    toCheck: 0,
    secret: 0,
    unchecked: 0,
    toWrite: 0,
    noVector: 0,
    created: 0,
    existing: 0,
    failed: 0,
    requests: 0,
  };
  const model = opts.dryRun ? undefined : await deps.model();
  const gap = 1000 / opts.rate;
  let nextAt = 0;
  let after = opts.dryRun ? undefined : deps.cursor.read();
  let held = false; // a batch left something to retry: the cursor stays before it
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
      const checks = new Map<string, Promise<ForgottenCheck | null>>(); // read fresh each batch
      const forgottenOf = (u: string) => checks.get(u) ?? checks.set(u, forgottenCheckFor(u, deps.source)).get(u); // prettier-ignore
      for (const doc of group) {
        c.scanned++;
        const [, userId = '', , memoryId = ''] = doc.path.split('/');
        if ((opts.uid && userId !== opts.uid) || !isRemembered(doc)) {
          c.skipped++;
          continue;
        }
        if (!isMemberIdentity(userId)) {
          c.notMember++;
          continue;
        }
        const fact = rememberedFactDoc({ fact: String(doc.data.content ?? ''), memoryId }, at);
        const about = fact && (await forgottenOf(userId))?.(String(fact.data.value));
        if (!fact) c.notKept++;
        else if (doc.data.forgottenAt != null || about) c.forgotten++;
        else todo.push({ userId, doc: fact });
      }
      c.toCheck += todo.length;
      if (!opts.dryRun && todo.length > 0) {
        const retry = c.unchecked + c.noVector + c.failed;
        const reads = await readSecrets(todo.map((t) => String(t.doc.data.value)), deps.secretCheck); // prettier-ignore
        c.secret += reads.filter((r) => r === 'secret').length;
        c.unchecked += reads.filter((r) => r === 'failed').length;
        const clear = todo.filter((_, j) => reads[j] === 'clear');
        c.toWrite += clear.length;
        if (clear.length > 0) {
          const wait = nextAt - now();
          if (wait > 0) await sleep(wait);
          nextAt = Math.max(now(), nextAt) + gap;
          c.requests++;
          const embedded = await withFactEmbeddings(
            clear.map((t) => t.doc.data),
            { enabled: true, embed: deps.embed, model: async () => model ?? '' }
          );
          // Created without a vector it would stay so: a create-only rerun finds it existing
          const ready = clear
            .map((t, j) => ({ userId: t.userId, doc: { id: t.doc.id, data: embedded[j] } }))
            .filter((t) => t.doc.data.embedding !== undefined);
          c.noVector += clear.length - ready.length;
          const results = await Promise.allSettled(
            ready.map((t) => deps.source.create(t.userId, t.doc))
          );
          for (const r of results) {
            if (r.status === 'fulfilled') c.created++;
            else if ((r.reason as { code?: number })?.code === ALREADY_EXISTS) c.existing++;
            else c.failed++;
          }
        }
        held ||= c.unchecked + c.noVector + c.failed > retry;
      }
      after = group[group.length - 1].path;
      if (!opts.dryRun && !held) deps.cursor.write(after);
    }
    deps.log?.({ ...c });
    if (seen.length < docs.length || (opts.limit !== undefined && c.scanned >= opts.limit)) break;
  }
  return c;
}

/** readSecret for each text (word rules already passed), at most CHECK_CONCURRENCY at once. */
async function readSecrets(
  texts: string[],
  deps: SecretCheckDeps | undefined
): Promise<SecretRead[]> {
  const reads: SecretRead[] = [];
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < texts.length; i = next++) reads[i] = await readSecret(texts[i], deps);
  };
  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, texts.length) }, worker));
  return reads;
}

/** The default cursor file, per database and --uid (hashed), so a trial never moves the full run's. */
export function defaultCursorFile(database: string, uid?: string): string {
  const scope = uid ? `.uid-${createHash('sha256').update(uid).digest('hex').slice(0, 12)}` : '';
  return `backfill-remembered-facts.${database}${scope}.cursor`;
}

/** The cursor in `file`, saved with the run's --uid; one saved by another scope is refused. */
export function fileCursor(
  file: string,
  uid: string | undefined,
  restart: boolean
): BackfillDeps['cursor'] {
  const scope = uid ?? null;
  return {
    read() {
      if (restart || !existsSync(file)) return undefined;
      let saved: { uid?: unknown; after?: unknown } = {};
      try {
        saved = JSON.parse(readFileSync(file, 'utf8')) as typeof saved;
      } catch {
        // not one this version wrote: refused below
      }
      if (saved.uid !== scope || typeof saved.after !== 'string') {
        throw new Error(`Refusing: ${file} was saved by another run (--uid or full); pass --restart or another --cursor.`); // prettier-ignore
      }
      return saved.after;
    },
    write: (after) => writeFileSync(file, JSON.stringify({ uid: scope, after })),
  };
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
    async forgottenTopics(userId) {
      const doc = await db.doc(`bogle_users/${userId}/memory_state/forgotten`).get();
      return parseTopics(doc.exists ? doc.data()?.topics : undefined);
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
  const file = arg(argv, 'cursor') ?? defaultCursorFile(database, opts.uid);
  const db = new Firestore({ projectId, databaseId: database, ignoreUndefinedProperties: true });
  const log = (counts: Record<string, unknown>) =>
    console.log(JSON.stringify({ database, dryRun: opts.dryRun, ...counts }));
  const counts = await backfill(opts, {
    source: firestoreMemorySource(db, opts.uid),
    embed: defaultEmbedder,
    model: defaultEmbeddingModel,
    // As agents/remembered-fact-store-register.ts hands the live write
    secretCheck: { model: createGeminiCrisisGenerate(CLASSIFICATION_MODEL) },
    cursor: fileCursor(file, opts.uid, argv.includes('--restart')),
    log,
  });
  log({ done: true, ...counts });
  if (counts.failed + counts.unchecked + counts.noVector > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
