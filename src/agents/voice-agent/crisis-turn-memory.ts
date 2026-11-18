/**
 * A crisis turn records nothing. A turn the crisis read replaced, guided or gave a soft check-in
 * becomes no moment of any type, no gratitude milestone, no callback moment and no "our song",
 * and semantic intelligence never sees it.
 *
 * The read is the turn's own: processTurn's crisis field (turn-crisis.ts, the pattern guard
 * with the live classifier's verdict), the field the turn handler turns into the crisis script,
 * the crisis guidance or the soft check-in. No words are read here. A turn with no crisis field
 * counts as a crisis turn (fail closed), as an unmarked turn does for transfer aliases
 * (services/safety/crisis-turn-mark.ts).
 *
 * Moments of every type are held, crisis_support and vulnerability included. Until 2026-11-13
 * those two still recorded, as moments that name the turn for what it was. The owner reversed
 * that on 2026-11-13: their stored words were coming back on later calls as callback hints. Holding
 * the moment also holds what the moment recorder does with it (personality-bridge.ts
 * recordUnifiedMoment): the caller's phrase kept in the relationship engine, the personality
 * service's record and its signals, and the bond data message to the client
 * (dispatchEmotionalBondSignal).
 *
 * CRISIS_HOLD_FOLLOWS_REPLY (off by default): the reply follows the more severe of the reply gate
 * (personas/crisis-gate.ts) and the pipeline, so the turn handler's writers also hold on a turn only
 * the gate read as a crisis (replyReadHold).
 *
 * @module voice-agent/crisis-turn-memory
 */

import { flagOn } from '../../config/env-flag.js';
import { crisisTurnSettled, replyGateTurnSettled } from '../../utils/crisis-memory-hold.js';
import { resolveCrisisGuardMode } from '../safety/crisis-shadow.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisDetection } from '../processors/types.js';

const log = createLogger({ module: 'CrisisTurnMemory' });

/** Whether the turn's crisis read replaced the reply, guided it, or gave a soft check-in. */
export function crisisReadTurn(crisis: CrisisDetection | undefined): boolean {
  return !crisis || crisis.shouldOverrideLLM || crisis.isCrisis || crisis.softCheck === true;
}

/**
 * CRISIS_HOLD_FOLLOWS_REPLY: whether the reply gate's reads hold this turn, asked once and only by
 * a writer that runs (never blocking the handler); null when the flag is off, as on main.
 *
 * Reuses the call's shared hold (utils/crisis-memory-hold.ts), which both engines feed: a pattern
 * guide or replace and every classifier read that is not a clean none, gave no verdict or failed
 * hold the call (services/safety/crisis-call-risk.ts). With the gate live (every voice reply runs
 * it: gatedReply), it waits for the gate's own read of the turn and its escalation
 * (noteReplyGateTurn): the pipeline's read never stands in for it. With the gate off or in shadow,
 * any read of the turn counts, as for the pipeline's own writers. Held when that read did not
 * start or the call's reads did not settle in time, or a read held the call: fail closed.
 */
export function replyReadHold(
  sessionId: string | undefined,
  words: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): (() => Promise<boolean>) | null {
  if (!flagOn('CRISIS_HOLD_FOLLOWS_REPLY', env)) return null;
  const settled = resolveCrisisGuardMode(env) === 'live' ? replyGateTurnSettled : crisisTurnSettled;
  let held: Promise<boolean> | undefined;
  return async () =>
    (held ??= settled(sessionId, words).then(
      (kept) => !kept,
      () => true
    ));
}

/**
 * The turn's unified moment recorder (personality-bridge.ts recordUnifiedMoment): on a crisis
 * turn it holds every moment; on any other turn it records them all. Logs the moment's type,
 * never words.
 */
export function momentRecorder<M extends { type: string }>(
  record: (moment: M) => Promise<unknown>,
  crisisTurn: boolean
): (moment: M) => Promise<void> {
  return async (moment) => {
    if (crisisTurn) {
      log.debug({ type: moment.type }, 'Moment held on a crisis turn');
      return;
    }
    await record(moment);
    log.debug({ type: moment.type }, 'Unified moment recorded');
  };
}
