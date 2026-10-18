/**
 * A per-instance daily send counter for the Workspace mailbox.
 *
 * Workspace lets one user send about 2,000 messages a day (a rolling 24 hours).
 * This counts sends per UTC day against a lower limit, and holds sends while
 * Gmail has told us to wait. It is per process, so several Cloud Run instances
 * can together pass the limit: Gmail's own 429 is the backstop.
 *
 * @module services/email-transport/send-quota
 */

export interface DailySendQuota {
  /** Why a send must wait, or null when it may go now. */
  blockedReason: () => string | null;
  record: () => void;
  /** Hold every send until `untilMs` (Gmail's "Retry after"). */
  blockUntil: (untilMs: number) => void;
  sentToday: () => number;
}

const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function createDailySendQuota(limit: number, now: () => number): DailySendQuota {
  let day = utcDay(now());
  let count = 0;
  let blockedUntil = 0;
  const roll = (): void => {
    const today = utcDay(now());
    if (today !== day) {
      day = today;
      count = 0;
    }
  };

  return {
    blockedReason() {
      roll();
      if (now() < blockedUntil)
        return `gmail asked us to wait until ${new Date(blockedUntil).toISOString()}`;
      if (count >= limit) return `daily send limit reached (${count}/${limit} today)`;
      return null;
    },
    record() {
      roll();
      count += 1;
    },
    blockUntil(untilMs) {
      blockedUntil = Math.max(blockedUntil, untilMs);
    },
    sentToday() {
      roll();
      return count;
    },
  };
}
