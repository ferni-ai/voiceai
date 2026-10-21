/**
 * When an open loop stops being worth following up on.
 *
 * Loops were only ever closed by hand, so they piled up: 1,319 open in prod,
 * 49% already past followUpBefore, and anything that listed "open" loops showed
 * the stale ones too. A loop past its followUpBefore is never surfaced again,
 * and after a grace period it is closed as expired.
 *
 * @module services/superhuman/semantic-intelligence/open-loop-expiry
 */

import { getFirestoreDb } from '../firestore-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'open-loop-expiry' });

/** Days past followUpBefore after which an open loop is closed as expired. */
export const OPEN_LOOP_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

interface LoopTiming {
  status: string;
  followUpBefore: Date;
}

/** Still worth raising: open, and not yet past the follow-up window. */
export function isLoopLive(loop: LoopTiming, now: Date = new Date()): boolean {
  const before = loop.followUpBefore.getTime();
  return loop.status === 'open' && Number.isFinite(before) && now.getTime() <= before;
}

/** Open, and past the window plus the grace period (or with no valid window): expire it. */
export function shouldExpireLoop(loop: LoopTiming, now: Date = new Date()): boolean {
  const before = loop.followUpBefore.getTime();
  if (loop.status !== 'open') return false;
  return !Number.isFinite(before) || now.getTime() > before + OPEN_LOOP_GRACE_DAYS * DAY_MS;
}

/**
 * Close a stored loop as expired: update() of the status only, so nothing else in the doc is
 * rewritten from the (possibly stale) loaded copy. The semantic index stops treating it as
 * something to follow up on.
 */
export async function expireStoredLoop(
  userId: string,
  loop: { id: string; type?: string },
  /** The semantic-index hook (open-loops hands in onCoachingInsightChange) */
  onIndexChange?: (
    userId: string,
    id: string,
    data: {
      insight: string;
      context: string;
      personaId: string;
      category: 'follow_up';
      actionable: boolean;
    },
    op: 'update'
  ) => unknown
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('open_loops')
      .doc(loop.id)
      .update({ status: 'expired' });
    void onIndexChange?.(
      userId,
      `open_loop_${loop.id}`,
      {
        insight: `Open loop (${loop.type ?? 'item'}) expired`,
        context: 'Status: expired',
        personaId: 'ferni',
        category: 'follow_up',
        actionable: false,
      },
      'update'
    );
  } catch (error) {
    log.warn({ error: String(error), userId, loopId: loop.id }, 'Failed to expire open loop');
  }
}
