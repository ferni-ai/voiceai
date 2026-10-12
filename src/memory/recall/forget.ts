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
 * about a recorded topic. It never deletes: the tool is called by a model,
 * on a confirmation the model itself reports, so a misread request must be
 * recoverable. Erasure is account deletion's job (erase-user-record.ts),
 * which removes all of this too. A topic that would cover a large share of
 * what Ferni knows is not applied; the caller is asked to narrow it.
 *
 * Not yet covered: other readers of call summaries (priming, pondering)
 * and stored transcripts read by anything but episode quotes.
 *
 * @module memory/recall/forget
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { forgetTokens, isForgotten } from './session-recall.js';

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
  addTopic: (userId: string, topic: string) => Promise<void>;
  topics: (userId: string) => Promise<string[]>;
}

/** The text a fact document is about, in either collection's shape. */
function factText(d: Record<string, unknown>): string {
  return ['entityName', 'key', 'value', 'fact', 'content']
    .map((k) => (typeof d[k] === 'string' ? (d[k] as string) : ''))
    .join(' ');
}

/** Forget a topic. Throws only if the store does; see forgetForCaller. */
export async function forgetTopic(
  userId: string,
  topic: string,
  store: ForgetStore = firestoreForgetStore,
  now: Date = new Date()
): Promise<ForgetResult> {
  const tokens = forgetTokens(topic).join(' ');
  if (!tokens) return { kind: 'nothing' };
  const facts = await store.facts(userId);
  const live = facts.filter((f) => typeof f.data.forgottenAt !== 'string');
  const matched = live.filter((f) => isForgotten(factText(f.data), [tokens]));
  if (matched.length > MAX_UNASKED && matched.length > live.length * MAX_SHARE) {
    return { kind: 'too-broad', matched: matched.length };
  }
  await store.addTopic(userId, tokens);
  if (matched.length > 0) await store.markForgotten(userId, matched, now.toISOString());
  log.info({ userId: userId.slice(0, 8), marked: matched.length }, 'Forgot a topic');
  return { kind: 'forgotten', marked: matched.length };
}

/** forgetTopic for a call's user, if any. Never throws: a failure is logged and reported as such. */
export async function forgetForCaller(
  userId: string | undefined,
  topic: string,
  store: ForgetStore = firestoreForgetStore
): Promise<ForgetResult> {
  if (!userId || userId === 'anonymous') return { kind: 'failed' };
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
  return "I couldn't remove that just now. Ask me again in a moment?";
}

/** Recorded topics (their words). Never throws: an unreadable list is empty. */
export async function forgottenTopics(
  userId: string,
  store: ForgetStore = firestoreForgetStore
): Promise<string[]> {
  return store.topics(userId).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Forgotten topics not loaded');
    return [];
  });
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
        batch.update(user.collection(r.collection).doc(r.id), { forgottenAt: at });
      }
      await batch.commit();
    }
    // Their copies in the memory tool's index go now, not at the next re-index
    // (user-memory-indexer.ts); recallFromMemory also checks by id meanwhile.
    const { removeConversationDocument } = await import('../retrieval/semantic-rag.js');
    const { removeIndexedMemory } = await import('../retrieval/semantic-memory-search.js');
    for (const r of refs.filter((x) => x.collection === 'dynamic_facts')) {
      await removeConversationDocument(`fact_${r.id}`).catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Forgotten fact not removed from the index')
      );
      // The graph sync's copy (spanner-graph insertFact), read by per-turn memory search.
      await removeIndexedMemory('fact', `fact_${userId}_${r.id}`);
    }
  },
  async addTopic(userId, topic) {
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
      if (!list.includes(topic)) tx.set(ref, { topics: [...list, topic] }, { merge: true });
    });
  },
  async topics(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('memory_state')
      .doc('forgotten')
      .get();
    const topics: unknown = doc.exists ? doc.data()?.topics : undefined;
    return Array.isArray(topics) ? topics.map(String) : [];
  },
};
