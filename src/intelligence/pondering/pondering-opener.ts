/**
 * The one pondered thing a call may open on (pondering-reader.ts picks it),
 * held back when opening on it would be wrong:
 * - a crisis signal in the last CRISIS_QUIET_DAYS: that call opens plainly;
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

/** A crisis signal this recent keeps pondered questions out of the opener. */
export const CRISIS_QUIET_DAYS = 14;
const DAY_MS = 86_400_000;

function millis(x: unknown): number {
  if (typeof x === 'string') return Date.parse(x);
  if (x instanceof Date) return x.getTime();
  const toDate = (x as { toDate?: () => Date } | null)?.toDate;
  return typeof toDate === 'function' ? toDate.call(x).getTime() : NaN;
}

/**
 * True when the caller had a crisis signal in the last CRISIS_QUIET_DAYS: the
 * safety service's crisis_signals/{uid}, or an escalation in their
 * crisis_history.
 */
export async function hadRecentCrisis(
  db: Firestore,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const [signals, history] = await Promise.all([
    db.collection('crisis_signals').doc(userId).get(),
    db
      .collection('bogle_users')
      .doc(userId)
      .collection('crisis_history')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get(),
  ]);
  const last = Math.max(
    millis(signals.exists ? signals.data()?.lastSignalAt : undefined) || 0,
    millis(history.docs[0]?.data().timestamp) || 0
  );
  return last > 0 && now.getTime() - last <= CRISIS_QUIET_DAYS * DAY_MS;
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
