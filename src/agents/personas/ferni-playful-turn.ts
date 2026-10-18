/**
 * Marks a turn playful for the turn reminder (FERNI_PLAYFUL, ferni-playful.ts):
 * the flag on and Ferni, not a teammate, speaking. Kept apart from
 * ferni-playful.ts, which turn-shape.ts imports, so neither imports the other.
 *
 * @module agents/personas/ferni-playful-turn
 */

import type { Env } from '../../config/env-flag.js';
import { classifyBackchannelContext } from '../integrations/backchannel-context.js';
import { ferniPlayfulOn, ferniSpeaking } from './ferni-playful.js';
import { callerVenting, regexSignals, type TurnSignals } from './turn-extras.js';
import { callerMove } from './turn-shape.js';

/**
 * Hard words, whatever the signals say. The regex signals mark only venting as
 * careful, so "My dad passed away last week" read as an easy share and would
 * have got the playful line.
 */
function heavy(said: string): boolean {
  const context = classifyBackchannelContext(said);
  return callerVenting(said) || context === 'bad_news' || context === 'tender';
}

/**
 * The signals with `playful` set when the flag is on, Ferni is speaking and
 * their words aren't heavy; else as given.
 */
export function withPlayful(
  session: object,
  said: string,
  signals: TurnSignals | undefined,
  env: Env = process.env
): TurnSignals | undefined {
  if (!ferniPlayfulOn(env) || !ferniSpeaking(session) || heavy(said)) return signals;
  return { ...(signals ?? regexSignals(said, callerMove(said))), playful: true };
}
