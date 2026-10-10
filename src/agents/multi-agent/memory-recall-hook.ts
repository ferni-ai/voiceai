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
  factId,
  formatRecall,
  loadRecallSnapshot,
  recallForTurn,
  type RecallSnapshot,
  type RecallStore,
} from '../../memory/recall/session-recall.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { formatLedger, loadLedger, type LedgerStore } from '../personas/life-ledger.js';
import {
  formatLifeUpdates,
  loadLifeUpdates,
  type LifeUpdateDeps,
} from '../personas/life-updates.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryRecall' });

export function memoryRecallMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.MEMORY_RECALL !== 'off';
}

/** Reads the collections the live pipeline writes. Plain queries: no composite index needed. */
export const firestoreRecallStore: RecallStore = {
  async facts(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const facts = db.collection('bogle_users').doc(userId).collection('dynamic_facts');
    // Newest first: an unordered limit loaded an arbitrary 300 of a user's
    // facts (2,024 for one test user). Facts without a date fall back to it.
    const newest = await facts.orderBy('extractedAt', 'desc').limit(300).get();
    const snap = newest.docs.length > 0 ? newest : await facts.limit(300).get();
    return snap.docs.map((d) => d.data());
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

export interface MemoryRecallDeps {
  userId: string;
  userName?: string;
  store?: RecallStore;
  /** What Ferni told this caller about himself on earlier calls (life-ledger.ts). */
  ledgerStore?: LedgerStore;
  /** What has happened in his life since (life-updates.ts, LIFE_MOVES_ON). */
  lifeUpdates?: LifeUpdateDeps;
}

export interface MemoryRecall {
  /** Resolves once the snapshot is loaded (for tests and startup logging). */
  ready: Promise<void>;
  /** The recall note for this transcript, or null. Synchronous: never waits on the store. */
  noteFor(transcript: string): string | null;
  /** The agent started replying: the next transcript belongs to a new user turn. */
  newTurn(): void;
}

/**
 * Facts recalled per user turn. Interim transcripts arrive many times a turn;
 * without a turn budget each one pulled in 4 more facts about the same thing
 * (15 notes, ~45 facts for one sentence on 2026-09-27).
 */
const FACTS_PER_TURN = 4;
/** One person or thing can't take the whole turn ("sister" brought 4 pregnancy rows, 2026-10-04). */
const FACTS_PER_ENTITY = 2;

export function createMemoryRecall(deps: MemoryRecallDeps): MemoryRecall {
  const started = Date.now();
  let snapshot: RecallSnapshot | undefined;
  const surfaced = new Set<string>();
  let followUpsOffered = false;
  let factsThisTurn = 0;
  const entitiesThisTurn = new Map<string, number>();

  let ledgerNote: string | null = null;
  let sinceNote: string | null = null;
  const ledger = loadLedger(deps.userId, 'ferni', deps.ledgerStore);
  const loaded = Promise.all([
    loadRecallSnapshot(deps.store ?? firestoreRecallStore, deps.userId),
    ledger,
  ]).then(([s, told]) => {
    snapshot = s;
    ledgerNote = formatLedger(told, deps.userName);
    log.info(
      {
        facts: s.facts.length,
        followUps: s.followUps.length,
        insideJokes: s.insideJokes?.length ?? 0,
        told: told.length,
        ms: Date.now() - started,
      },
      'Recall snapshot loaded'
    );
  });
  // Written by a model, so it never holds up the snapshot; it joins the first
  // note only if it is ready by then. Never rejects.
  const since = ledger
    .then((told) => loadLifeUpdates(deps.userId, told, 'ferni', deps.lifeUpdates))
    .then((updates) => {
      sinceNote = formatLifeUpdates(updates);
    });
  const ready = Promise.all([loaded, since]).then(() => undefined);

  return {
    ready,
    noteFor(transcript) {
      const text = transcript.trim();
      if (!snapshot || !text) return null;
      const budget = FACTS_PER_TURN - factsThisTurn;
      const facts =
        budget > 0
          ? recallForTurn(snapshot, text, surfaced, budget, FACTS_PER_ENTITY, entitiesThisTurn)
          : [];
      const followUps = followUpsOffered ? [] : snapshot.followUps;
      // Shared bits, like the follow-ups, come once (shown only with INSIDE_JOKES=on).
      const insideJokes = followUpsOffered ? [] : (snapshot.insideJokes ?? []);
      // The ledger, like the follow-ups, comes once, with the first note.
      const told = followUpsOffered
        ? null
        : [ledgerNote, sinceNote].filter(Boolean).join('\n') || null;
      const note =
        [formatRecall(facts, followUps, deps.userName, Date.now(), { insideJokes }), told]
          .filter(Boolean)
          .join('\n\n') || null;
      if (!note) return null;
      followUpsOffered = true;
      factsThisTurn += facts.length;
      for (const f of facts) {
        surfaced.add(factId(f));
        const key = f.entity.toLowerCase();
        entitiesThisTurn.set(key, (entitiesThisTurn.get(key) ?? 0) + 1);
      }
      log.info({ facts: facts.length, followUps: followUps.length }, 'Recall added');
      return note;
    },
    newTurn() {
      factsThisTurn = 0;
      entitiesThisTurn.clear();
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
