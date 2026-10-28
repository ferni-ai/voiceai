/**
 * One opening sound per caller turn, shared by the early opening sound, the
 * slow-turn sound, the TOOL_ACK_CLIP line and the tool hum (tool-hum.ts), so
 * they can't stack in a turn or alternate into a sound on every turn. A
 * caller turn starts with the first "speaking" after a commit. Tracked only on
 * calls with SLOW_TURN_SOUND or TOOL_ACK_CLIP on (slow-turn-wiring.ts,
 * tool-ack-clip-wiring.ts); untracked, every check
 * answers as if nothing played and the early sound is unchanged.
 *
 * @module agents/integrations/opening-sound-ledger
 */

import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

/** soundTurn/slowTurn: the turn the last sound (either kind / slow) opened. */
interface Ledger {
  turn: number;
  startedAt: number;
  committed: boolean;
  soundTurn: number;
  slowTurn: number;
  /** When the opener gate last decided a reply's opening. */
  decidedAt: number;
}

const ledgers = new WeakMap<object, Ledger>();

export function trackTurnSounds(session: Pick<NodeJS.EventEmitter, 'on'>): void {
  if (ledgers.has(session)) return;
  const l: Ledger = {
    turn: 0,
    startedAt: 0,
    committed: true,
    soundTurn: -2,
    slowTurn: -2,
    decidedAt: 0,
  };
  ledgers.set(session, l);
  session.on('user_state_changed', (ev) => {
    if ((ev as { newState?: string })?.newState !== 'speaking' || !l.committed) return;
    Object.assign(l, { turn: l.turn + 1, startedAt: Date.now(), committed: false });
  });
  session.on('conversation_item_added', (ev) => {
    const item = (ev as { item?: { role?: string; textContent?: string } })?.item;
    if (item?.role === 'user' && !(item.textContent ?? '').startsWith(TURN_CONTEXT_HEADER))
      l.committed = true;
  });
}

export function noteOpeningSound(session: object, kind: 'early' | 'slow' | 'tool' | 'hum'): void {
  const l = ledgers.get(session);
  if (l) Object.assign(l, { soundTurn: l.turn }, kind === 'slow' && { slowTurn: l.turn });
}

/** An opening sound (early, slow, TOOL_ACK_CLIP line or tool hum) played this caller turn. */
export function openingSoundThisTurn(session: object): boolean {
  const l = ledgers.get(session);
  return l !== undefined && l.soundTurn === l.turn;
}

/**
 * No opening sound this turn or the one before, and the opener gate has not
 * decided this turn's reply opening (a sound then would double its "Mm,").
 */
export function openingSoundAllowed(session: object): boolean {
  const l = ledgers.get(session);
  return !l || (l.turn - l.soundTurn >= 2 && l.decidedAt < l.startedAt);
}

/** A slow-turn sound opened this turn or the one before: the early sound stays out. */
export function slowSoundBlocksEarly(session: object): boolean {
  const l = ledgers.get(session);
  return l !== undefined && l.turn - l.slowTurn < 2;
}

/**
 * Asked by the opener gate as it decides a reply's opening (crisis-gate.ts), and
 * recorded: a slow-turn sound that opened this caller turn opens every reply of
 * it, the answer after a tool too.
 */
export function slowSoundOpenedReply(session: object): boolean {
  const l = ledgers.get(session);
  if (!l) return false;
  l.decidedAt = Date.now();
  return l.slowTurn === l.turn;
}
