/**
 * The judge without the wait: TURN_MEMORY_JUDGE_ASYNC, layered on
 * TURN_MEMORY_RERANK.
 *
 * The judge (turn-memory-rerank.ts) finds the memories a turn is about far
 * better than the runner-up gate, but it takes about 1.1 s, and the turn
 * cannot wait for it. People stay on a subject for more than one turn, so
 * what the judge finds for this turn is usually still right for the next.
 * With this flag on:
 *
 * 1. The gate's pick goes into this turn's prompt as before.
 * 2. The judge runs in the background, and nothing on the reply path awaits
 *    it. Its picks, minus what the gate sent this turn, become the session's
 *    pending recall. Anything it calls the older side of an updated fact is
 *    marked superseded for the rest of the session.
 * 3. On the next caller turn, a pending pick joins the gate's pick ahead of
 *    the cap, but only if this turn's own search found it at cosine 0.45 or
 *    more. Otherwise the subject has moved on and the pick is dropped. A
 *    pick lives for 2 caller turns at most, never comes back once marked
 *    superseded, and still goes through retrieveForTurn's recently-surfaced
 *    dedup.
 *
 * The judge skips turns with fewer than 4 words, or whose best candidate is
 * under cosine 0.50. Backchannels and short asides get no memory from the
 * gate anyway (haystack bench), so judging them would cost a call for
 * nothing.
 *
 * @module memory/retrieval/turn-memory-pending
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { HybridSearchResult } from './hybrid-search.js';

const log = createLogger({ module: 'TurnMemoryPending' });

/** Caller turns a pending pick stays eligible for. */
export const PENDING_RECALL_TURNS = 2;

/** Fewest words a turn needs before the background judge runs. */
export const MIN_JUDGED_WORDS = 4;

/** Lowest best-candidate cosine at which the background judge runs. */
export const MIN_JUDGED_TOP_COSINE = 0.5;

/** Sessions with pending recall kept in memory; the oldest goes first. */
const MAX_SESSIONS = 500;

/** A background judge still out after this long is let go; its answer would be stale. */
export const BACKGROUND_JUDGE_TIMEOUT_MS = 10_000;

/** The judge's verdict as candidate indexes: kept (older sides removed) and older sides. */
export interface JudgeVerdict {
  keep: Set<number>;
  old: Set<number>;
}

/** The turn being retrieved for. */
export interface PendingTurn {
  transcript: string;
  sessionId: string;
  turnNumber: number;
}

interface SessionRecall {
  /** Pending memory id -> the turn whose judge picked it. */
  picks: Map<string, number>;
  superseded: Set<string>;
  judging: Set<Promise<void>>;
}

const sessions = new Map<string, SessionRecall>();

function sessionRecall(sessionId: string): SessionRecall {
  let s = sessions.get(sessionId);
  if (s) sessions.delete(sessionId); // re-insert: most recent last
  s ??= { picks: new Map(), superseded: new Set(), judging: new Set() };
  sessions.set(sessionId, s);
  if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value as string);
  return s;
}

/** TURN_MEMORY_JUDGE_ASYNC. The caller checks TURN_MEMORY_RERANK. */
export function turnMemoryJudgeAsyncOn(env: Env = process.env): boolean {
  return flagOn('TURN_MEMORY_JUDGE_ASYNC', env);
}

/** Whether a turn is worth a background judge call. */
export function worthJudging(transcript: string, ranked: Array<{ score: number }>): boolean {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return words >= MIN_JUDGED_WORDS && (ranked[0]?.score ?? 0) >= MIN_JUDGED_TOP_COSINE;
}

/**
 * This turn's memories: the gate's pick plus the session's still-relevant
 * pending picks. Starts the background judge whose picks are pending for the
 * next turns. `candidates` are this turn's search results at cosine >= 0.45.
 */
export function gateWithPendingRecall(
  gated: HybridSearchResult[],
  candidates: HybridSearchResult[],
  ranked: HybridSearchResult[],
  turn: PendingTurn,
  judge: (candidates: HybridSearchResult[]) => Promise<JudgeVerdict | null>,
  timeoutMs: number = BACKGROUND_JUDGE_TIMEOUT_MS
): HybridSearchResult[] {
  const s = sessionRecall(turn.sessionId);
  const sent = new Set(gated.map((r) => r.id));
  const carried = candidates.filter((c) => {
    const born = s.picks.get(c.id);
    if (born === undefined || sent.has(c.id) || s.superseded.has(c.id)) return false;
    const age = turn.turnNumber - born;
    return age >= 1 && age <= PENDING_RECALL_TURNS;
  });
  for (const c of carried) sent.add(c.id);
  // A pick is used once; one this turn's search did not find means the subject moved on.
  for (const [id, born] of s.picks) if (born < turn.turnNumber) s.picks.delete(id);

  if (candidates.length > 0 && worthJudging(turn.transcript, ranked)) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const run: Promise<void> = Promise.race([judge(candidates), late])
      .then((verdict) => {
        if (!verdict) return;
        for (const id of [...verdict.old].map((i) => candidates[i]?.id)) {
          if (!id) continue;
          s.superseded.add(id);
          s.picks.delete(id);
        }
        for (const i of verdict.keep) {
          const id = candidates[i]?.id;
          if (id && !sent.has(id)) s.picks.set(id, turn.turnNumber);
        }
      })
      .catch((error: unknown) => log.debug({ error: String(error) }, 'Background judge failed'))
      .finally(() => {
        clearTimeout(timer);
        s.judging.delete(run);
      });
    s.judging.add(run);
  }
  return [...gated, ...carried];
}

/** Resolves once every background judge for the session (or all sessions) has finished. Tests and the bench. */
export async function settleTurnMemoryJudges(sessionId?: string): Promise<void> {
  const all = sessionId ? [sessions.get(sessionId)] : [...sessions.values()];
  await Promise.all(all.flatMap((s) => (s ? [...s.judging] : [])));
}
