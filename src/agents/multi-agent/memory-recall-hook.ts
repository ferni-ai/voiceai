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
 * Follow-ups from recent sessions are offered once, with the first recall,
 * with when each came up. One that Ferni's reply actually raises is closed
 * for good, so it is never asked about twice.
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
import { raisedIn, whenSaid, type FollowUp } from '../../memory/recall/follow-ups.js';
import {
  anecdoteIn,
  formatToldStories,
  sameStory,
  storyId,
  type ToldStory,
} from '../../memory/recall/told-stories.js';
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
  async toldStories(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(TOLD_STORIES)
      .orderBy('at', 'desc')
      .limit(MAX_TOLD_STORIES)
      .get();
    return snap.docs
      .map((d) => d.data())
      .filter((d) => typeof d.gist === 'string' && typeof d.personaId === 'string')
      .map((d) => ({
        id: String(d.id ?? ''),
        personaId: String(d.personaId),
        gist: String(d.gist),
        at: typeof d.at === 'number' ? d.at : 0,
      }));
  },
  async closedFollowUps(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection(CLOSED_FOLLOW_UPS)
      .orderBy('raisedAt', 'desc')
      .limit(500)
      .get();
    return snap.docs.map((d) => d.id);
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
const CLOSED_FOLLOW_UPS = 'closed_follow_ups';
const TOLD_STORIES = 'told_stories';
const MAX_TOLD_STORIES = 30;

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

/** How often this caller laughs across calls (conversation/humor-fit.ts). Never throws. */
export async function loadHumorHistory(
  userId: string
): Promise<{ calls: number; laughs: number } | null> {
  try {
    const db = getFirestoreDb();
    if (!db) return null;
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('human_signals')
      .doc('humor')
      .get();
    const data = doc.data();
    if (typeof data?.calls !== 'number') return null;
    return { calls: data.calls, laughs: typeof data.laughs === 'number' ? data.laughs : 0 };
  } catch (error) {
    log.warn({ error: String(error) }, 'Humor history not loaded');
    return null;
  }
}

/** Add this call's counts to the caller's humor history. Never throws. */
export async function saveHumorIncrement(
  userId: string,
  inc: { calls: number; laughs: number }
): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    const { FieldValue } = await import('firebase-admin/firestore');
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('human_signals')
      .doc('humor')
      .set(
        {
          calls: FieldValue.increment(inc.calls),
          laughs: FieldValue.increment(inc.laughs),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
  } catch (error) {
    log.warn({ error: String(error) }, 'Humor history not saved');
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

/** Remember a story the persona told, so it is never retold as new. Never throws. */
export async function saveToldStory(userId: string, story: ToldStory): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(TOLD_STORIES)
      .doc(story.id)
      .set(story);
  } catch (error) {
    log.warn({ error: String(error) }, 'Told story not saved');
  }
}

/** Remember that a thread was raised, so later calls do not ask again. Never throws. */
export async function saveClosedFollowUp(userId: string, followUp: FollowUp): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (!db) return;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(CLOSED_FOLLOW_UPS)
      .doc(followUp.id)
      .set({ text: followUp.text, saidAt: followUp.at, raisedAt: Date.now() });
  } catch (error) {
    log.warn({ error: String(error) }, 'Closed follow-up not saved');
  }
}

export interface MemoryRecallDeps {
  userId: string;
  userName?: string;
  /** The caller's IANA timezone, for "yesterday" in their calendar. */
  timezone?: string;
  store?: RecallStore;
  /** A thread Ferni raised (see saveClosedFollowUp). */
  closeFollowUp?: (followUp: FollowUp) => void;
  /** The persona on this agent: stories are its own. */
  personaId?: string;
  /** A story the persona just told (see saveToldStory). */
  saveStory?: (story: ToldStory) => void;
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
  /** Ferni said this: close any offered thread it raised. */
  agentSaid(text: string): void;
  /**
   * Facts for the greeting: the newest open thread ("Interview on Thursday
   * (said 3 days ago (Tuesday))") and how the last call felt. Waits briefly
   * for memory to load; empty when nothing is known.
   */
  openingFacts(maxWaitMs?: number): Promise<Record<string, string>>;
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
  let openFollowUps: FollowUp[] = [];
  /** Threads raised this call (the greeting included): never offered again. */
  const raisedIds = new Set<string>();
  let factsThisTurn = 0;
  let firstNoteOffered = false;
  /** This persona's stories they have heard, from earlier calls and this one. */
  let told: ToldStory[] = [];
  // One callback per call: a running joke lands because it is rare.
  let calledBack = false;
  let offered: SharedLaugh | null = null;

  const ready = loadRecallSnapshot(deps.store ?? firestoreRecallStore, deps.userId).then((s) => {
    snapshot = s;
    const persona = deps.personaId ?? 'ferni';
    told = (s.toldStories ?? []).filter((t) => t.personaId === persona);
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
      const followUps = followUpsOffered
        ? []
        : snapshot.followUps.filter((f) => !raisedIds.has(f.id));
      const laugh = calledBack ? null : callbackForTurn(snapshot.laughs, text, surfaced);
      const notes = [
        formatRecall(facts, followUps, deps.userName, { timezone: deps.timezone }),
        laugh ? formatCallback(laugh, deps.userName) : null,
        firstNoteOffered || told.length === 0 ? null : formatToldStories(told).join('\n'),
        firstNoteOffered ? null : formatRecentArcs(snapshot.recentArcs, deps.timezone),
      ].filter((n): n is string => n !== null);
      if (notes.length === 0) return null;
      if (followUps.length > 0) {
        followUpsOffered = true;
        openFollowUps = [...followUps];
      }
      firstNoteOffered = true;
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
    async openingFacts(maxWaitMs = 300) {
      await Promise.race([
        ready,
        new Promise<void>((resolve) => {
          setTimeout(resolve, maxWaitMs);
        }),
      ]);
      const facts: Record<string, string> = {};
      const now = Date.now();
      const thread = snapshot?.followUps[0];
      if (thread) {
        // Ferni may raise it in the greeting; saying it there closes it too
        if (!openFollowUps.includes(thread)) openFollowUps = [...openFollowUps, thread];
        facts['open thread from last time'] =
          `${thread.text} (said ${whenSaid(thread.at, now, deps.timezone)})`;
      }
      const last = snapshot?.lastCall;
      if (last) {
        facts['how your last call felt'] = `${last.arc} (${whenSaid(last.at, now, deps.timezone)})`;
      }
      return facts;
    },
    agentSaid(text) {
      const gist = anecdoteIn(text);
      if (gist && !told.some((t) => sameStory(t.gist, gist))) {
        const personaId = deps.personaId ?? 'ferni';
        const story = { id: storyId(personaId, gist), personaId, gist, at: Date.now() };
        told = [story, ...told];
        deps.saveStory?.(story);
        log.info({ personaId }, 'Story told');
      }
      const raised = raisedIn(text, openFollowUps);
      if (raised.length === 0) return;
      openFollowUps = openFollowUps.filter((f) => !raised.includes(f));
      for (const f of raised) {
        raisedIds.add(f.id);
        deps.closeFollowUp?.(f);
      }
      log.info({ raised: raised.length }, 'Follow-up raised');
    },
  };
}

/** How recent calls felt, for noticing a real change over time, or null. */
export function formatRecentArcs(
  arcs: ReadonlyArray<{ at: number; arc: string }> | undefined,
  timezone?: string,
  now: number = Date.now()
): string | null {
  if (!arcs || arcs.length === 0) return null;
  return [
    '[HOW THEIR RECENT CALLS FELT]',
    ...arcs.map((a) => `- ${whenSaid(a.at, now, timezone)}: ${a.arc}`),
    'If there is a real change over these calls (lighter, or heavier), you may notice it once, gently, when it fits, never as the first thing you say. If there is no clear change, say nothing about it.',
  ].join('\n');
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
