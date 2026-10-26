/**
 * FIRST_TURN_WARM: on, the per-turn build yields to the event loop between its
 * cold steps, which otherwise run back to back and starve the reply's audio
 * pump (LOOP_STALL). Off, the build runs as on main.
 *
 * @module agents/multi-agent/first-turn-warm
 */

import { setImmediate as yieldToLoop } from 'node:timers/promises';
import { flagOn } from '../../config/env-flag.js';

/** Between two cold steps: a yield when FIRST_TURN_WARM is on. */
export const yieldIfFirstTurnWarm = async (): Promise<void> => {
  if (flagOn('FIRST_TURN_WARM')) await yieldToLoop();
};

/** Whether call-path warm-up builds the Vertex client (FIRST_TURN_WARM). */
export const firstTurnWarmOn = (): boolean => flagOn('FIRST_TURN_WARM');
