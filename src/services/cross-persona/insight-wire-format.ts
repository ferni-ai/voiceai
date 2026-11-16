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

/**
 * A spaced hyphen or dash, or any em dash, used as a pause reads as a comma: no dashes in
 * Ferni's lines (docs/decisions/register.md D4), spaced or not: "Just checking in - no
 * pressure." becomes "Just checking in, no pressure." A range between numbers is left alone.
 */
function withoutDashPauses(text: string): string {
  return text.replace(/\s+[-\u2013\u2014]+\s+|\s*\u2014+\s*/g, (dash, at: number) =>
    /\d/.test(text[at - 1] ?? '') && /\d/.test(text[at + dash.length] ?? '') ? dash : ', '
  );
}

/** Strips internal fields (target, metadata, expiry) and adds the summary. */
export function toClientInsight(insight: CrossPersonaInsight): ClientInsight {
  const content = withoutDashPauses(insight.content ?? '');
  return {
    id: insight.id,
    source: insight.source,
    category: insight.category,
    summary: summarizeInsight(content),
    content,
    priority: insight.priority,
    createdAt: insight.createdAt,
    isNew: insight.oneTime,
  };
}

/**
 * The team's high-priority proactive notes for the app's team panel, beside `listed` (the
 * insights it already shows): one per persona and wording, newest first, none listed twice.
 * GET /api/team-insights sent these only as "From ferni: ..." strings, which the panel never
 * read, so a long-time user with seven notes saw the first-run empty state (2026-11-16).
 * Callers pass only notes the user has not hidden (insight-visibility.ts).
 */
export function toClientDiscoveries(
  notes: readonly CrossPersonaInsight[],
  listed: readonly ClientInsight[]
): ClientInsight[] {
  const seen = new Set(listed.map((i) => `${i.source}|${i.content}`));
  const listedIds = new Set(listed.map((i) => i.id));
  return [...notes]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((n) => !listedIds.has(n.id))
    .map((n) => ({ ...toClientInsight(n), isNew: false }))
    .filter((n) => {
      const key = `${n.source}|${n.content}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
