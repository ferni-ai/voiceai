/**
 * Proactive insights less any about a topic the caller asked Ferni to forget (#3995).
 *
 * Every reader of the insight broker (the sanctuary and semantic-intelligence routes, the
 * session's prompt, the semantic context) reads through getInsightsToSurface, which passes
 * here before it scores or marks anything. An insight often quotes the caller (an open loop's
 * "You mentioned ..." with their words as its context), so the passage matcher reads it: any
 * distinctive word of a topic. It reads every string in the stored document, not a list of
 * fields, because the routes return the document as stored and an old one can carry a field
 * the type doesn't name. When the forgotten list can't be read, nothing surfaces: a privacy
 * request fails closed.
 *
 * @module services/superhuman/semantic-intelligence/remembered-insights
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ProactiveInsight } from './insight-broker.js';

const log = createLogger({ module: 'remembered-insights' });

/** The insights not about a forgotten topic; none when the forgotten list can't be read. */
export async function rememberedInsights(
  userId: string,
  insights: ProactiveInsight[]
): Promise<ProactiveInsight[]> {
  if (insights.length === 0) return insights;
  // Loaded lazily, as open loops load it: the memory context is heavy to resolve.
  const { forgottenPassageFilter } = await import('../../../memory/index.js');
  const forgotten = await forgottenPassageFilter(userId);
  if (!forgotten) {
    log.warn({ userId, count: insights.length }, 'Forgotten topics unreadable: insights held');
    return [];
  }
  return insights.filter((i) => !forgotten(callerText(i)));
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
