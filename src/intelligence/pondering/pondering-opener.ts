/**
 * The one pondered thing a call may open on (pondering-reader.ts picks it),
 * held back when opening on it would be wrong:
 * - a crisis-level signal in the last CRISIS_QUIET_DAYS (crisis-signals.ts):
 *   that call opens plainly;
 * - a topic they asked Ferni to forget since the pass ran.
 *
 * Off unless PONDERING=on.
 *
 * @module intelligence/pondering/pondering-opener
 */
import type { Firestore } from 'firebase-admin/firestore';
import { forgottenTopicsOrNull, isForgotten } from '../../memory/index.js';
import { isPonderingOn, type PonderFollowUp, type PonderNote } from './pondering.js';
import { readPonderingForGreeting } from './pondering-reader.js';
import {
  CRISIS_QUIET_DAYS,
  hadCrisisWithin,
} from '../../services/human-transfer/crisis-signals.js';

export { CRISIS_QUIET_DAYS };

/**
 * True when the caller had a crisis-level signal in the last CRISIS_QUIET_DAYS,
 * by the shared rule in crisis-signals.ts (true when unreadable).
 */
export async function hadRecentCrisis(
  db: Firestore,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  return hadCrisisWithin(db, userId, CRISIS_QUIET_DAYS, now);
}

export interface OpenerAsk {
  text: string;
  item: PonderFollowUp | PonderNote;
}

/** The pondered thing the opener may ask about, or undefined. Reads in parallel. */
export async function ponderingForOpener(
  db: Firestore,
  userId: string,
  opts: { now?: Date; env?: Record<string, string | undefined> } = {}
): Promise<OpenerAsk | undefined> {
  if (!isPonderingOn(opts.env ?? process.env)) return undefined;
  const [picked, crisis, forgotten] = await Promise.all([
    readPonderingForGreeting(db, userId, opts),
    hadRecentCrisis(db, userId, opts.now),
    forgottenTopicsOrNull(userId), // memory_state/forgotten, shared at call start
  ]);
  const item = picked.followUp ?? picked.note;
  // Topics that can't be read hold the opener back, as a forgotten one would.
  if (!item || crisis || !forgotten || isForgotten(item.text, forgotten)) {
    return undefined;
  }
  return { text: item.text, item };
}
