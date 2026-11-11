/**
 * PROACTIVE_BUDGET: a commitment follow-up (S1, commitment-follow-up-gate.ts) is a proactive
 * ask, so it claims the call's one slot (memory/recall/proactive-budget.ts) before the
 * store is read, and re-checks that it still holds the slot once the pick returns, right
 * before the insight goes back to be injected: a crisis can spend the slot meanwhile. A
 * pick that found nothing gives the slot back. With no sessionId it is refused.
 * Off: both are always true, as before.
 *
 * @module agents/voice-agent/commitment-insight-budget
 */

import { flagOn } from '../../config/env-flag.js';
import { claimProactiveSlot, peekProactiveSlot, releaseProactiveSlot } from '../../memory/index.js';

/** Before the pick: whether this call's slot is free for a commitment follow-up. */
export function insightMayAsk(sessionId: string | undefined): boolean {
  if (!flagOn('PROACTIVE_BUDGET')) return true;
  return !!sessionId && claimProactiveSlot(sessionId, 'commitment-insight').ok;
}

/** After the pick: keep a picked follow-up only while it still holds the slot. */
export function keepInsight(picked: boolean, sessionId: string | undefined): boolean {
  if (!flagOn('PROACTIVE_BUDGET')) return true;
  if (!sessionId) return false;
  if (picked) return peekProactiveSlot(sessionId) === 'commitment-insight';
  releaseProactiveSlot(sessionId, 'commitment-insight');
  return true;
}
