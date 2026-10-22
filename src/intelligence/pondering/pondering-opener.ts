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
import { isForgotten } from '../../memory/index.js';
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

async function forgottenTopics(db: Firestore, userId: string): Promise<string[]> {
  const doc = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('memory_state')
    .doc('forgotten')
    .get();
  const topics: unknown = doc.exists ? doc.data()?.topics : undefined;
  return Array.isArray(topics) ? topics.filter((t): t is string => typeof t === 'string') : [];
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
    forgottenTopics(db, userId),
  ]);
  const item = picked.followUp ?? picked.note;
  if (!item || crisis || isForgotten(item.text, forgotten)) return undefined;
  return { text: item.text, item };
}
