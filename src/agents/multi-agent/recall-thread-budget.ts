/**
 * The first recall note's reads of the call's one proactive slot (PROACTIVE_BUDGET,
 * memory/recall/proactive-budget.ts). Off: exactly as before.
 *
 * - openerAsked: someone already asked this call's opener follow-up, so the note adds neither
 *   the week's predictions nor its thread. On, a call safety holds (crisis risk noted, or a
 *   crisis read in flight) counts as asked, so the note adds no proactive line beside it.
 * - threadInBudget: the follow-up thread (OPENER_FOLLOW_UP_LINE) is a proactive ask, so it
 *   takes the slot and re-checks that it holds it as the line joins the note. With no
 *   sessionId it is refused.
 *
 * @module agents/multi-agent/recall-thread-budget
 */

import { flagOn } from '../../config/env-flag.js';
import { claimProactiveSlot, peekProactiveSlot, takeOpenerClaim } from '../../memory/index.js';

/** Whether the greeting, the hello's date or (PROACTIVE_BUDGET) safety already holds the opener. */
export function openerAsked(userId: string, sessionId: string | undefined): boolean {
  if (takeOpenerClaim(userId, sessionId) !== undefined) return true;
  return flagOn('PROACTIVE_BUDGET') && !!sessionId && peekProactiveSlot(sessionId) === 'safety';
}

/** Whether the recall note may ask its follow-up thread on this call. */
export function threadInBudget(sessionId: string | undefined): boolean {
  if (!flagOn('PROACTIVE_BUDGET')) return true;
  if (!sessionId) return false;
  if (!claimProactiveSlot(sessionId, 'recall-thread').ok) return false;
  return peekProactiveSlot(sessionId) === 'recall-thread';
}
