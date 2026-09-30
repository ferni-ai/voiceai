/**
 * How often we reach out, by how recently someone has talked with Ferni.
 *
 * Someone active hears from us at most daily. The quieter they've gone, the
 * longer we wait between messages, and after a few unanswered ones we stop
 * until they come back: a friend doesn't keep texting someone who never
 * replies.
 *
 * @module OutreachCadence
 */

export type EngagementLevel = 'high' | 'medium' | 'low' | 'silent';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimum days between messages at each engagement level. */
export const COOLDOWN_DAYS: Record<EngagementLevel, number> = {
  high: 1,
  medium: 2,
  low: 4,
  silent: 7,
};

/** Messages sent since their last conversation before we go quiet. */
export const MAX_UNANSWERED = 3;

function toTime(value: unknown): number | undefined {
  const raw = (value as { toDate?: () => Date })?.toDate?.() ?? value;
  if (raw === undefined || raw === null) return undefined;
  const t = new Date(raw as string | number | Date).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/**
 * When the user last talked with Ferni. User records keep this in
 * `lastContact` (lastConversationDate is on none of them in production).
 */
export function lastTalkedAt(user: Record<string, unknown>): number | undefined {
  return toTime(user.lastContact) ?? toTime(user.lastConversationDate);
}

export function engagementLevel(user: Record<string, unknown>, now = Date.now()): EngagementLevel {
  const last = lastTalkedAt(user);
  if (last === undefined) return 'silent';
  const days = Math.floor((now - last) / DAY_MS);
  if (days <= 2) return 'high';
  if (days <= 7) return 'medium';
  if (days <= 14) return 'low';
  return 'silent';
}

/**
 * Messages sent since the user last talked with Ferni. A conversation after
 * our last message means they answered, so the count starts over.
 */
export function unansweredCount(user: Record<string, unknown>): number {
  const lastOutreach = toTime(user.lastOutreachDate);
  if (lastOutreach === undefined) return 0;
  const lastConversation = lastTalkedAt(user);
  if (lastConversation !== undefined && lastConversation > lastOutreach) return 0;
  const n = Number(user.outreachUnanswered ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Why this user shouldn't hear from us now, or null if a message is due. */
export function cadenceHold(
  user: Record<string, unknown>,
  level: EngagementLevel,
  now = Date.now()
): string | null {
  if (unansweredCount(user) >= MAX_UNANSWERED) return 'Unanswered limit reached';
  const lastOutreach = toTime(user.lastOutreachDate);
  if (lastOutreach !== undefined && now - lastOutreach < COOLDOWN_DAYS[level] * DAY_MS) {
    return 'Contacted recently';
  }
  return null;
}
