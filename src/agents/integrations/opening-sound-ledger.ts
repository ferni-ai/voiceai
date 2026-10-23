/**
 * One opening sound per caller turn, shared by the early opening sound
 * (turn-opening-sound.ts) and the slow-turn sound (slow-turn-sound.ts).
 *
 * Each kept its own "not two turns running" rule, so together they could
 * alternate (early on turn 1, slow on turn 2, early on turn 3) into a sound on
 * every turn: the tic both rules exist to prevent. This ledger counts caller
 * turns (the first "speaking" after a commit starts one) and records which turn
 * each sound opened. It exists only on calls with SLOW_TURN_SOUND on
 * (trackTurnSounds is called by the slow-turn wiring); without it every check
 * here answers as if nothing had played, so the early sound is unchanged.
 *
 * It also notes when the opener gate decided a reply's opening (crisis-gate.ts):
 * past that point a sound would land in front of a reply whose own "Mm," was
 * already kept.
 *
 * @module agents/integrations/opening-sound-ledger
 */

import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

interface SessionEvents {
  on(event: string, handler: (ev: unknown) => void): unknown;
}

interface Ledger {
  /** The caller's turn number; the first "speaking" after a commit starts the next. */
  turn: number;
  startedAt: number;
  committed: boolean;
  /** The turn the last opening sound (either kind) opened. */
  soundTurn: number;
  /** The turn the last slow-turn sound opened. */
  slowTurn: number;
  /** When the opener gate last decided a reply's opening. */
  decidedAt: number;
}

const ledgers = new WeakMap<object, Ledger>();

/** Start counting this session's caller turns (once per session). */
export function trackTurnSounds(session: SessionEvents): void {
  if (ledgers.has(session)) return;
  const ledger: Ledger = {
    turn: 0,
    startedAt: 0,
    committed: true,
    soundTurn: -2,
    slowTurn: -2,
    decidedAt: 0,
  };
  ledgers.set(session, ledger);
  session.on('user_state_changed', (ev) => {
    if ((ev as { newState?: string })?.newState !== 'speaking' || !ledger.committed) return;
    ledger.turn += 1;
    ledger.startedAt = Date.now();
    ledger.committed = false;
  });
  session.on('conversation_item_added', (ev) => {
    const item = (ev as { item?: { role?: string; textContent?: string } })?.item;
    if (item?.role === 'user' && !(item.textContent ?? '').startsWith(TURN_CONTEXT_HEADER)) {
      ledger.committed = true;
    }
  });
}

/** An opening sound played for the caller's current turn. */
export function noteOpeningSound(session: object, kind: 'early' | 'slow'): void {
  const ledger = ledgers.get(session);
  if (!ledger) return;
  ledger.soundTurn = ledger.turn;
  if (kind === 'slow') ledger.slowTurn = ledger.turn;
}

/** No opening sound on this turn or the one before it. */
export function openingSoundAllowed(session: object): boolean {
  const ledger = ledgers.get(session);
  return !ledger || ledger.turn - ledger.soundTurn >= 2;
}

/** A slow-turn sound opened this turn or the one before: the early sound stays out. */
export function slowSoundBlocksEarly(session: object): boolean {
  const ledger = ledgers.get(session);
  return Boolean(ledger) && (ledger as Ledger).turn - (ledger as Ledger).slowTurn < 2;
}

/** A slow-turn sound opened the caller's current turn (any reply of it, a tool's answer too). */
export function slowSoundOpenedThisTurn(session: object): boolean {
  const ledger = ledgers.get(session);
  return Boolean(ledger) && (ledger as Ledger).slowTurn === (ledger as Ledger).turn;
}

/** When the caller started this turn (0 when not tracked). */
export function callerTurnStartedAt(session: object): number {
  return ledgers.get(session)?.startedAt ?? 0;
}

/** The opener gate decided a reply's opening now. */
export function noteOpeningDecided(session: object): void {
  const ledger = ledgers.get(session);
  if (ledger) ledger.decidedAt = Date.now();
}

/** Whether the opener gate decided a reply's opening at or after `since`. */
export function openingDecidedSince(session: object, since: number): boolean {
  return (ledgers.get(session)?.decidedAt ?? 0) >= since && since > 0;
}
