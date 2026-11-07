/**
 * PROACTIVE_BUDGET: the first recall note's follow-up thread (OPENER_FOLLOW_UP_LINE) is a
 * proactive ask, so it takes the call's one slot (memory/recall/proactive-budget.ts) and
 * re-checks that it holds the slot as the line joins the note. With no sessionId it is
 * refused. Off: always true, as before.
 *
 * @module agents/multi-agent/recall-thread-budget
 */

import { flagOn } from '../../config/env-flag.js';
import { claimProactiveSlot, peekProactiveSlot } from '../../memory/index.js';

/** Whether the recall note may ask its follow-up thread on this call. */
export function threadInBudget(sessionId: string | undefined): boolean {
  if (!flagOn('PROACTIVE_BUDGET')) return true;
  if (!sessionId) return false;
  if (!claimProactiveSlot(sessionId, 'recall-thread').ok) return false;
  return peekProactiveSlot(sessionId) === 'recall-thread';
}
