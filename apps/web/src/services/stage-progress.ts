/**
 * Stage progress: how far a user is towards a relationship stage's thresholds.
 *
 * Only requirements the stage actually sets (a minimum above 0) count. A
 * requirement of 0 is not progress: counting it as met showed a brand-new user
 * 67% of the way to the next stage with 0 conversations, and dividing by it
 * gave NaN (0/0).
 */

export interface StageProgressMetrics {
  totalConversations: number;
  daysSinceFirstMeeting: number;
  currentStreak: number;
  longestStreak: number;
}

export interface StageProgressThreshold {
  minConversations: number;
  minDays: number;
  minStreak: number;
}

/** Average progress (0..1) over the requirements with a minimum above 0; 1 when there are none. */
export function averageRequirementProgress(
  metrics: StageProgressMetrics,
  threshold: StageProgressThreshold
): number {
  const bestStreak = Math.max(metrics.currentStreak, metrics.longestStreak);
  const pairs: Array<[value: number, min: number]> = [
    [metrics.totalConversations, threshold.minConversations],
    [metrics.daysSinceFirstMeeting, threshold.minDays],
    [bestStreak, threshold.minStreak],
  ];
  const fractions = pairs
    .filter(([, min]) => min > 0)
    .map(([value, min]) => Math.min(1, value / min));
  if (fractions.length === 0) return 1;
  return fractions.reduce((sum, fraction) => sum + fraction, 0) / fractions.length;
}
