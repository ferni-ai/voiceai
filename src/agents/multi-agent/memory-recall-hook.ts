/**
 * Per-turn memory recall for the live agent.
 *
 * Loads the caller's memory when the call starts (see memory/recall/
 * session-recall.ts) and, on each user turn, adds what is relevant to that
 * turn's chat context before the reply is generated. The SDK awaits
 * onUserTurnCompleted, so this runs on the turn path: matching is in memory,
 * and the only wait is on the first turn if the load has not finished, capped
 * at FIRST_TURN_WAIT_MS.
 *
 * Follow-ups from recent sessions are offered on the first turn only.
 *
 * @module agents/multi-agent/memory-recall-hook
 */

import {
  EMPTY_SNAPSHOT,
  factId,
  formatRecall,
  loadRecallSnapshot,
  recallForTurn,
  type RecallSnapshot,
  type RecallStore,
} from '../../memory/recall/session-recall.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { UserTurnHook } from './turn-intelligence.js';

const log = createLogger({ module: 'MemoryRecall' });

/** Longest the first turn waits for the snapshot before replying without it. */
const FIRST_TURN_WAIT_MS = 300;

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
};

export interface MemoryRecallDeps {
  userId: string;
  userName?: string;
  store?: RecallStore;
  firstTurnWaitMs?: number;
}

export function createMemoryRecallHook(deps: MemoryRecallDeps): UserTurnHook {
  const started = Date.now();
  const snapshot: Promise<RecallSnapshot> = loadRecallSnapshot(
    deps.store ?? firestoreRecallStore,
    deps.userId
  ).then((s) => {
    log.info(
      { facts: s.facts.length, followUps: s.followUps.length, ms: Date.now() - started },
      'Recall snapshot loaded'
    );
    return s;
  });
  const surfaced = new Set<string>();
  let turn = 0;

  return async (turnCtx, newMessage) => {
    const userText = newMessage.textContent?.trim();
    if (!userText) return;
    turn++;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<RecallSnapshot>((resolve) => {
      timer = setTimeout(() => resolve(EMPTY_SNAPSHOT), deps.firstTurnWaitMs ?? FIRST_TURN_WAIT_MS);
    });
    const snap = await Promise.race([snapshot, late]).finally(() => clearTimeout(timer));

    const facts = recallForTurn(snap, userText, surfaced);
    const followUps = turn === 1 ? snap.followUps : [];
    const note = formatRecall(facts, followUps, deps.userName);
    if (!note) return;

    for (const f of facts) surfaced.add(factId(f));
    turnCtx.addMessage({ role: 'system', content: note });
    log.info({ turn, facts: facts.length, followUps: followUps.length }, 'Recall added to turn');
  };
}

/** Run hooks in order; a failing hook never stops the reply. */
export function chainUserTurnHooks(...hooks: Array<UserTurnHook | undefined>): UserTurnHook | undefined {
  const active = hooks.filter((h): h is UserTurnHook => Boolean(h));
  if (active.length <= 1) return active[0];
  return async (turnCtx, newMessage) => {
    for (const hook of active) {
      try {
        await hook(turnCtx, newMessage);
      } catch (error) {
        if ((error as { name?: string })?.name === 'StopResponse') throw error;
        log.warn({ error: String(error) }, 'User turn hook failed; continuing');
      }
    }
  };
}
