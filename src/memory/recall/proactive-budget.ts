/**
 * One proactive budget per call (PROACTIVE_BUDGET): at most PROACTIVE_PER_CALL_MAX
 * Ferni-started things per call, across every asker, opener or mid-call, keyed by sessionId.
 * A declined or ignored ask counts as spent. Safety is outside the budget: crisis risk on the
 * call spends the slot for safety, a crisis read in flight refuses without spending, a check
 * that throws refuses. Askers re-check `peekProactiveSlot(sessionId) === by` before they speak.
 *
 * In-process only. Texts after a call (B6) and suggestions to contact someone else (B7) are
 * NOT covered; each has its own limit (docs/plans/2026-11-07-right-moment-program.md).
 *
 * @module memory/recall/proactive-budget
 */

import { crisisReadInFlight, crisisRiskThisCall } from '../../services/safety/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { OpenerAsker } from './opener-claim.js';

const log = createLogger({ module: 'ProactiveBudget' });

export type ProactiveAsker =
  | OpenerAsker // 'greeting' | 'greeting-date' | 'recall-thread'
  | 'call-news'
  | 'caller-card'
  | 'follow-up'
  | 'commitment-insight'
  | 'recall-trigger'
  | 'connect-ask'
  | 'outreach-suggestion';

export type SlotResult = { ok: true } | { ok: false; heldBy: ProactiveAsker | 'safety' };

/** Ferni-started things per call, opener or mid-call. A declined or ignored ask counts. */
export const PROACTIVE_PER_CALL_MAX = 1;

/** Lapse for a call whose end never ran: longer than any call and the crisis-risk window. */
export const SLOT_MS = 12 * 60 * 60_000;

interface Slot {
  held: ProactiveAsker[];
  safety: boolean;
  at: number;
}

const slots = new Map<string, Slot>();
const SAFETY: SlotResult = { ok: false, heldBy: 'safety' };

function sweep(now: number): void {
  for (const [id, slot] of slots) if (now - slot.at > SLOT_MS) slots.delete(id);
}

/** The holder stays on record, so its own release can never clear the safety hold. */
function spend(sessionId: string, now: number): void {
  slots.set(sessionId, { held: slots.get(sessionId)?.held ?? [], safety: true, at: now });
}

/** Read in flight: refuse, not spent. Risk noted: spent for the call. A throw: refuse. */
function safetyHolds(sessionId: string, now: number): boolean {
  try {
    if (crisisReadInFlight(sessionId)) return true;
    if (!crisisRiskThisCall(sessionId, undefined, now)) return false;
  } catch (error) {
    log.warn({ error: String(error) }, 'Crisis check failed: no proactive ask');
    return true;
  }
  spend(sessionId, now);
  return true;
}

/** Take this call's one proactive slot. False when taken, or when the call is safety-held. */
export function claimProactiveSlot(
  sessionId: string,
  by: ProactiveAsker,
  now = Date.now()
): SlotResult {
  if (!sessionId) return SAFETY;
  sweep(now);
  if (safetyHolds(sessionId, now)) return SAFETY;
  const slot = slots.get(sessionId) ?? { held: [], safety: false, at: now };
  if (slot.safety) return SAFETY;
  const [holder] = slot.held;
  if (holder && slot.held.length >= PROACTIVE_PER_CALL_MAX) return { ok: false, heldBy: holder };
  slots.set(sessionId, { held: [...slot.held, by], safety: false, at: now });
  return { ok: true };
}

/** Who holds the slot, without taking it; 'safety' when safety holds the call (condition 8). */
export function peekProactiveSlot(
  sessionId: string,
  now = Date.now()
): ProactiveAsker | 'safety' | undefined {
  if (!sessionId || safetyHolds(sessionId, now)) return 'safety';
  const slot = slots.get(sessionId);
  return slot?.safety ? 'safety' : slot?.held[0];
}

/** Crisis: the slot is safety's for the rest of the call, whoever held it. Only call end clears it. */
export function spendForSafety(sessionId: string): void {
  spend(sessionId, Date.now());
}

/** Give back a slot `by` claimed and did not use. Never a safety hold or another asker's slot. */
export function releaseProactiveSlot(sessionId: string, by: ProactiveAsker): void {
  const slot = slots.get(sessionId);
  if (!slot || slot.safety || !slot.held.includes(by)) return;
  const held = slot.held.filter((asker) => asker !== by);
  if (held.length > 0) slots.set(sessionId, { ...slot, held });
  else slots.delete(sessionId);
}

/** Call end, from the existing session cleanup: drops everything for the session. */
export function endProactiveCall(sessionId: string): void {
  slots.delete(sessionId);
}

/** For tests: calls holding a slot. */
export function proactiveSlotCount(): number {
  return slots.size;
}

/** For tests. */
export function clearProactiveSlots(): void {
  slots.clear();
}
