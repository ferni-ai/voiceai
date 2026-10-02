/**
 * Per-turn memory recall for the live agent.
 *
 * Loads the caller's memory when the call starts (see memory/recall/
 * session-recall.ts). When the user's words are transcribed, what is relevant
 * is added to the agent's chat context straight away, in the same tick as the
 * transcript event.
 *
 * Timing matters: on a preflight or final transcript the SDK emits
 * user_input_transcribed and then starts preemptive generation from a copy of
 * the agent's context. (With Ink's STT turn detection it is the preflight,
 * emitted as an interim, that starts it: 160ms before the final on 2026-09-27.)
 * If the memory were added later (in onUserTurnCompleted), the context would
 * no longer match and the SDK would discard the preemptive reply and start
 * over (observed 2026-09-27: "chat context or tools have changed after
 * onUserTurnCompleted"). Agent.updateChatCtx sets the context synchronously
 * before its first await, so calling it from the listener lands first.
 *
 * Follow-ups from recent sessions are offered once, with the first recall.
 *
 * @module agents/multi-agent/memory-recall-hook
 */

import {
  MAX_FACTS,
  factId,
  formatRecall,
  loadRecallSnapshot,
  recallForTurn,
  type RecallFact,
  type RecallSnapshot,
  type RecallStore,
} from '../../memory/recall/session-recall.js';
import { getRecallEmbedder, type Embedder } from '../../memory/recall/recall-embeddings.js';
import { loadUserFactDocs } from '../../memory/recall/user-memory-store.js';
import type { FirestoreLike } from '../../memory/dynamic/firestore-shapes.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryRecall' });

export function memoryRecallMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.MEMORY_RECALL !== 'off';
}

/** Per-turn and snapshot caps; each can be overridden by environment. */
export interface RecallLimits {
  /** Facts recalled per user turn (MEMORY_RECALL_FACTS_PER_TURN). */
  factsPerTurn: number;
  /** Characters of fact text per user turn (MEMORY_RECALL_CHARS_PER_TURN). */
  charsPerTurn: number;
  /** Facts loaded into the session snapshot (MEMORY_RECALL_SNAPSHOT_FACTS). */
  snapshotFacts: number;
}

function envInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function recallLimits(env: Record<string, string | undefined> = process.env): RecallLimits {
  return {
    factsPerTurn: envInt(env.MEMORY_RECALL_FACTS_PER_TURN, 6),
    charsPerTurn: envInt(env.MEMORY_RECALL_CHARS_PER_TURN, 800),
    snapshotFacts: envInt(env.MEMORY_RECALL_SNAPSHOT_FACTS, MAX_FACTS),
  };
}

/**
 * Reads the collections the live pipeline writes: most recently updated
 * facts first, every user-edited fact, and legacy facts without updatedAt.
 */
export function createFirestoreRecallStore(maxFacts = recallLimits().snapshotFacts): RecallStore {
  return {
    async facts(userId) {
      const db = getFirestoreDb() as unknown as FirestoreLike | null;
      if (!db) return [];
      return loadUserFactDocs(db, userId, maxFacts);
    },
    async summaries(userId) {
      const db = getFirestoreDb();
      if (!db) return [];
      const snap = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('summaries')
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get();
      return snap.docs.map((d) => d.data());
    },
  };
}

export const firestoreRecallStore: RecallStore = createFirestoreRecallStore();

export interface MemoryRecallDeps {
  userId: string;
  userName?: string;
  store?: RecallStore;
  /** Embedder for semantic ranking; null = keyword-only. Default: the shared recall embedder. */
  embed?: Embedder | null;
  limits?: Partial<RecallLimits>;
}

export interface MemoryRecall {
  /** Resolves once the snapshot is loaded (for tests and startup logging). */
  ready: Promise<void>;
  /** The recall note for this transcript, or null. Synchronous: never waits on the store. */
  noteFor(transcript: string): string | null;
  /** The agent started replying: the next transcript belongs to a new user turn. */
  newTurn(): void;
}

/** Facts embedded for semantic ranking (most recent first). */
const MAX_EMBEDDED_FACTS = 200;
/** Re-embed the query once the transcript has grown this much. */
const REEMBED_GROWTH_CHARS = 15;
const MIN_QUERY_CHARS = 12;

export function createMemoryRecall(deps: MemoryRecallDeps): MemoryRecall {
  const started = Date.now();
  const limits = { ...recallLimits(), ...deps.limits };
  let snapshot: RecallSnapshot | undefined;
  const surfaced = new Set<string>();
  let followUpsOffered = false;
  /**
   * Facts recalled per user turn. Interim transcripts arrive many times a
   * turn; without a turn budget each one pulled in more facts about the same
   * thing (15 notes, ~45 facts for one sentence on 2026-09-27).
   */
  let factsThisTurn = 0;
  let charsThisTurn = 0;

  // Semantic ranking state: fact vectors (loaded once) and the latest query vector this turn.
  const embedderReady: Promise<Embedder | null> =
    deps.embed !== undefined ? Promise.resolve(deps.embed) : getRecallEmbedder();
  let embedder: Embedder | null = null;
  const factVectors = new Map<string, number[]>();
  let queryVector: number[] | null = null;
  let embeddedQuery = '';
  let queryInFlight = false;

  const ready = loadRecallSnapshot(
    deps.store ?? firestoreRecallStore,
    deps.userId,
    limits.snapshotFacts
  ).then((s) => {
    snapshot = s;
    log.info(
      { facts: s.facts.length, followUps: s.followUps.length, ms: Date.now() - started },
      'Recall snapshot loaded'
    );
    // Embed facts in the background; until then (or without embeddings) ranking is keyword-only.
    void embedderReady.then(async (e) => {
      embedder = e;
      if (!e || s.facts.length === 0) return;
      const facts = s.facts.slice(0, MAX_EMBEDDED_FACTS);
      const vectors = await e(facts.map((f) => f.text ?? `${f.entity} ${f.key} ${f.value}`));
      if (!vectors) return;
      facts.forEach((f, i) => {
        if (vectors[i]?.length) factVectors.set(factId(f), vectors[i]);
      });
    });
  });

  function refreshQueryVector(text: string): void {
    if (!embedder || factVectors.size === 0 || queryInFlight || text.length < MIN_QUERY_CHARS)
      return;
    if (embeddedQuery && text.length - embeddedQuery.length < REEMBED_GROWTH_CHARS) return;
    queryInFlight = true;
    const asked = text;
    embedder([asked])
      .then((v) => {
        if (v?.[0]?.length) {
          queryVector = v[0];
          embeddedQuery = asked;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        queryInFlight = false;
      });
  }

  return {
    ready,
    noteFor(transcript) {
      const text = transcript.trim();
      if (!snapshot || !text) return null;
      refreshQueryVector(text);
      const budget = limits.factsPerTurn - factsThisTurn;
      const charBudget = limits.charsPerTurn - charsThisTurn;
      const facts =
        budget > 0 && charBudget > 0
          ? recallForTurn(snapshot, text, surfaced, budget, {
              maxChars: charBudget,
              firstAlwaysFits: charsThisTurn === 0,
              queryEmbedding: queryVector,
              factEmbedding: (f: RecallFact) => factVectors.get(factId(f)),
            })
          : [];
      const followUps = followUpsOffered ? [] : snapshot.followUps;
      const note = formatRecall(facts, followUps, deps.userName);
      if (!note) return null;
      followUpsOffered = true;
      factsThisTurn += facts.length;
      for (const f of facts) {
        surfaced.add(factId(f));
        charsThisTurn += (f.text ?? `${f.entity} ${f.key} ${f.value}`).length;
      }
      log.info(
        { facts: facts.length, followUps: followUps.length, semantic: Boolean(queryVector) },
        'Recall added'
      );
      return note;
    },
    newTurn() {
      factsThisTurn = 0;
      charsThisTurn = 0;
      queryVector = null;
      embeddedQuery = '';
    },
  };
}

/** The slice of the SDK Agent this needs. */
export interface RecallAgent {
  readonly chatCtx: {
    copy(): { addMessage(msg: { role: 'system'; content: string }): unknown };
  };
  updateChatCtx(chatCtx: unknown): Promise<void>;
}

/**
 * Add a recall note to the agent's context now. updateChatCtx assigns the
 * context before its first await, so the note is in place for the preemptive
 * generation the SDK starts right after the transcript event.
 */
export function addRecallNote(agent: RecallAgent, note: string): void {
  const ctx = agent.chatCtx.copy();
  ctx.addMessage({ role: 'system', content: note });
  agent.updateChatCtx(ctx).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Recall note not added');
  });
}
