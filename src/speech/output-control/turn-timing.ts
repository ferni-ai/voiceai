/**
 * Where a turn's reply was held on purpose, for its TURN_RECEIPT (turn-receipt.ts):
 * the action-claim guard holds a sentence until it is checked, the opener gate the
 * opening until it can drop a stock "Oh", the crisis gate the reply until the
 * classifier clears it, and an unfinished-sounding turn waits for its commit
 * (unfinished-turn.ts). Each reports here by session id, so a latency A/B can tell
 * which hold moved. Bookkeeping only: Date.now(), never awaited, never throws.
 *
 * @module speech/output-control/turn-timing
 */

/** A hold measured where it happens: ms the reply's words waited there. */
export type TurnHoldKind = 'actionClaim' | 'openerGate' | 'crisis';

/**
 * A hold kind, or: 'unfinishedTurn', the ms an unfinished turn is about to be held
 * before its commit (0: answered at once), measured at the commit; 'openerAudio', an
 * opening clip ("Mm") began playing, `ms` until it reaches the wire.
 */
export type TurnTimingKind = TurnHoldKind | 'unfinishedTurn' | 'openerAudio';

export type TurnTimingListener = (sessionId: string, kind: TurnTimingKind, ms: number) => void;
const listeners = new Set<TurnTimingListener>();

/** Hear each session's holds (turn-receipt-session.ts). Returns an unsubscribe. */
export function onTurnTiming(listener: TurnTimingListener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function noteTurnTiming(
  sessionId: string | undefined,
  kind: TurnTimingKind,
  ms: number
): void {
  if (!sessionId || !Number.isFinite(ms)) return;
  for (const listener of listeners) {
    try {
      listener(sessionId, kind, ms);
    } catch {
      // Observability only: never in the way of the reply.
    }
  }
}

/** The call's session id on an AgentSession's userData (`services.sessionId`), if any. */
export function sessionIdIn(userData: unknown): string | undefined {
  if (typeof userData !== 'object' || userData === null) return undefined;
  return (userData as { services?: { sessionId?: string } }).services?.sessionId;
}

/** Times one hold: from the first start() to the first stop() after it, reported once. */
export interface HoldTimer {
  start: () => void;
  stop: () => void;
}

export function turnHoldTimer(
  sessionId: string | undefined,
  kind: TurnHoldKind,
  now: () => number = Date.now
): HoldTimer {
  let startedAt: number | undefined;
  let done = !sessionId;
  return {
    start() {
      if (!done) startedAt ??= now();
    },
    stop() {
      if (done || startedAt === undefined) return;
      done = true;
      noteTurnTiming(sessionId, kind, now() - startedAt);
    },
  };
}
