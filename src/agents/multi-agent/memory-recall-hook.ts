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
 * A shared laugh the turn echoes is offered as a callback, once per call.
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
import {
  callbackForTurn,
  formatCallback,
  fromInsideJoke,
  fromStoredLaugh,
  mergeLaughs,
  type SharedLaugh,
} from '../../memory/recall/shared-laughs.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
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
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('dynamic_facts')
      .limit(300)
      .get();
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
  async laughs(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const user = db.collection('bogle_users').doc(userId);
    const [laughs, jokes] = await Promise.all([
      user.collection(SHARED_LAUGHS).orderBy('at', 'desc').limit(MAX_LAUGHS).get(),
      user.collection('human_signals').doc('inside_jokes').get(),
    ]);
    const items = (jokes.data()?.items as Array<Record<string, unknown>> | undefined) ?? [];
    const isLaugh = (l: SharedLaugh | null): l is SharedLaugh => l !== null;
    return mergeLaughs(
      laughs.docs.map((d) => fromStoredLaugh({ id: d.id, ...d.data() })).filter(isLaugh),
      items.slice(-MAX_LAUGHS).map(fromInsideJoke).filter(isLaugh)
    );
  },
};

const SHARED_LAUGHS = 'shared_laughs';
const MAX_LAUGHS = 30;

/**
 * Record how a callback went: landed (another laugh) or flat. Stored on the
 * shared-laugh record (created for an extractor joke on its first callback).
 * Never throws.
 */
export async function saveCallbackOutcome(
  userId: string,
  laugh: SharedLaugh,
  landed: boolean
): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    const { FieldValue } = await import('firebase-admin/firestore');
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(SHARED_LAUGHS)
      .doc(laugh.id)
      .set(
        {
          moment: laugh.moment,
          context: laugh.context,
          at: laugh.at,
          source: laugh.source,
          [landed ? 'landed' : 'flat']: FieldValue.increment(1),
          lastCalledBackAt: Date.now(),
        },
        { merge: true }
      );
  } catch (error) {
    log.warn({ error: String(error) }, 'Callback outcome not saved');
  }
}

/** Remember a shared laugh. Never throws. */
export async function saveSharedLaugh(userId: string, laugh: SharedLaugh): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(SHARED_LAUGHS)
      .doc(laugh.id)
      .set({ moment: laugh.moment, context: laugh.context, at: laugh.at, source: laugh.source });
  } catch (error) {
    log.warn({ error: String(error) }, 'Shared laugh not saved');
  }
}

export interface MemoryRecallDeps {
  userId: string;
  userName?: string;
  store?: RecallStore;
}

export interface MemoryRecall {
  /** Resolves once the snapshot is loaded (for tests and startup logging). */
  ready: Promise<void>;
  /** The recall note for this transcript, or null. Synchronous: never waits on the store. */
  noteFor(transcript: string): string | null;
  /** The agent started replying: the next transcript belongs to a new user turn. */
  newTurn(): void;
  /** The callback offered since the last call, if any (to learn whether it landed). */
  takeOfferedCallback(): SharedLaugh | null;
}

/**
 * Facts recalled per user turn. Interim transcripts arrive many times a turn;
 * without a turn budget each one pulled in 4 more facts about the same thing
 * (15 notes, ~45 facts for one sentence on 2026-09-27).
 */
const FACTS_PER_TURN = 4;

export function createMemoryRecall(deps: MemoryRecallDeps): MemoryRecall {
  const started = Date.now();
  let snapshot: RecallSnapshot | undefined;
  const surfaced = new Set<string>();
  let followUpsOffered = false;
  let factsThisTurn = 0;
  // One callback per call: a running joke lands because it is rare.
  let calledBack = false;
  let offered: SharedLaugh | null = null;

  const ready = loadRecallSnapshot(deps.store ?? firestoreRecallStore, deps.userId).then((s) => {
    snapshot = s;
    log.info(
      {
        facts: s.facts.length,
        followUps: s.followUps.length,
        laughs: s.laughs.length,
        ms: Date.now() - started,
      },
      'Recall snapshot loaded'
    );
  });

  return {
    ready,
    noteFor(transcript) {
      const text = transcript.trim();
      if (!snapshot || !text) return null;
      const budget = FACTS_PER_TURN - factsThisTurn;
      const facts = budget > 0 ? recallForTurn(snapshot, text, surfaced, budget) : [];
      const followUps = followUpsOffered ? [] : snapshot.followUps;
      const laugh = calledBack ? null : callbackForTurn(snapshot.laughs, text, surfaced);
      const notes = [
        formatRecall(facts, followUps, deps.userName),
        laugh ? formatCallback(laugh, deps.userName) : null,
      ].filter((n): n is string => n !== null);
      if (notes.length === 0) return null;
      if (followUps.length > 0) followUpsOffered = true;
      factsThisTurn += facts.length;
      for (const f of facts) surfaced.add(factId(f));
      if (laugh) {
        calledBack = true;
        offered = laugh;
        surfaced.add(laugh.id);
      }
      log.info(
        { facts: facts.length, followUps: followUps.length, callback: laugh?.source ?? null },
        'Recall added'
      );
      return notes.join('\n\n');
    },
    newTurn() {
      factsThisTurn = 0;
    },
    takeOfferedCallback() {
      const laugh = offered;
      offered = null;
      return laugh;
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
