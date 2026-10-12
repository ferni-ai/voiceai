/**
 * What the caller can do to one thing Ferni knows (memory-view/known.ts):
 *
 * forget: Ferni stops using it and the next call doesn't write it back.
 * wrong: it was never true; a reading of them is never noted again.
 * correct: the caller's words supersede it (not edited, so history stays honest).
 *
 * Nothing is deleted (a misread tap must be recoverable; erasure is account
 * deletion's job). Every write is under bogle_users/{the caller}; another
 * caller's id is simply not found.
 *
 * Where each is honoured:
 * - fact: memory-control.ts (recall skips forgottenAt; correction writes a new fact)
 * - world: closed (validTo), so listOpen readers drop it; its words become a
 *   forgotten topic, so after-call ingest (ingest.ts) doesn't recreate it
 * - pattern: removed, and its key rejected (update.ts, extract.ts)
 * - sensitivity: removed
 * - ponder: removed, and its call dismissed (ponder-user.ts)
 *
 * @module intelligence/memory-view/actions
 */
import { createHash } from 'node:crypto';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { forgetForCaller, type ForgetResult } from '../../memory/recall/forget.js';
import { forgetTokens } from '../../memory/recall/session-recall.js';
import {
  correctRemembered,
  firestoreMemoryControlStore,
  forgetRemembered,
  MAX_CORRECTION_CHARS,
} from '../../memory/recall/memory-control.js';
import {
  createFirestoreWorldFactStore,
  type WorldFactStore,
} from '../world-model/temporal/store.js';
import type { TemporalFact } from '../world-model/temporal/types.js';
import { sensitivityKey, type MindModel } from '../theory-of-mind/types.js';
import { hashId, type KnownKind, type StoredPondering } from './known.js';

export type KnownAction = 'forget' | 'wrong' | 'correct';

export type ActionResult =
  | { kind: 'done'; replacedBy?: string }
  | { kind: 'not-found' }
  | { kind: 'invalid'; reason: string };

export interface ActionStore {
  /** Forget one fact; its words (entity, key, value) when it was the caller's, else null. */
  forgetFact: (userId: string, id: string) => Promise<string | null>;
  correctFact: (userId: string, id: string, value: string) => Promise<ActionResult>;
  world: WorldFactStore & {
    get: (userId: string, id: string) => Promise<TemporalFact | null>;
    forget: (userId: string, id: string, at: string, wrong: boolean) => Promise<void>;
  };
  /** Change the mind model in a transaction; a null result means "not found", nothing written. */
  updateMind: (userId: string, change: (m: MindModel) => MindModel | null) => Promise<boolean>;
  updatePondering: (
    userId: string,
    change: (p: StoredPondering) => StoredPondering | null
  ) => Promise<boolean>;
  /** forget.ts forgetTopic: records the topic unless it is too broad. Never throws. */
  forgetTopic: (userId: string, topic: string) => Promise<ForgetResult>;
}

const NOT_FOUND: ActionResult = { kind: 'not-found' };
const DONE: ActionResult = { kind: 'done' };

/** The caller's correction as a short, clean phrase, or why it isn't one. */
export function cleanCorrection(value: unknown): string | { reason: string } {
  if (typeof value !== 'string') return { reason: 'value must be text' };
  const clean = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return { reason: 'value is empty' };
  if (clean.length > MAX_CORRECTION_CHARS) {
    return { reason: `value is over ${MAX_CORRECTION_CHARS} characters` };
  }
  return clean;
}

/** Fewer distinct words than this (of 3+ letters) is a name, not a topic: "Mom is ok" is just "mom". */
const MIN_TOPIC_WORDS = 2;

/**
 * Keep one forgotten item from coming back in other words: record its words
 * as a forgotten topic, but only when they are specific (two real words or
 * more) and forget.ts doesn't find them too broad. Otherwise only the item
 * itself is forgotten, so "Mom: is ok" never silences everything about Mom.
 */
async function forgetNarrowTopic(store: ActionStore, userId: string, words: string): Promise<void> {
  const specific = forgetTokens(words).filter((w) => w.length >= 3);
  if (specific.length < MIN_TOPIC_WORDS) return;
  await store.forgetTopic(userId, specific.join(' '));
}

/** One action on one of the caller's items, with the time it happens. */
interface ActionRequest {
  userId: string;
  id: string;
  action: KnownAction;
  value?: unknown;
  at: string;
}

async function correctWorld(
  store: ActionStore,
  old: TemporalFact,
  r: ActionRequest
): Promise<ActionResult> {
  const clean = cleanCorrection(r.value);
  if (typeof clean !== 'string') return { kind: 'invalid', reason: clean.reason };
  const hash = createHash('sha1').update(`${r.id}|${clean}|${r.at}`).digest('hex');
  const newId = `w_${hash.slice(0, 24)}`;
  const { supersededBy: _replacedEarlier, ...rest } = old;
  const fact: TemporalFact = {
    ...rest,
    id: newId,
    value: clean,
    observedAt: r.at,
    validFrom: r.at,
    validTo: null,
    confidence: 1,
    source: { kind: 'app', sessionId: 'app' },
    supersedes: [r.id],
    replaced: old.value,
  };
  await store.world.apply(r.userId, {
    create: [fact],
    close: [{ id: r.id, validTo: r.at, supersededBy: newId }],
    refresh: [],
  });
  return { kind: 'done', replacedBy: newId };
}

async function worldAction(store: ActionStore, r: ActionRequest): Promise<ActionResult> {
  const old = await store.world.get(r.userId, r.id);
  if (!old || old.validTo !== null) return NOT_FOUND;
  if (r.action === 'correct') return correctWorld(store, old, r);
  await store.world.forget(r.userId, r.id, r.at, r.action === 'wrong');
  await forgetNarrowTopic(store, r.userId, `${old.subject} ${old.value}`);
  return DONE;
}

async function factAction(store: ActionStore, r: ActionRequest): Promise<ActionResult> {
  if (r.action !== 'correct') {
    // Re-extraction of the same words lands on the same (forgotten) document; the topic
    // keeps the same fact said slightly differently out too.
    const words = await store.forgetFact(r.userId, r.id);
    if (words === null) return NOT_FOUND;
    await forgetNarrowTopic(store, r.userId, words);
    return DONE;
  }
  const clean = cleanCorrection(r.value);
  if (typeof clean !== 'string') return { kind: 'invalid', reason: clean.reason };
  return store.correctFact(r.userId, r.id, clean);
}

function mindChange(
  kind: 'pattern' | 'sensitivity',
  id: string
): (m: MindModel) => MindModel | null {
  return (m: MindModel): MindModel | null => {
    if (kind === 'sensitivity') {
      const gone = m.sensitivities.find((s) => hashId(s.topic) === id);
      if (!gone) return null;
      return {
        ...m,
        sensitivities: m.sensitivities.filter((s) => s !== gone),
        rejectedSensitivities: [
          ...new Set([...(m.rejectedSensitivities ?? []), sensitivityKey(gone.topic)]),
        ],
      };
    }
    const pattern = m.patterns.find((p) => p.key === id);
    if (!pattern) return null;
    return {
      ...m,
      patterns: m.patterns.filter((p) => p.key !== id),
      rejected: [...(m.rejected ?? []), { key: pattern.key, statement: pattern.statement }],
    };
  };
}

function ponderChange(id: string): (p: StoredPondering) => StoredPondering | null {
  return (p: StoredPondering): StoredPondering | null => {
    const item = [...p.followUps, ...p.thinkingOf].find((i) => hashId(i.text) === id);
    if (!item) return null;
    const keep = (i: { text: string }): boolean => hashId(i.text) !== id;
    const dismissed = [...new Set([...(p.dismissed ?? []), item.basis])];
    return {
      ...p,
      followUps: p.followUps.filter(keep),
      thinkingOf: p.thinkingOf.filter(keep),
      dismissed,
    };
  };
}

/** Apply one action to one item of the caller's. */
export async function applyKnownAction(
  userId: string,
  item: { kind: KnownKind; id: string },
  request: { action: KnownAction; value?: unknown },
  { store = firestoreActionStore, now = new Date() }: { store?: ActionStore; now?: Date } = {}
): Promise<ActionResult> {
  const { kind, id } = item;
  const r: ActionRequest = { userId, id, ...request, at: now.toISOString() };
  if (r.action === 'correct' && kind !== 'fact' && kind !== 'world') {
    return { kind: 'invalid', reason: 'this can be forgotten, not corrected' };
  }
  switch (kind) {
    case 'fact':
      return factAction(store, r);
    case 'world':
      return worldAction(store, r);
    case 'pattern':
    case 'sensitivity':
      return (await store.updateMind(userId, mindChange(kind, id))) ? DONE : NOT_FOUND;
    case 'ponder':
      return (await store.updatePondering(userId, ponderChange(id))) ? DONE : NOT_FOUND;
  }
}

/** Run `change` on one document in a transaction; false (and no write) when it returns null. */
async function changeDoc<T>(
  path: string[],
  change: (current: T) => T | null,
  valid: (data: unknown) => data is T
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  const [userId, collection, docId] = path as [string, string, string];
  const ref = db.collection('bogle_users').doc(userId).collection(collection).doc(docId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data: unknown = doc.exists ? doc.data() : undefined;
    if (!valid(data)) return false;
    const next = change(data);
    if (next === null) return false;
    tx.set(ref, JSON.parse(JSON.stringify(next)) as Record<string, unknown>);
    return true;
  });
}

const isMind = (d: unknown): d is MindModel =>
  typeof d === 'object' &&
  d !== null &&
  (d as MindModel).version === 1 &&
  Array.isArray((d as MindModel).patterns) &&
  Array.isArray((d as MindModel).sensitivities);

const isPondering = (d: unknown): d is StoredPondering =>
  typeof d === 'object' &&
  d !== null &&
  Array.isArray((d as StoredPondering).followUps) &&
  Array.isArray((d as StoredPondering).thinkingOf);

const worldStore = createFirestoreWorldFactStore();
const worldDoc = (userId: string, id: string): FirebaseFirestore.DocumentReference | null =>
  getFirestoreDb()?.collection('bogle_users').doc(userId).collection('world_facts').doc(id) ?? null;

export const firestoreActionStore: ActionStore = {
  async forgetFact(userId, id) {
    const d = await firestoreMemoryControlStore.fact(userId, id);
    if (!d || !(await forgetRemembered(userId, id))) return null;
    return ['entityName', 'key', 'value'].map((k) => String(d[k] ?? '')).join(' ');
  },
  async correctFact(userId, id, value) {
    const r = await correctRemembered(userId, id, value);
    return r.kind === 'corrected' ? { kind: 'done', replacedBy: r.fact.id } : r;
  },
  world: {
    ...worldStore,
    async get(userId, id) {
      const doc = await worldDoc(userId, id)?.get();
      return doc?.exists ? { ...(doc.data() as TemporalFact), id: doc.id } : null;
    },
    async forget(userId, id, at, wrong) {
      await worldDoc(userId, id)?.update({ validTo: at, forgottenAt: at, ...(wrong && { wrong }) });
    },
  },
  updateMind: async (userId, change) =>
    changeDoc([userId, 'mind_model', 'current'], change, isMind),
  updatePondering: async (userId, change) =>
    changeDoc([userId, 'predictive_intelligence', 'pondering'], change, isPondering),
  forgetTopic: async (userId, topic) => forgetForCaller(userId, topic),
};
