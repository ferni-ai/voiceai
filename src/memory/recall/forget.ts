/**
 * What a caller asked Ferni to forget stays out of what Ferni recalls.
 *
 * "Forget that" in a call ran the forgetMemory tool, which removed the item
 * from the call's in-memory key moments and nothing else; the legacy
 * executor deleted from extracted_facts, a collection recall no longer
 * reads. Either way Ferni said it had forgotten, and the next call's recall
 * (dynamic_facts) still held it.
 *
 * forgetTopic marks the caller's facts about the topic as forgotten in both
 * fact collections and records the topic's words, and recall's snapshot
 * (session-recall.ts) leaves out marked facts and any fact or open thread
 * about a recorded topic; open follow-ups about it are released
 * (forget-follow-ups.ts). By default it never deletes: the tool is called by
 * a model, on a confirmation the model itself reports, so a misread request
 * must be recoverable. With FORGET_DELETES=on the facts are deleted instead,
 * with the embeddings they hold and their index copies, except a dynamic fact
 * the graph sync may have copied (mayHaveGraphCopy): deleting it would leave a
 * graph copy nothing points at, so it is marked, and the sync removes the copy
 * as it does for any forgotten fact. That is judged on each fact as re-read in
 * the deleting transaction (deletableNow), so one synced or edited since the
 * forget read it is marked too; a sync that copies a fact and then finds it
 * deleted takes its copy back out (markFactSynced). The topic is still
 * recorded either way, so the call summaries and transcripts that keep the
 * words stay out of recall. Erasing everything is account deletion's job (erase-user-record.ts).
 * A topic that would cover a large share of what Ferni knows is not applied;
 * the caller is asked to narrow it.
 *
 * Ferni says only what happened (forgetDone): "I won't bring that up again"
 * when facts were hidden, and that he deleted them only when every one was.
 *
 * The caller's open world facts about it (world-model/temporal, where the
 * dated follow-ups live) are closed as forgotten too, as the app's forget
 * does (api/routes/known-action-store.ts): before 2026-10-25 a forgotten
 * topic could still come back as "how did it go?".
 *
 * The profile's last summaries (what the next call's greeting picks up) are
 * cleared too when they are about the topic; session saves keep forgotten
 * topics out of them after that (services/session/last-summary.ts, #2767).
 *
 * With FORGET_EVERY_READER=on the readers outside recall check it too
 * (forget-every-reader.ts): the profile's last call summary in the system
 * prompt, greeting and single-agent awareness, the handoff summary, the
 * relationship tool, the keyword search legs, UnifiedStore.recall
 * and recall notes already in the chat. Not yet covered: session priming's
 * reads of call summaries, and stored transcripts read by anything but
 * episode quotes.
 *
 * @module memory/recall/forget
 */
import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { factText, forgetTokens, isForgotten, storedTopic } from '../domain/forgotten.js';
import {
  addForgottenTopic,
  firestoreForgottenStore,
  forgetGenerationSeen,
  noteUnstoredForget,
} from '../adapters/firestore/forgotten-store.js';
import { closeForgottenFollowUps } from './forget-follow-ups.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { forgetCallStartReads } from '../../utils/call-start-reads.js';

export { isForgotten, factText };
export { parseTopics } from '../adapters/firestore/forgotten-store.js';

const log = createLogger({ module: 'forget' });

/** Fact collections recall has read, and the bi-temporal facts store (MEMORY_FACTS); a forgotten topic is marked in each. */
const FACT_COLLECTIONS = ['dynamic_facts', 'extracted_facts', 'facts'] as const;
/** A topic matching more than this share of the caller's facts (and more than a few) is too broad. */
const MAX_SHARE = 0.3;
const MAX_UNASKED = 5;

export type ForgetResult =
  /** deleted/hidden: with FORGET_DELETES on, how many facts were deleted and how many only hidden. */
  | { kind: 'forgotten'; marked: number; deleted?: number; hidden?: number }
  | { kind: 'too-broad'; matched: number }
  | { kind: 'nothing' }
  /** No member on this call (anonymous, anon:, onbehalf:), so nothing about them is stored. */
  | { kind: 'not-saved' }
  | { kind: 'failed' };

export interface StoredFactRef {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

export interface ForgetStore {
  /** The caller's facts in every fact collection. */
  facts: (userId: string) => Promise<StoredFactRef[]>;
  markForgotten: (userId: string, refs: StoredFactRef[], at: string) => Promise<void>;
  /** Deletes the facts and their copies; returns those it did not delete, to be marked (FORGET_DELETES). */
  deleteFacts?: (userId: string, refs: StoredFactRef[]) => Promise<StoredFactRef[]>;
  /**
   * Records a topic as stored (storedTopic) and, for a later tokenizer to re-derive, as asked;
   * returns the stored forget generation, when the store keeps one.
   */
  addTopic: (userId: string, topic: string, asked?: string) => Promise<number | void>;
  /** The recorded topics; null when they can't be read (no store, malformed), [] when there are none. */
  topics: (userId: string) => Promise<string[] | null>;
  /** The caller's open world facts (world-model/temporal); none when absent. */
  worldFacts?: (userId: string) => Promise<WorldFactRef[]>;
  /** Closes world facts as forgotten; `wrong` when the caller said they were never true. */
  markWorldFacts?: (userId: string, ids: string[], at: string, wrong?: boolean) => Promise<void>;
  /** Clears the profile's last summaries that `about` matches (#2767). */
  clearSummaries?: (userId: string, about: (text: string) => boolean) => Promise<void>;
}

/** A world fact as forget and dispute read it (world-model/temporal's TemporalFact, structurally). */
export interface WorldFactRef {
  id: string;
  subject: string;
  relation?: string;
  attribute: string;
  value: string;
  replaced?: string;
  source?: { quote?: string };
  validTo: string | null;
}

/** What a world fact is about, for matching a forgotten or avoided topic: who, what, their words. */
export function worldFactText(f: Omit<WorldFactRef, 'id' | 'validTo'>): string {
  return [f.subject, f.relation, f.attribute, f.value, f.replaced, f.source?.quote]
    .filter(Boolean)
    .join(' ');
}

/** The profile fields the next call's greeting and prompt read as "last time". */
export const LAST_SUMMARY_FIELDS = ['lastConversationSummary', 'lastCallerSummary'] as const;

/**
 * The caller's forget generation as stored (memory_state/forgotten), the
 * highest this process has read or written: it changes with a forget made
 * here, or one made elsewhere once any read here sees it, so a cache of
 * their forgotten topics (firestore-vector-store/forget-filter.ts,
 * forget-topics-source.ts) reads them again at once rather than after its TTL.
 */
export function forgetGeneration(userId: string): number {
  return forgetGenerationSeen(userId);
}

/** Forget a topic. Throws only if the store does; see forgetForCaller. */
export async function forgetTopic(
  userId: string,
  topic: string,
  store: ForgetStore = firestoreForgetStore,
  now: Date = new Date(),
  env: Env = process.env
): Promise<ForgetResult> {
  const tokens = storedTopic(topic);
  if (forgetTokens(tokens).length === 0) return { kind: 'nothing' };
  const [facts, world] = await Promise.all([store.facts(userId), store.worldFacts?.(userId) ?? []]);
  const live = facts.filter((f) => typeof f.data.forgottenAt !== 'string');
  const matched = live.filter((f) => isForgotten(factText(f.data), [tokens]));
  if (matched.length > MAX_UNASKED && matched.length > live.length * MAX_SHARE) {
    return { kind: 'too-broad', matched: matched.length };
  }
  // Facts about the topic forgotten one by one earlier go through again, so
  // any index copy they still have is removed (markForgotten keeps their date).
  const earlier = facts.filter(
    (f) => typeof f.data.forgottenAt === 'string' && isForgotten(factText(f.data), [tokens])
  );
  const generation = await store.addTopic(userId, tokens, topic.trim());
  noteForgotten(userId, tokens);
  if (typeof generation !== 'number') noteUnstoredForget(userId);
  // Open follow-ups about it close too (best effort; the delivery job checks again).
  await closeForgottenFollowUps(userId, (text) => isForgotten(text, [tokens]), now);
  const marking = [...matched, ...earlier];
  const deleteFacts = flagOn('FORGET_DELETES', env) ? store.deleteFacts : undefined;
  // Facts that can't be deleted yet are marked, so recall still leaves them out.
  const hidden = deleteFacts && marking.length > 0 ? await deleteFacts(userId, marking) : marking;
  if (hidden.length > 0) await store.markForgotten(userId, hidden, now.toISOString());
  const worldIds = world.filter((f) => isForgotten(worldFactText(f), [tokens])).map((f) => f.id);
  if (worldIds.length > 0) await store.markWorldFacts?.(userId, worldIds, now.toISOString());
  // What either matcher reads as the topic, so nothing a save would clear is
  // left for the next call start. Last, so a failure leaves only this to
  // retry; it throws, and the caller is told the forget didn't go through.
  const { aboutForgotten } = await import('./forget-every-reader.js'); // it imports this module
  await store.clearSummaries?.(
    userId,
    (text) => isForgotten(text, [tokens]) || aboutForgotten(text, [tokens])
  );
  const deleted = marking.length - hidden.length;
  log.info(
    { userId: userId.slice(0, 8), marked: matched.length, deleted, world: worldIds.length },
    'Forgot a topic'
  );
  return deleteFacts
    ? { kind: 'forgotten', marked: matched.length, deleted, hidden: hidden.length }
    : { kind: 'forgotten', marked: matched.length };
}

/**
 * Whether the graph sync may have copied a dynamic fact. Facts are written
 * with syncedToSpanner false and copied only when the sync sets it true; a
 * forgotten fact is reset to false while its copy waits to be removed. So
 * only a live fact still at false is known to have no copy.
 */
export function mayHaveGraphCopy(ref: StoredFactRef): boolean {
  if (ref.collection !== 'dynamic_facts') return false;
  const live = ref.data.forgottenAt === undefined || ref.data.forgottenAt === null;
  return !(live && ref.data.syncedToSpanner === false);
}

/** Facts deleted per transaction (well under Firestore's 500 writes per commit). */
const DELETE_CHUNK = 100;

/**
 * Whether a fact can be deleted, judged on `fresh`, the fact as read in the
 * deleting transaction: it has no graph copy (mayHaveGraphCopy) and says what
 * it said when the forget matched it (`stale`). A fact edited since is marked
 * instead, which a later forget or correction can still undo.
 */
export function deletableNow(stale: StoredFactRef, fresh: StoredFactRef): boolean {
  return !mayHaveGraphCopy(fresh) && factText(fresh.data) === factText(stale.data);
}

/** What Ferni says once a forget went through: only what actually happened. */
export function forgetDone(result: Extract<ForgetResult, { kind: 'forgotten' }>): string {
  return result.deleted && !result.hidden
    ? "I've deleted the facts I'd saved about that, and I won't bring it up again."
    : "I won't bring that up again.";
}

/** The voice tool's result: the line to say, and nothing it may claim beyond it. */
export function forgetDoneNote(result: Extract<ForgetResult, { kind: 'forgotten' }>): string {
  const line = forgetDone(result);
  return result.deleted && !result.hidden
    ? `Deleted. Tell them this, briefly, and carry on: "${line}"`
    : `It's kept out of what you recall from now on, not erased. Tell them this, briefly, and carry on: "${line}" Don't say you've forgotten, deleted or erased it.`;
}

/** forgetTopic for a call's user, if any. Never throws: a failure is logged and reported as such. */
export async function forgetForCaller(
  userId: string | undefined,
  topic: string,
  store: ForgetStore = firestoreForgetStore
): Promise<ForgetResult> {
  if (!isMemberIdentity(userId)) return { kind: 'not-saved' };
  return forgetTopic(userId, topic, store).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Could not forget from stored memory');
    return { kind: 'failed' as const };
  });
}

/** What Ferni says when a forget request didn't go through; never claims it did. */
export function forgetProblem(result: Exclude<ForgetResult, { kind: 'forgotten' }>): string {
  if (result.kind === 'too-broad') {
    return 'That covers a lot of what I know about you. Which part should I forget?';
  }
  if (result.kind === 'nothing') return 'What exactly should I forget?';
  if (result.kind === 'not-saved') return "There's nothing saved about you here.";
  return "I couldn't remove that just now. Ask me again in a moment?";
}

/** Topics forgotten in this process, so a call already running honours them at once. */
const forgottenHere = new Map<string, Set<string>>();
function noteForgotten(userId: string, tokens: string): void {
  const set = forgottenHere.get(userId) ?? new Set<string>();
  set.add(tokens);
  forgottenHere.set(userId, set);
}
export function forgottenInProcess(userId: string): string[] {
  return [...(forgottenHere.get(userId) ?? [])];
}

/**
 * Recorded topics, or null when they can't be read: a reader of raw words
 * (episode quotes, call summaries) must then offer nothing rather than risk
 * a forgotten one.
 */
export async function forgottenTopicsOrNull(
  userId: string,
  store: ForgetStore = firestoreForgetStore
): Promise<string[] | null> {
  return store.topics(userId).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Forgotten topics not loaded');
    return null;
  });
}

/**
 * Recorded topics (their words). Never throws: an unreadable list is empty.
 * For readers whose own records carry forgottenAt (facts); readers of raw
 * words use forgottenTopicsOrNull.
 */
export async function forgottenTopics(
  userId: string,
  store: ForgetStore = firestoreForgetStore
): Promise<string[]> {
  const topics = await forgottenTopicsOrNull(userId, store);
  return topics ?? [];
}

/**
 * Take forgotten dynamic facts out of the indexes recall searches: the memory
 * tool's (now, not at the next re-index, user-memory-indexer.ts;
 * recallFromMemory also checks by id meanwhile) and the graph sync's copy
 * (spanner-graph insertFact), read by per-turn memory search. Call after the
 * facts are marked forgotten with syncedToSpanner: false.
 */
export async function removeIndexCopies(userId: string, factIds: string[]): Promise<void> {
  if (factIds.length === 0) return;
  const { removeConversationDocument } = await import('../retrieval/conversation-index.js');
  const { removeIndexedMemory } = await import('../retrieval/semantic-memory-search.js');
  for (const id of factIds) {
    await removeConversationDocument(`fact_${id}`).catch((error: unknown) =>
      log.warn({ error: String(error) }, 'Forgotten fact not removed from the index')
    );
    await removeIndexedMemory('fact', `fact_${userId}_${id}`);
  }
}

/**
 * What a fact keeps that is derived from it, cleared in the same write that forgets or
 * corrects it: its stored vector (RECALL_VECTOR_INDEX), which a vector search still matches.
 */
export const withoutDerivedCopies = (): { embedding: FieldValue } => ({
  embedding: FieldValue.delete(),
});

/** The caller's open world facts: the whole collection, as facts() reads the fact collections. */
export async function openWorldFacts(userId: string): Promise<WorldFactRef[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await db.collection('bogle_users').doc(userId).collection('world_facts').get();
  return snap.docs
    .map((d) => ({ ...(d.data() as WorldFactRef), id: d.id }))
    .filter((f) => f.validTo === null);
}

/** Closes world facts so no reader serves them: the fields the app's forget writes. */
export async function closeWorldFacts(
  userId: string,
  ids: string[],
  at: string,
  wrong?: boolean
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  const col = db.collection('bogle_users').doc(userId).collection('world_facts');
  const closed = { validTo: at, forgottenAt: at, ...(wrong ? { wrong, disputedAt: at } : {}) };
  for (let i = 0; i < ids.length; i += 400) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + 400)) batch.update(col.doc(id), closed);
    await batch.commit();
  }
}

/** bogle_users/{uid}/{dynamic_facts,extracted_facts}, and memory_state/forgotten. */
export const firestoreForgetStore: ForgetStore = {
  async facts(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const user = db.collection('bogle_users').doc(userId);
    const all = await Promise.all(
      FACT_COLLECTIONS.map(async (name) =>
        (await user.collection(name).get()).docs.map((d) => ({
          collection: name,
          id: d.id,
          data: d.data(),
        }))
      )
    );
    return all.flat();
  },
  async markForgotten(userId, refs, at) {
    const db = getFirestoreDb();
    if (!db) return;
    const user = db.collection('bogle_users').doc(userId);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      for (const r of refs.slice(i, i + 400)) {
        // A fact already copied to the graph store is picked up by the next
        // sync again (firestore-spanner-sync.ts), which removes the copy.
        const resync =
          r.collection === 'dynamic_facts'
            ? { syncedToSpanner: false, ...withoutDerivedCopies() }
            : {};
        // Already forgotten (one by one, or an earlier topic): keep when.
        const when = typeof r.data.forgottenAt === 'string' ? r.data.forgottenAt : at;
        batch.update(user.collection(r.collection).doc(r.id), { forgottenAt: when, ...resync });
      }
      await batch.commit();
    }
    await removeIndexCopies(
      userId,
      refs.filter((x) => x.collection === 'dynamic_facts').map((x) => x.id)
    );
  },
  async deleteFacts(userId, refs) {
    const db = getFirestoreDb();
    if (!db) return refs;
    const user = db.collection('bogle_users').doc(userId);
    const gone: StoredFactRef[] = [];
    const kept: StoredFactRef[] = [];
    // Decided on each fact as it is at the write, not as facts() read it: a
    // fact the sync copied or someone edited since then is marked, never
    // deleted. The transaction re-reads every fact it may delete, and the
    // commit fails and retries if one changes before it lands.
    for (let i = 0; i < refs.length; i += DELETE_CHUNK) {
      const chunk = refs.slice(i, i + DELETE_CHUNK);
      const decided = await db.runTransaction(async (tx) => {
        const docs = chunk.map((r) => ({ r, doc: user.collection(r.collection).doc(r.id) }));
        const snaps = await tx.getAll(...docs.map((d) => d.doc));
        const out = { gone: [] as StoredFactRef[], kept: [] as StoredFactRef[] };
        docs.forEach(({ r, doc }, j) => {
          const snap = snaps[j];
          if (snap === undefined) return void out.kept.push(r); // not re-read: never delete
          // Already gone (account deletion, another forget): nothing left to mark.
          if (!snap.exists) return void out.gone.push(r);
          const fresh = { ...r, data: snap.data() ?? {} };
          if (deletableNow(r, fresh)) {
            tx.delete(doc);
            out.gone.push(fresh);
          } else out.kept.push(fresh);
        });
        return out;
      });
      gone.push(...decided.gone);
      kept.push(...decided.kept);
    }
    await removeIndexCopies(
      userId,
      gone.filter((x) => x.collection === 'dynamic_facts').map((x) => x.id)
    );
    return kept;
  },
  worldFacts: openWorldFacts,
  markWorldFacts: closeWorldFacts,
  async addTopic(userId, topic, asked) {
    const db = getFirestoreDb();
    if (!db) return;
    return addForgottenTopic(db, userId, topic, asked);
  },
  async topics(userId) {
    const db = getFirestoreDb();
    return db ? readForgottenTopics(db, userId) : null;
  },
  async clearSummaries(userId, about) {
    const db = getFirestoreDb();
    if (!db) return;
    const ref = db.collection('bogle_users').doc(userId);
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() ?? {};
      const cleared: Record<string, string> = {};
      for (const k of LAST_SUMMARY_FIELDS) {
        const v: unknown = data[k];
        if (typeof v === 'string' && v && about(v)) cleared[k] = '';
      }
      if (Object.keys(cleared).length > 0) tx.update(ref, cleared);
    });
    forgetCallStartReads(userId); // the next call-start read sees the cleared summaries
  },
};

/** The topics recorded in `db` (memory_state/forgotten), parsed as parseTopics does. */
export async function readForgottenTopics(db: Firestore, userId: string): Promise<string[] | null> {
  return (await firestoreForgottenStore(db).readForgotten(userId)).topics;
}
