/**
 * Strip the caller's words from the router's other stores, as strip-router-event-words.ts
 * does for semantic_router_events (Seth, 2026-10-24: stop storing words, purge).
 *
 * Until 2026-10-25 these kept what the caller said; new documents keep only lengths, tool
 * ids and scores, and learned phrases aren't kept at all:
 *   routing_events                          input                       -> inputLength
 *   semantic_router_corrections             originalQuery, its args...  -> queryLength
 *   semantic_routing_feedback               inputText                   -> inputLength
 *   semantic_routing_corrections/*\/corrections  inputText              -> inputLength
 *   semantic_routing_vocabulary             phrases (each a past utterance) -> (deleted)
 *   semantic_router_community_patterns      queryExamples, keywords...  -> (dropped)
 *   user_tool_profiles                      vocabulary (map keyed by the caller's words and
 *                                           word pairs: names, numbers, "bank pin")  -> (deleted)
 * Each per-person document without an expireAt gets the one new documents get (its own
 * time + 30 d), so the TTL policies age it out; community patterns (tool pairs and counts,
 * shared by everyone) and tool profiles (the person's tool boosts) get none. Only the word
 * fields go: other fields stay, and no document is deleted. Dry run by default
 * (destructive-gate.ts): counts only, never ids or words. A rerun writes nothing.
 *
 *   npx tsx scripts/migrations/strip-router-store-words.ts
 *   npx tsx scripts/migrations/strip-router-store-words.ts --apply --confirm-project=johnb-2025
 *
 * FIRESTORE_DATABASE picks the database (default "(default)"), e.g. ferni-dev.
 */

import { pathToFileURL } from 'node:url';
import { destructiveMode, refusalMessage } from '../destructive-gate.js';
import { getFirestoreDatabase } from '../../src/config/environment.js';
import { ROUTING_EVENT_RETENTION_MS } from '../../src/tools/semantic-router/persistence/stored-without-words.js';
import { millis } from './strip-router-event-words.js';

type Data = Record<string, unknown>;
const PAGE = 400;

/** A collection's documents with words in fields: which go, which one's length is kept, and its time */
interface Target {
  /** A collection path; `*` stands for each document of the collection before it */
  path: string;
  words: readonly string[];
  /** The field whose length is kept, and the field it is kept in */
  length?: [from: string, to: string];
  /** The document's own time, for its expireAt; none for a store that doesn't expire */
  time?: string;
}

export const TARGETS: readonly Target[] = [
  { path: 'routing_events', words: ['input'], length: ['input', 'inputLength'], time: 'timestamp' },
  {
    path: 'semantic_router_corrections',
    // prettier-ignore
    words: ['originalQuery', 'normalizedQuery', 'predictedArgs', 'actualArgs', 'conversationContext', 'userFeedback'],
    length: ['originalQuery', 'queryLength'],
    time: 'timestamp',
  },
  {
    path: 'semantic_routing_feedback',
    words: ['inputText'],
    length: ['inputText', 'inputLength'],
    time: 'timestamp',
  },
  {
    path: 'semantic_routing_corrections/*/corrections',
    words: ['inputText'],
    length: ['inputText', 'inputLength'],
    time: 'timestamp',
  },
  // Every learned phrase, text or hash: the whole list goes
  { path: 'semantic_routing_vocabulary', words: ['phrases'], time: 'updatedAt' },
  {
    path: 'semantic_router_community_patterns',
    words: ['queryExamples', 'queryPattern', 'keywords'],
  },
  // personalization.ts learnVocabulary: query unigrams and bigrams -> tool
  { path: 'user_tool_profiles', words: ['vocabulary'] },
];

interface Doc {
  id: string;
  ref: unknown;
  data(): Data | undefined;
}
interface Query {
  orderBy(field: string): Query;
  limit(n: number): Query;
  startAfter(doc: Doc): Query;
  get(): Promise<{ docs: Doc[] }>;
}
/** The slice of Firestore the job uses, so a test can hand it a fake. */
export interface StoresDb {
  collection(path: string): Query & { listDocuments(): Promise<Array<{ id: string }>> };
  batch(): {
    update(ref: unknown, data: Data): unknown;
    commit(): Promise<unknown>;
  };
}

export interface TargetCounts {
  scanned: number;
  /** Documents holding at least one word field */
  withWords: number;
  /** Documents without an expireAt that get their time + 30 d */
  stamped: number;
  /** Documents without an expireAt or a readable time: not stamped */
  noTimestamp: number;
  written: number;
}

/** The update that strips and stamps one document, or null when it needs neither. */
export function stripUpdate(
  target: Target,
  doc: { id: string; data: Data },
  deleteField: unknown
): Data | null {
  const { data } = doc;
  const present = target.words.filter((f) => data[f] !== undefined);
  const update: Data = Object.fromEntries(present.map((f) => [f, deleteField]));
  if (target.length) {
    const [from, to] = target.length;
    const text = data[from];
    if (typeof text === 'string' && data[to] === undefined) update[to] = text.length;
  }
  const at = target.time && data.expireAt == null ? millis(data[target.time]) : null;
  if (at !== null) update.expireAt = new Date(at + ROUTING_EVENT_RETENTION_MS);
  return Object.keys(update).length > 0 ? update : null;
}

/** The concrete collection paths of a target, its `*` filled with each listed document */
async function collectionsOf(db: StoresDb, path: string): Promise<string[]> {
  const star = path.indexOf('/*/');
  if (star < 0) return [path];
  const parent = path.slice(0, star);
  const ids = (await db.collection(parent).listDocuments()).map((d) => d.id).sort();
  return ids.map((id) => `${parent}/${id}/${path.slice(star + 3)}`);
}

/** Walk one target's documents in pages; strip each page in one batch when `apply` is set. */
export async function stripTarget(
  db: StoresDb,
  target: Target,
  opts: { apply: boolean; deleteField: unknown }
): Promise<TargetCounts> {
  const c: TargetCounts = { scanned: 0, withWords: 0, stamped: 0, noTimestamp: 0, written: 0 };
  for (const path of await collectionsOf(db, target.path)) {
    let last: Doc | undefined;
    for (;;) {
      const base = db.collection(path).orderBy('__name__');
      const page = (await (last ? base.startAfter(last) : base).limit(PAGE).get()).docs;
      if (page.length === 0) break;
      const batch = db.batch();
      let writes = 0;
      for (const doc of page) {
        c.scanned++;
        const data = doc.data() ?? {};
        const update = stripUpdate(target, { id: doc.id, data }, opts.deleteField);
        if (target.time && data.expireAt == null && !update?.expireAt) c.noTimestamp++;
        if (!update) continue;
        if (target.words.some((f) => f in update)) c.withWords++;
        if (update.expireAt) c.stamped++;
        if (opts.apply) {
          batch.update(doc.ref, update);
          writes++;
        }
      }
      if (writes > 0) {
        await batch.commit();
        c.written += writes;
      }
      if (page.length < PAGE) break;
      last = page[page.length - 1];
    }
  }
  return c;
}

export async function main(
  argv: readonly string[] = process.argv,
  db?: StoresDb,
  deleteField?: unknown
): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
  const databaseId = getFirestoreDatabase();
  const mode = destructiveMode(argv, projectId);
  if (mode === 'refused') {
    console.error(refusalMessage(projectId));
    process.exitCode = 1;
    return;
  }
  if (!db || deleteField === undefined) {
    const { Firestore, FieldValue } = await import('@google-cloud/firestore');
    db ??= new Firestore({ projectId, databaseId });
    deleteField ??= FieldValue.delete();
  }
  const apply = mode === 'execute';
  console.log(`Router stores on ${projectId}/${databaseId}${apply ? '' : ' (DRY RUN)'}`);
  for (const target of TARGETS) {
    const c = await stripTarget(db, target, { apply, deleteField });
    const verb = apply ? 'stripped' : 'would strip';
    console.log(
      `${target.path}: scanned ${c.scanned}, ${verb} words from ${c.withWords}, ` +
        `expireAt on ${c.stamped} (${c.noTimestamp} with no readable time)` +
        (apply ? `, wrote ${c.written}` : '')
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('strip-router-store-words failed:', err);
    process.exit(1);
  });
}
