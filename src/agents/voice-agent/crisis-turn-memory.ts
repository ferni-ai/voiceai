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
 * @module voice-agent/crisis-turn-memory
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisDetection } from '../processors/types.js';

const log = createLogger({ module: 'CrisisTurnMemory' });

/** Whether the turn's crisis read replaced the reply, guided it, or gave a soft check-in. */
export function crisisReadTurn(crisis: CrisisDetection | undefined): boolean {
  return !crisis || crisis.shouldOverrideLLM || crisis.isCrisis || crisis.softCheck === true;
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
