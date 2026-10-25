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
 * (forget-follow-ups.ts). It never deletes: the tool is called by a model,
 * on a confirmation the model itself reports, so a misread request must be
 * recoverable. Erasure is account deletion's job (erase-user-record.ts),
 * which removes all of this too. A topic that would cover a large share of
 * what Ferni knows is not applied; the caller is asked to narrow it.
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
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { forgetTokens, isForgotten, storedTopic } from './session-recall.js';
import { closeForgottenFollowUps } from './forget-follow-ups.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { forgetCallStartReads } from '../../utils/call-start-reads.js';

export { isForgotten };

const log = createLogger({ module: 'forget' });

/** Fact collections recall has read; a forgotten topic is marked in both. */
const FACT_COLLECTIONS = ['dynamic_facts', 'extracted_facts'] as const;
/** A topic matching more than this share of the caller's facts (and more than a few) is too broad. */
const MAX_SHARE = 0.3;
const MAX_UNASKED = 5;

export type ForgetResult =
  | { kind: 'forgotten'; marked: number }
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
  /** Records a topic as stored (storedTopic) and, for a later tokenizer to re-derive, as asked. */
  addTopic: (userId: string, topic: string, asked?: string) => Promise<void>;
  /** The recorded topics; null when they can't be read (no store, malformed), [] when there are none. */
  topics: (userId: string) => Promise<string[] | null>;
  /** Clears the profile's last summaries that `about` matches (#2767). */
  clearSummaries?: (userId: string, about: (text: string) => boolean) => Promise<void>;
}

/** The profile fields the next call's greeting and prompt read as "last time". */
export const LAST_SUMMARY_FIELDS = ['lastConversationSummary', 'lastCallerSummary'] as const;

/** The text a fact document is about, in either collection's shape. */
export function factText(d: Record<string, unknown>): string {
  return ['entityName', 'key', 'value', 'fact', 'content']
    .map((k) => (typeof d[k] === 'string' ? (d[k] as string) : ''))
    .join(' ');
}

const forgetGenerations = new Map<string, number>();
function bumpForgetGeneration(userId: string): void {
  forgetGenerations.set(userId, (forgetGenerations.get(userId) ?? 0) + 1);
}
/**
 * Changes whenever this process records a forget for the caller, so a cache
 * of their forgotten topics (firestore-vector-store/forget-filter.ts) knows
 * to read them again at once rather than after its TTL.
 */
export function forgetGeneration(userId: string): number {
  return forgetGenerations.get(userId) ?? 0;
}

/** Forget a topic. Throws only if the store does; see forgetForCaller. */
export async function forgetTopic(
  userId: string,
  topic: string,
  store: ForgetStore = firestoreForgetStore,
  now: Date = new Date()
): Promise<ForgetResult> {
  const tokens = storedTopic(topic);
  if (forgetTokens(tokens).length === 0) return { kind: 'nothing' };
  const facts = await store.facts(userId);
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
  await store.addTopic(userId, tokens, topic.trim());
  noteForgotten(userId, tokens);
  bumpForgetGeneration(userId);
  // Open follow-ups about it close too (best effort; the delivery job checks again).
  await closeForgottenFollowUps(userId, (text) => isForgotten(text, [tokens]), now);
  const marking = [...matched, ...earlier];
  if (marking.length > 0) await store.markForgotten(userId, marking, now.toISOString());
  bumpForgetGeneration(userId);
  // What either matcher reads as the topic, so nothing a save would clear is
  // left for the next call start. Last, so a failure leaves only this to
  // retry; it throws, and the caller is told the forget didn't go through.
  const { aboutForgotten } = await import('./forget-every-reader.js'); // it imports this module
  await store.clearSummaries?.(
    userId,
    (text) => isForgotten(text, [tokens]) || aboutForgotten(text, [tokens])
  );
  log.info({ userId: userId.slice(0, 8), marked: matched.length }, 'Forgot a topic');
  return { kind: 'forgotten', marked: matched.length };
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
 * The stored topics field: none recorded is [], anything else that isn't a
 * list of strings is unreadable (null), so readers fail closed.
 */
export function parseTopics(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every((t) => typeof t === 'string')) return null;
  return raw;
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
  async addTopic(userId, topic, asked) {
    const db = getFirestoreDb();
    if (!db) return;
    const ref = db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_state')
      .doc('forgotten');
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const topics: unknown = doc.exists ? doc.data()?.topics : [];
      const list = Array.isArray(topics) ? topics.map(String) : [];
      // What was asked is kept too, so a later tokenizer can re-derive the topic.
      const rawAsked: unknown = doc.exists ? doc.data()?.asked : [];
      const askedList = Array.isArray(rawAsked) ? rawAsked.map(String) : [];
      const nextAsked = asked && !askedList.includes(asked) ? [...askedList, asked] : askedList;
      if (!list.includes(topic) || nextAsked !== askedList) {
        tx.set(
          ref,
          { topics: list.includes(topic) ? list : [...list, topic], asked: nextAsked },
          { merge: true }
        );
      }
    });
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
  const doc = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('memory_state')
    .doc('forgotten')
    .get();
  return parseTopics(doc.exists ? doc.data()?.topics : undefined);
}
