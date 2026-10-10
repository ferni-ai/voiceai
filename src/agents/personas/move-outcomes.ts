/**
 * After a call, its move log (move-log.ts) becomes one record at
 * bogle_users/{uid}/move_outcomes/{sessionId}: for each reply, the moves Ferni
 * made and what the caller did next, and for the call, how long it ran and how
 * it ended. Move ids and numbers only, never the caller's words.
 *
 * Whether they called back within 7 days is left null here: it is read later
 * from the next record's startedAt.
 *
 * @module agents/personas/move-outcomes
 */
import type { AfterCallContext, AfterCallTask } from '../../services/session/after-call-tasks.js';
import { createLogger } from '../../utils/safe-logger.js';
import { moveOutcomesEnabled, takeMoveLog, type MoveLog, type ReplyLength } from './move-log.js';

const log = createLogger({ module: 'move-outcomes' });

/** What the caller did on the turn after a reply. */
export interface NextTurn {
  /** Their next turn's words over their median turn so far (1 = as usual). */
  lenRatio: number;
  disclosure: 0 | 1;
  laughed: 0 | 1;
  dropped: 0 | 1;
}

export interface MoveOutcomeRecord {
  v: 1;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  call: {
    durationSec: number;
    callerTurns: number;
    endedWithGoodbye: boolean;
    earlyHangup: boolean; // inside EARLY_HANGUP_SEC, with no goodbye
    calledBackWithin7d: boolean | null;
  };
  turns: Array<{
    moves: Move[];
    replyLength: ReplyLength;
    replyWords: number;
    bargeIn: 0 | 1;
    next: NextTurn | null; // null: the call ended before they spoke again
    /** MOVE_LEARNING's success bit: they went on as long or opened up, no barge-in or drop. */
    success: 0 | 1 | null;
  }>;
}

/** The STYLE_PROFILE (W3) multiplier a move's draw goes through, so W3's learner reads it directly. */
export type W3Knob = 'replyLength' | 'laugh' | 'opinion' | 'filler' | 'pushback';
export interface Move {
  id: string;
  w3Knob?: W3Knob;
}
const W3_KNOB: Record<string, W3Knob> = {
  laugh_along: 'laugh',
  laugh_spontaneous: 'laugh',
  laughed: 'laugh',
  opinion: 'opinion',
  filler: 'filler',
  candor: 'pushback',
  candor_yes: 'pushback',
  candor_unknowable: 'pushback',
  stance: 'pushback',
};
const tagged = (id: string): Move => (W3_KNOB[id] ? { id, w3Knob: W3_KNOB[id] } : { id });

export const EARLY_HANGUP_SEC = 90;
const MAX_TURNS = 400; // about a two-hour call: a record stays small

const bit = (b: boolean): 0 | 1 => (b ? 1 : 0);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildMoveOutcomeRecord(
  moveLog: MoveLog,
  startedAt: number,
  endedAt: number
): MoveOutcomeRecord {
  const entries = moveLog.entries.slice(0, MAX_TURNS);
  const turns = entries.map((entry, i) => {
    const after = i + 1 < entries.length ? entries[i + 1].caller : undefined;
    const usual = Math.max(1, median(entries.slice(0, i + 1).map((e) => e.caller.words)));
    return {
      moves: entry.moves.map(tagged),
      replyLength: entry.replyLength,
      replyWords: entry.replyWords,
      bargeIn: bit(entry.bargedIn),
      success: after
        ? bit((after.words >= usual || after.disclosure) && !entry.bargedIn && !after.dropped)
        : null,
      next: after
        ? {
            lenRatio: Math.round((after.words / usual) * 100) / 100,
            disclosure: bit(after.disclosure),
            laughed: bit(after.laughed),
            dropped: bit(after.dropped),
          }
        : null,
    };
  });
  const durationSec = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const endedWithGoodbye = entries.at(-1)?.caller.goodbye ?? false;
  return {
    v: 1,
    sessionId: moveLog.sessionId,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    call: {
      durationSec,
      callerTurns: moveLog.entries.length,
      endedWithGoodbye,
      earlyHangup: durationSec < EARLY_HANGUP_SEC && !endedWithGoodbye,
      calledBackWithin7d: null,
    },
    turns,
  };
}

export interface MoveOutcomeStore {
  save: (userId: string, sessionId: string, record: MoveOutcomeRecord) => Promise<void>;
}

export const firestoreMoveOutcomeStore: MoveOutcomeStore = {
  async save(userId, sessionId, record) {
    const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('move_outcomes')
      .doc(sessionId)
      .set(record);
  },
};

/** The after-call task: saves the call's record when MOVE_OUTCOMES=on logged one. */
export function moveOutcomesTask(
  store: MoveOutcomeStore = firestoreMoveOutcomeStore,
  now: () => number = Date.now
): AfterCallTask {
  return async (ctx: AfterCallContext) => {
    const moveLog = takeMoveLog(ctx.sessionId);
    if (!moveLog || moveLog.entries.length === 0 || !moveOutcomesEnabled()) return;
    const record = buildMoveOutcomeRecord(moveLog, ctx.startedAt.getTime(), now());
    await store.save(ctx.userId, ctx.sessionId, record);
    log.info(
      { sessionId: ctx.sessionId, turns: record.turns.length, ...record.call },
      'MOVE_OUTCOMES saved'
    );
  };
}
