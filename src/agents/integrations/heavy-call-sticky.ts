/**
 * HEAVY_CALL_STICKY: a call that has had a hard moment stays grave for its live
 * backchannels until it ends.
 *
 * The backchannels read grave from the caller's last 3 turns (callIsGrave,
 * presence-heavy.ts). Speech-to-text splits a halting, grieving caller into
 * short fragments, so a few minutes into a bereavement call the loss has left
 * that window and the happy "Mmhm!" take or a laugh-along can play over the
 * next hard line (#3845). The presence sounds already stay quiet for the rest
 * of such a call (callHadHardMoment); with the flag on, the backchannels share
 * that same mark: soft "mm"s only.
 *
 * @module agents/integrations/heavy-call-sticky
 */

import { flagOn } from '../../config/env-flag.js';
import { callHadHardMoment } from './presence-heavy.js';

/** Flag on and the call has had a hard moment: its backchannels stay soft for the rest of it. */
export function heavyCallSticky(
  session: object,
  env: Record<string, string | undefined> = process.env
): boolean {
  return flagOn('HEAVY_CALL_STICKY', env) && callHadHardMoment(session);
}
