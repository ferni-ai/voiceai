/**
 * No happy memory of a crisis turn. A turn the crisis read replaced, guided or gave a soft
 * check-in never becomes shared humor, a breakthrough, a win, a deep talk, a gratitude
 * milestone, a callback moment or "our song": "lol" on a line about ending a life is not a
 * laugh to bring back on a later call.
 *
 * The read is the turn's own: processTurn's crisis field (turn-crisis.ts, the pattern guard
 * with the live classifier's verdict), the field the turn handler turns into the crisis script,
 * the crisis guidance or the soft check-in. No words are read here. A turn with no crisis field
 * counts as a crisis turn (fail closed), as an unmarked turn does for transfer aliases
 * (services/safety/crisis-turn-mark.ts).
 *
 * Moments that name the turn for what it was (crisis_support, vulnerability) still record.
 *
 * @module voice-agent/crisis-turn-memory
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CrisisDetection } from '../processors/types.js';

const log = createLogger({ module: 'CrisisTurnMemory' });

/** Unified moments that keep a turn as a happy or warm memory (personality-bridge.ts). */
const HAPPY_MOMENTS: ReadonlySet<string> = new Set([
  'breakthrough',
  'celebration',
  'laughter',
  'deep_conversation',
]);

/** Whether the turn's crisis read replaced the reply, guided it, or gave a soft check-in. */
export function crisisReadTurn(crisis: CrisisDetection | undefined): boolean {
  return !crisis || crisis.shouldOverrideLLM || crisis.isCrisis || crisis.softCheck === true;
}

/**
 * The turn's unified moment recorder (personality-bridge.ts recordUnifiedMoment): on a crisis
 * turn it holds the happy moments and records the rest. Logs the moment's type, never words.
 */
export function momentRecorder<M extends { type: string }>(
  record: (moment: M) => Promise<unknown>,
  crisisTurn: boolean
): (moment: M) => Promise<void> {
  return async (moment) => {
    if (crisisTurn && HAPPY_MOMENTS.has(moment.type)) {
      log.debug({ type: moment.type }, 'Happy moment held on a crisis turn');
      return;
    }
    await record(moment);
    log.debug({ type: moment.type }, 'Unified moment recorded');
  };
}
