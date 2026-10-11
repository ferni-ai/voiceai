/**
 * Whether the user still sees a cross-team insight in the app.
 *
 * Acknowledging an insight in the app hides it there and keeps it: the team
 * can still draw on it, and it still expires on its own schedule.
 *
 * @module services/cross-persona/insight-visibility
 */

import type { CrossPersonaInsight } from './cross-persona-insights.js';

const HIDDEN_AT = 'hiddenFromUserAt';

/** Marks the insight hidden from the user. Returns true when it found one to hide. */
export function hideFromUser(
  insights: CrossPersonaInsight[],
  insightId: string,
  now: number = Date.now()
): boolean {
  const insight = insights.find((i) => i.id === insightId);
  if (!insight) return false;
  if (isHiddenFromUser(insight)) return true;
  insight.metadata = { ...insight.metadata, [HIDDEN_AT]: now };
  return true;
}

export function isHiddenFromUser(insight: Pick<CrossPersonaInsight, 'metadata'>): boolean {
  return typeof insight.metadata?.[HIDDEN_AT] === 'number';
}
