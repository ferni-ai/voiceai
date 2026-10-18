/**
 * Holds that carry a hard moment over the next few turns, so the turn after
 * the news is still read as part of it. Both share CANDOR's hold
 * (`supportHeld`, turn-candor.ts), so they agree on when it ends.
 *
 * Split out of turn-request.ts, which is at its size limit.
 *
 * @module agents/personas/turn-holds
 */

import { troubleOpening, troublesTalkEnabled, troubleTurn } from './troubles-talk.js';
import { candorEnabled, supportHeld } from './turn-candor.js';
import { regexSignals, type TurnSignals } from './turn-extras.js';
import { callerMove } from './turn-shape.js';

type Source = 'model' | 'plain' | 'regex';

/**
 * CANDOR=on: after hard news, support comes first for the next few turns too
 * ("Can you just tell me something funny?" after "my dad's in the hospital"
 * is no moment to set them straight). Off, the signals are passed through.
 */
export function withSupportHold(
  session: object,
  said: string,
  signals: TurnSignals | undefined,
  source: Source
): TurnSignals | undefined {
  if (!candorEnabled()) return signals;
  const sig = signals ?? regexSignals(said, callerMove(said));
  // Only the model's reading is sticky: plain (no reading yet) is careful by default.
  return { ...sig, supportFirst: supportHeld(session, said, source === 'model' && sig.careful) };
}

/**
 * TROUBLES_TALK=on: a trouble holds for the next few turns, the way CANDOR's
 * support does ("Thanks for listening" after the scan news got his own story
 * about his dad). Off, the signals are passed through and `trouble` stays unset.
 */
export function withCallTrouble(
  session: object,
  said: string,
  signals: TurnSignals | undefined,
  source: Source
): TurnSignals | undefined {
  if (!troublesTalkEnabled()) return signals;
  const sig = signals ?? regexSignals(said, callerMove(said));
  const hurting = (source === 'model' && sig.careful) || troubleOpening(said);
  return { ...sig, trouble: supportHeld(session, said, hurting) || troubleTurn(said, sig) };
}
