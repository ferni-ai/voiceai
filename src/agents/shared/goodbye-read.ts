/**
 * After a reopen, a goodbye pair ends the call only once the caller's goodbye
 * turn has had a clean crisis read (the lead's ruling B on #2605 item 3).
 *
 * A reopening line the word check missed ("goodbye cruel world.") followed by
 * a goodbye said as its own turn ("I gotta go") used to end the call on
 * Ferni's "take care" with no read of either line. The words can't tell that
 * from "oh wait, one more thing" then "okay, bye"; only the classifier can.
 * So with the classifier on (every turn gets a read, turn-crisis.ts), the end
 * holds when no read of the goodbye has started: the call then ends only by
 * the reopen idle (reopen-idle.ts). A read still in flight, or risk a read
 * found, already holds it (crisisRiskThisCall). With the classifier off no
 * read ever comes, so nothing changes.
 *
 * @module agents/shared/goodbye-read
 */
import { onCrisisReadStarted } from '../../services/safety/crisis-call-risk.js';
import { resolveCrisisClassifierMode } from '../../services/safety/crisis-classifier.js';
import type { Env } from '../../config/env-flag.js';

/** Reads kept since the reopen: enough for the turns before a goodbye's end. */
const MAX_READS = 20;

/** The classifier reads every caller turn: its mode is not off (turn-crisis.ts, crisis-gate.ts). */
export function crisisReadsExpected(env: Env = process.env): boolean {
  return resolveCrisisClassifierMode(env) !== 'off';
}

export interface GoodbyeReadGate {
  /** The call reopened: from now on a goodbye needs its read. */
  reopened: () => void;
  /** The caller's goodbye turn (its conversation item's words). */
  goodbye: (text: string) => void;
  /** After a reopen, with reads on, no read of the goodbye has started: the end holds. */
  unread: () => boolean;
  stop: () => void;
}

/**
 * `contains`: a read's words contain the goodbye line (call-farewell.ts
 * containsLine). `readsExpected`: the classifier reads each caller turn
 * (default crisisReadsExpected).
 */
export function goodbyeReadGate(
  sessionId: string,
  contains: (read: string, line: string) => boolean,
  readsExpected: () => boolean = () => crisisReadsExpected()
): GoodbyeReadGate {
  /** Words of the reads started since the reopen; null before any reopen. */
  let reads: string[] | null = null;
  let line = '';
  // A turn's read starts in onUserTurnCompleted, before LiveKit adds its item
  const off = onCrisisReadStarted((id, words) => {
    if (id === sessionId && reads) reads = [...reads.slice(1 - MAX_READS), words];
  });
  return {
    reopened: () => {
      reads = [];
      line = '';
    },
    goodbye: (text) => {
      line = text;
    },
    unread: () => reads !== null && readsExpected() && !reads.some((r) => contains(r, line)),
    stop: off,
  };
}
