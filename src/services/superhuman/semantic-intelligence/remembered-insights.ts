/**
 * Proactive insights less any about a topic the caller asked Ferni to forget (#3995), with
 * FORGET_EVERY_READER on (off in prod); with it off, every insight surfaces as before.
 *
 * Every reader of the insight broker (the sanctuary and semantic-intelligence routes, the
 * session's prompt, the semantic context) reads through getInsightsToSurface, which passes
 * here before it scores or marks anything. An insight often quotes the caller (an open loop's
 * "You mentioned ..." with their words as its context), so the passage matcher reads it
 * (forgottenPassageCheck: any distinctive word of a topic). It reads every string in the stored
 * document, not a list of fields, because the routes return the document as stored and an old
 * one can carry a field the type doesn't name. The topics are the shared read, or the last ones
 * read when it is late or fails; with no topics ever read, nothing surfaces (fails closed).
 *
 * @module services/superhuman/semantic-intelligence/remembered-insights
 */

import type { ProactiveInsight } from './insight-broker.js';

/** The insights not about a forgotten topic (all of them with the flag off). */
export async function rememberedInsights(
  userId: string,
  insights: ProactiveInsight[]
): Promise<ProactiveInsight[]> {
  if (insights.length === 0) return insights;
  // Loaded lazily, as open loops load it: the memory context is heavy to resolve.
  const { forgottenPassageCheck, remembered } = await import('../../../memory/index.js');
  return remembered(insights, await forgottenPassageCheck(userId, 'insights'), (i) =>
    callerText(i)
  );
}

/** The broker's own labels and ids: never the caller's words ("medium", "session_start"). */
const LABELS = new Set(['id', 'userId', 'source', 'priority', 'type', 'condition']);

/** Every string in a stored insight but its labels, a few levels down. */
function callerText(value: unknown, key = '', depth = 0): string {
  if (typeof value === 'string') return LABELS.has(key) ? '' : value;
  if (depth > 4 || !value || typeof value !== 'object' || value instanceof Date) return '';
  if (Array.isArray(value)) return value.map((v) => callerText(v, key, depth + 1)).join(' ');
  return Object.entries(value)
    .map(([k, v]) => callerText(v, k, depth + 1))
    .join(' ');
}
