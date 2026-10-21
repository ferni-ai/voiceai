/**
 * Wins: things the caller said they would do and then did. A coach comes back
 * with "you called your sister, nice" once, on the next call; before this a
 * completed commitment only flipped a status and nothing ever named it
 * (`celebrations` had 0 docs, coach audit 2026-10-12).
 *
 * Stored at bogle_users/{uid}/wins/{winId}, one per completed commitment
 * (winId = commitmentId, so marking it done twice keeps one win):
 *   { commitmentId, text, doneAt, surfacedAt? }
 * - text: short, the caller's own words from the commitment.
 * - doneAt: ISO time it was marked done.
 * - surfacedAt: ISO time an opener named it; a win is named at most once.
 *
 * Forget-safe on both sides: nothing about a forgotten topic is written or
 * offered, and unreadable forgotten topics mean nothing either way.
 *
 * Written from commitment-keeper.ts updateCommitmentStatus('completed'), the
 * one path every "done" goes through (tools, API, turn-path progress check).
 * Read by the greeting (agents/multi-agent/greeting-direction.ts). Off unless
 * COACH_WINS=on.
 *
 * @module services/superhuman/wins
 */

import { flagOn } from '../../config/env-flag.js';
import { personFlagOn } from '../../config/person-flag.js';
import { forgottenTopicsOrNull, isForgotten } from '../../memory/index.js';
import { getFirestoreDb } from './firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'Wins' });

export interface Win {
  /** Document id (the commitment's id). */
  id: string;
  commitmentId: string;
  /** Short, in the caller's own words. */
  text: string;
  /** ISO time it was marked done. */
  doneAt: string;
  /** ISO time an opener named it. */
  surfacedAt?: string;
}

export function isWinsOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('COACH_WINS', env);
}

const MAX_TEXT = 140;
const MIN_WORDS = 3;
/** Older than this and "you did it" is old news. */
export const WIN_FRESH_DAYS = 14;
const DAY_MS = 86_400_000;

/** The win for a completed commitment document, or null when it has nothing to name. */
export function winFromCommitment(
  commitmentId: string,
  data: Record<string, unknown>,
  doneAt: Date
): Omit<Win, 'id'> | null {
  // "off to dinner" from a goodbye is not something they set out to do.
  if (data.source === 'goodbye_plan') return null;
  const text = String(data.statement ?? data.summary ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
  if (text.split(' ').length < MIN_WORDS) return null;
  return { commitmentId, text, doneAt: doneAt.toISOString() };
}

/** The Firestore this needs; injected so tests touch no database. */
export interface WinStore {
  commitment(userId: string, commitmentId: string): Promise<Record<string, unknown> | null>;
  /** Writes the win unless one exists for that id; false when it already did. */
  create(userId: string, win: Win): Promise<boolean>;
  /** Newest first. */
  recent(userId: string, limit: number): Promise<Win[]>;
  markSurfaced(userId: string, winId: string, at: string): Promise<void>;
}

function userDoc(userId: string) {
  return getFirestoreDb()?.collection('bogle_users').doc(userId) ?? null;
}

function asWin(id: string, d: Record<string, unknown>): Win | null {
  if (typeof d.text !== 'string' || typeof d.doneAt !== 'string') return null;
  return {
    id,
    commitmentId: String(d.commitmentId ?? id),
    text: d.text,
    doneAt: d.doneAt,
    ...(typeof d.surfacedAt === 'string' && { surfacedAt: d.surfacedAt }),
  };
}

export const firestoreWinStore: WinStore = {
  async commitment(userId, commitmentId) {
    const snap = await userDoc(userId)?.collection('commitments').doc(commitmentId).get();
    return snap?.exists ? (snap.data() ?? null) : null;
  },
  async create(userId, { id, ...win }) {
    const ref = userDoc(userId)?.collection('wins').doc(id);
    if (!ref) return false;
    try {
      await ref.create(win);
      return true;
    } catch (error) {
      // 6 = ALREADY_EXISTS: marked done before; keep the first win.
      if ((error as { code?: unknown }).code === 6) return false;
      throw error;
    }
  },
  async recent(userId, limit) {
    const snap = await userDoc(userId)
      ?.collection('wins')
      .orderBy('doneAt', 'desc')
      .limit(limit)
      .get();
    return (snap?.docs ?? []).map((d) => asWin(d.id, d.data())).filter((w): w is Win => w !== null);
  },
  async markSurfaced(userId, winId, at) {
    await userDoc(userId)?.collection('wins').doc(winId).update({ surfacedAt: at });
  },
};

export interface WinDeps {
  store?: WinStore;
  forgotten?: (userId: string) => Promise<string[] | null>;
  env?: Record<string, string | undefined>;
  now?: Date;
}

/**
 * Records a win for a commitment just marked done. Returns whether one was written. Never throws.
 * COACH_WINS is the person's own (cohort-flags.ts): "done" also comes from the UI server and
 * after a call, where process.env is not theirs.
 */
export async function recordWinFromCommitment(
  userId: string,
  commitmentId: string,
  deps: WinDeps = {}
): Promise<boolean> {
  if (!userId || !commitmentId || !(await personFlagOn(userId, 'COACH_WINS', deps.env))) {
    return false;
  }
  const store = deps.store ?? firestoreWinStore;
  try {
    const data = await store.commitment(userId, commitmentId);
    const win = data && winFromCommitment(commitmentId, data, deps.now ?? new Date());
    if (!win) return false;
    const forgotten = await (deps.forgotten ?? forgottenTopicsOrNull)(userId);
    if (forgotten === null || isForgotten(win.text, forgotten)) return false;
    const written = await store.create(userId, { id: commitmentId, ...win });
    log.info({ userId, commitmentId, written }, 'WIN_RECORDED');
    return written;
  } catch (error) {
    log.warn({ userId, commitmentId, error: String(error) }, 'Win not recorded');
    return false;
  }
}

/**
 * The win an opener may name: the newest one not yet named, done in the last
 * WIN_FRESH_DAYS, not about a forgotten topic. Never throws.
 */
export async function winForOpener(userId: string, deps: WinDeps = {}): Promise<Win | undefined> {
  if (!isWinsOn(deps.env) || !userId) return undefined;
  const store = deps.store ?? firestoreWinStore;
  const now = (deps.now ?? new Date()).getTime();
  try {
    const wins = await store.recent(userId, 10);
    const fresh = wins.filter(
      (w) => !w.surfacedAt && now - Date.parse(w.doneAt) <= WIN_FRESH_DAYS * DAY_MS
    );
    if (fresh.length === 0) return undefined;
    const forgotten = await (deps.forgotten ?? forgottenTopicsOrNull)(userId);
    if (forgotten === null) return undefined;
    return fresh.find((w) => !isForgotten(w.text, forgotten));
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Wins not loaded');
    return undefined;
  }
}

/** Records that an opener named the win, so no later call names it again. Never throws. */
export async function markWinSurfaced(
  userId: string,
  winId: string,
  deps: WinDeps = {}
): Promise<void> {
  const store = deps.store ?? firestoreWinStore;
  try {
    await store.markSurfaced(userId, winId, (deps.now ?? new Date()).toISOString());
  } catch (error) {
    log.warn({ userId, winId, error: String(error) }, 'Win not marked surfaced');
  }
}
