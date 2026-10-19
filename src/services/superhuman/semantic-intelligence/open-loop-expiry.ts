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
