/**
 * The one shape a cross-persona insight takes on its way to the web app.
 *
 * GET /api/team-insights built this shape inline while /ws/insights sent the
 * raw CrossPersonaInsight, which has no `summary`. The app's toast read
 * `insight.summary`, got undefined, and showed "Ferni: {summary}" on a live
 * call. Both paths now go through toClientInsight(); apps/web validates the
 * result with TeamInsightSchema (apps/web/src/types/team-insight.ts).
 *
 * @module services/cross-persona/insight-wire-format
 */

import type { CrossPersonaInsight } from './cross-persona-insights.js';

export interface ClientInsight {
  id: string;
  source: string;
  category: string;
  /** One short line for toasts and card subtitles. */
  summary: string;
  content: string;
  priority: string;
  createdAt: number;
  isNew: boolean;
}

/** Long enough for a sentence, short enough for a toast. */
export const SUMMARY_MAX_CHARS = 90;

/**
 * The first sentence of `content`, cut at a word boundary with an ellipsis
 * when it is longer than `max`.
 */
export function summarizeInsight(content: string, max = SUMMARY_MAX_CHARS): string {
  const text = content.replace(/\s+/g, ' ').trim();
  const sentence = /^.+?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:-]+$/, '')}…`;
}

/** Strips internal fields (target, metadata, expiry) and adds the summary. */
export function toClientInsight(insight: CrossPersonaInsight): ClientInsight {
  return {
    id: insight.id,
    source: insight.source,
    category: insight.category,
    summary: summarizeInsight(insight.content ?? ''),
    content: insight.content,
    priority: insight.priority,
    createdAt: insight.createdAt,
    isNew: insight.oneTime,
  };
}
