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
 * one the caller forgot, is never written over, sent to the model or embedded again.
 *
 * Forgotten, always (no flag): every memory here predates the forget that covers it,
 * and forgetTopic only marks the fact collections, so each user's recorded topics are
 * read (forget.ts readForgottenTopics, fresh per batch) and a memory about one is never
 * checked, embedded or written. forgetTopic's own match (isForgotten over factText) and
 * the readers' (aboutForgotten) both count. A user whose topics can't be read is skipped
 * whole (unreadUsers). Account erasure deletes the memories with the record; there is
 * no forget-everything marker to honour.
 *
 * What the word rules let through gets the live write's model check (secret-check.ts
 * readSecret, at most 4 at once) and is embedded and written only on a clear no: a
 * timeout, error, unclear reply or missing model counts unchecked. A fact whose vector
 * can't be made counts noVector and is not written, so a rerun can still embed it.
 *
 * Dry run by default (reads and counts; no model calls, embedding, writes or cursor):
 * toCheck is how many model calls a real run makes. Logs counts only, never fact text.
 *
 * USAGE:
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 LLM_CLASSIFICATION_MODEL=<agent's> GEMINI_LOCATION=<agent's> \
 *     npx tsx scripts/memory/backfill-remembered-facts.ts --database=ferni-dev \
 *     [--dry-run=false] [--rate=5] [--batch=20] [--limit=N] [--uid=<id>] [--cursor=<file>] [--restart]
 *   The model and region are read as the agent reads them (config/gemini-config.ts), from
 *   this shell: set them to the agent's values; the first log line shows both.
 *   (default) also needs --confirm-prod, with FIRESTORE_DATABASE unset. Resumable: each
 *   batch's last memory path goes to the cursor file (real runs only); --restart ignores it.
 *   The default file is per database and --uid, and a file saved by another scope is
 *   refused. It stops moving at the first batch with anything to retry, so a rerun
 *   retries from there; facts already written are skipped before the model call.
 *   Exits 1 when anything is left to retry (unchecked, noVector, failed, unreadUsers).
 *
 * @module scripts/memory/backfill-remembered-facts
 */

import { pathToFileURL } from 'node:url';
import { CLASSIFICATION_MODEL, GEMINI_LOCATION } from '../../src/config/gemini-config.js';
import { withFactEmbeddings } from '../../src/memory/dynamic/fact-embeddings.js';
import { rememberedFactDoc, type FactDocWrite } from '../../src/memory/dynamic/remembered-facts.js';
import { aboutForgotten } from '../../src/memory/recall/forget-every-reader.js';
import { factText, isForgotten } from '../../src/memory/recall/forget.js';
import type { RetrievalEmbedder } from '../../src/memory/recall/semantic-recall.js';
import {
  readSecret,
  type SecretCheckDeps,
  type SecretRead,
} from '../../src/memory/secret-check.js';
import { isMemberIdentity } from '../../src/services/identity/member-identity.js';
import {
  connect,
  defaultCursorFile,
  fileCursor,
  type Connect,
} from './backfill-remembered-facts-io.js';

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
  /** The user's forgotten topics (readForgottenTopics); null or a rejection when unreadable. */
  forgottenTopics(userId: string): Promise<string[] | null>;
  /** Which of `ids` are already in the user's dynamic_facts (written, or written and forgotten). */
  existing(userId: string, ids: string[]): Promise<Set<string>>;
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
  /** Marked forgottenAt, about a forgotten topic, or its user's topics unreadable. */
  forgotten: number;
  /** Users whose forgotten topics couldn't be read: none of their memories is copied. */
  unreadUsers: number;
  /** Already in dynamic_facts (the live write, an earlier run, or forgotten): left alone. */
  existing: number;
  /** Past the word rules, not yet written: one model call each in a real run, none in a dry run. */
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
  /** Not known to exist (that read failed), or the create failed. */
  failed: number;
  requests: number;
}

type Todo = { userId: string; doc: FactDocWrite };

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

/** About a recorded topic: what forgetTopic would have marked, or what a reader hides. */
export function aboutTopics(fact: FactDocWrite, topics: readonly string[]): boolean {
  const text = factText(fact.data);
  return isForgotten(text, topics) || aboutForgotten(text, topics);
}

/** Retries a rerun must make; the run exits 1 while any are left. */
export const leftToRetry = (c: BackfillCounts): number =>
  c.unchecked + c.noVector + c.failed + c.unreadUsers;

export async function backfill(opts: BackfillOptions, deps: BackfillDeps): Promise<BackfillCounts> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const c: BackfillCounts = { scanned: 0, skipped: 0, notKept: 0, notMember: 0, forgotten: 0, unreadUsers: 0, existing: 0, toCheck: 0, secret: 0, unchecked: 0, toWrite: 0, noVector: 0, created: 0, failed: 0, requests: 0 }; // prettier-ignore
  const model = opts.dryRun ? undefined : await deps.model();
  const gap = 1000 / opts.rate;
  let nextAt = 0;
  let after = opts.dryRun ? undefined : deps.cursor.read();
  let held = false; // a batch left something to retry: the cursor stays before it
  const unread = new Set<string>(); // skipped whole for the rest of the run
  const pageSize = Math.max(opts.batch * 10, 200);
  const at = new Date(now()).toISOString();

  for (;;) {
    const docs = await deps.source.page(after, pageSize);
    if (docs.length === 0) break;
    const room = opts.limit === undefined ? docs.length : opts.limit - c.scanned;
    const seen = docs.slice(0, Math.max(room, 0));
    for (let i = 0; i < seen.length; i += opts.batch) {
      const group = seen.slice(i, i + opts.batch);
      const retry = leftToRetry(c);
      const todo: Todo[] = [];
      const reads = new Map<string, Promise<string[] | null>>(); // read fresh each batch
      const topicsOf = (u: string) => reads.get(u) ?? reads.set(u, deps.source.forgottenTopics(u).catch((): null => null)).get(u)!; // prettier-ignore
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
        const topics = unread.has(userId) ? null : await topicsOf(userId);
        if (topics === null) unread.add(userId); // fails closed: the whole user waits
        const fact = rememberedFactDoc({ fact: String(doc.data.content ?? ''), memoryId }, at);
        if (topics === null || doc.data.forgottenAt != null) c.forgotten++;
        else if (!fact) c.notKept++;
        else if (aboutTopics(fact, topics)) c.forgotten++;
        else todo.push({ userId, doc: fact });
      }
      c.unreadUsers = unread.size;
      const fresh = await notWritten(todo, deps.source, c);
      c.toCheck += fresh.length;
      if (!opts.dryRun && fresh.length > 0) {
        const verdicts = await readSecrets(fresh.map((t) => String(t.doc.data.value)), deps.secretCheck); // prettier-ignore
        c.secret += verdicts.filter((r) => r === 'secret').length;
        c.unchecked += verdicts.filter((r) => r === 'failed').length;
        const clear = fresh.filter((_, j) => verdicts[j] === 'clear');
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
      }
      held ||= leftToRetry(c) > retry;
      after = group[group.length - 1].path;
      if (!opts.dryRun && !held) deps.cursor.write(after);
    }
    deps.log?.({ ...c });
    if (seen.length < docs.length || (opts.limit !== undefined && c.scanned >= opts.limit)) break;
  }
  return c;
}

/** The facts not yet in dynamic_facts, so a rerun never re-sends one to the model or embedder. */
async function notWritten(todo: Todo[], source: MemorySource, c: BackfillCounts): Promise<Todo[]> {
  const users = [...new Set(todo.map((t) => t.userId))];
  const have = await Promise.all(
    users.map((u) => source.existing(u, todo.filter((t) => t.userId === u).map((t) => t.doc.id)).catch((): null => null)) // prettier-ignore
  );
  return todo.filter((t) => {
    const known = have[users.indexOf(t.userId)];
    // Unknown: not sent, and the cursor holds so a rerun retries it
    if (!known) c.failed++;
    else if (known.has(t.doc.id)) c.existing++;
    return known?.has(t.doc.id) === false;
  });
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

function arg(argv: readonly string[], name: string): string | undefined {
  return argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** The run; its exit code: 1 on a refusal or error, or with anything left to retry. */
export async function main(
  argv: readonly string[],
  env: Record<string, string | undefined> = process.env,
  open: Connect = connect
): Promise<number> {
  try {
    const database = arg(argv, 'database');
    const refusal = databaseRefusal(database, argv, env);
    if (refusal || !database) throw new Error(refusal);
    const projectId = env.GOOGLE_CLOUD_PROJECT;
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
    const log = (counts: Record<string, unknown>) =>
      console.log(JSON.stringify({ database, dryRun: opts.dryRun, ...counts }));
    log({ secretModel: CLASSIFICATION_MODEL, geminiLocation: GEMINI_LOCATION });
    const counts = await backfill(opts, {
      ...open(projectId, database, opts.uid),
      cursor: fileCursor(file, opts.uid, argv.includes('--restart')),
      log,
    });
    log({ done: true, ...counts });
    return leftToRetry(counts) > 0 ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main(process.argv.slice(2)).then((code) => (process.exitCode = code));
}
