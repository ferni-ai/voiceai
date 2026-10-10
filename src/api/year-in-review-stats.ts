/**
 * Year in review: stats computed from what was recorded, or left out.
 *
 * @module api/year-in-review-stats
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface ConversationTenure {
  /** Timestamp (ms) of the earliest conversation in the year */
  firstConversationAt?: number;
  /** Minutes talked: only when every conversation recorded how long it lasted */
  minutes?: number;
}

/** How long a summary says the conversation lasted, in seconds, if it says */
export function durationSecondsOf(summary: Record<string, unknown>): number | undefined {
  const positive = (n: unknown): number | undefined =>
    typeof n === 'number' && n > 0 ? n : undefined;
  const ms = positive(summary.durationMs);
  return (
    positive(summary.durationSeconds) ??
    positive(summary.duration) ?? // ConversationSummary.duration is in seconds
    (ms === undefined ? undefined : ms / 1000)
  );
}

/**
 * First conversation and minutes talked, from the conversation summaries (oldest first).
 * Minutes are left out unless every summary has a duration: a total over some of them would
 * understate the year, and a guess (conversations x 8) is not a measurement.
 */
export function tenureOf(summaries: Array<Record<string, unknown>>): ConversationTenure {
  const first = summaries[0]?.timestamp;
  const seconds = summaries.map(durationSecondsOf);
  const known = seconds.length > 0 && seconds.every((s) => s !== undefined);
  return {
    firstConversationAt: typeof first === 'number' ? first : undefined,
    minutes: known
      ? Math.round(seconds.reduce<number>((sum, s) => sum + (s ?? 0), 0) / 60)
      : undefined,
  };
}

/**
 * Conversations per week over the weeks since the first one (at least 1), not over a flat
 * 52: someone who started three weeks ago did not have 52 weeks of conversations.
 */
export function averageConversationsPerWeek(
  total: number,
  { firstConversationAt }: ConversationTenure,
  now = Date.now()
): number {
  if (total === 0 || firstConversationAt === undefined) return 0;
  return total / Math.max(1, (now - firstConversationAt) / WEEK_MS);
}
