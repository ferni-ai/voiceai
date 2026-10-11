/**
 * Revived context builders: three dead builders brought back on data the live
 * pipeline actually writes.
 *
 * The legacy builder registry (context-builders/index.ts) has no live caller,
 * and most of its builders read stores nothing fills on prod (2026-10-10
 * census: memory_capsules, special_dates, unified_entities, social_graph,
 * dreams are empty; session-gap read a field no profile has). Each builder
 * here keeps the intent of a dead one and reads what is really there:
 *
 * - last-call (memory/continuity-context, session/cross-session-threading):
 *   how the previous call felt and what was left open, from its summary.
 * - recent-calls (continuity-context's rolling summary): one line per earlier
 *   call, so Ferni knows the thread of their life, not just the last call.
 * - session-gap (awareness/session-gap-awareness): after a long gap, pick up
 *   warmly instead of asking where they've been. Reads profile.lastContact,
 *   which the old builder never did.
 *
 * Pure functions over loaded data; revived-intelligence.ts loads and caches.
 *
 * @module intelligence/revived/revived-builders
 */

import { contentWords } from '../../memory/recall/session-recall.js';

export const REVIVED_BUILDER_NAMES = ['last-call', 'recent-calls', 'session-gap'] as const;
export type RevivedBuilderName = (typeof REVIVED_BUILDER_NAMES)[number];

export interface RevivedLine {
  builder: RevivedBuilderName;
  text: string;
  /** Higher first when the token budget is short. */
  priority: number;
  /** Shown while the call's turn number is below this: background, not a topic to repeat. */
  untilTurn: number;
}

/** A session summary as stored in bogle_users/{id}/summaries. */
export interface SummaryDoc {
  sessionId?: unknown;
  timestamp?: unknown;
  emotionalArc?: unknown;
  questionsRemaining?: unknown;
  followUpItems?: unknown;
  keyPoints?: unknown;
  mainTopics?: unknown;
  turnCount?: unknown;
}

export interface RevivedInput {
  sessionId: string;
  userName?: string;
  /** Newest first. */
  summaries: SummaryDoc[];
  /** profile.lastContact as loaded at session start: the end of their previous call. */
  lastContact?: unknown;
  /** profile.lastConversationSummary: already in the system prompt, so never repeated. */
  lastConversationSummary?: string;
  now: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_DAYS = 90;
const GAP_DAYS = 14;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  const d = typeof v === 'string' || typeof v === 'number' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * Summaries are written by a model about "the assistant" and "the user". Ferni
 * never says "assistant", and words in the context leak into speech.
 */
export function inFerniVoice(raw: string, userName?: string): string {
  const them = userName?.trim() || 'they';
  return raw
    .replace(/\bthe (AI )?assistant('s)?\b/gi, (_m, _ai, s?: string) =>
      s !== undefined ? 'your' : 'you'
    )
    .replace(/\bassistant\b/gi, 'you')
    .replace(/\bthe user's\b/gi, userName ? `${them}'s` : 'their')
    .replace(/\bthe user\b/gi, them)
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when most of `item`'s content words already appear in one of `seen`. */
export function alreadyCovered(item: string, seen: string[]): boolean {
  const words = contentWords(item);
  if (words.size === 0) return true;
  return seen.some((s) => {
    const other = contentWords(s);
    let shared = 0;
    for (const w of words) if (other.has(w)) shared++;
    return shared / words.size >= 0.5;
  });
}

function ago(days: number): string {
  if (days < 1) return 'earlier today';
  if (days < 2) return 'yesterday';
  if (days < 14) return `${Math.round(days)} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

/** Earlier calls with something in them, newest first, never this session's own summary. */
function pastCalls(input: RevivedInput): Array<{ doc: SummaryDoc; days: number }> {
  const out: Array<{ doc: SummaryDoc; days: number }> = [];
  for (const doc of input.summaries) {
    if (text(doc.sessionId) && text(doc.sessionId) === input.sessionId) continue;
    const at = toDate(doc.timestamp);
    if (!at) continue;
    const days = (input.now.getTime() - at.getTime()) / DAY_MS;
    if (days < 0 || days > MAX_AGE_DAYS) continue;
    if (strings(doc.keyPoints).length === 0 && !text(doc.emotionalArc)) continue;
    out.push({ doc, days });
  }
  return out;
}

export function lastCallLines(input: RevivedInput): RevivedLine[] {
  const last = pastCalls(input).at(0);
  if (last === undefined) return [];
  const lines: RevivedLine[] = [];
  const arc = text(last.doc.emotionalArc);
  if (arc) {
    lines.push({
      builder: 'last-call',
      text: `How your last call (${ago(last.days)}) felt: ${clip(inFerniVoice(arc, input.userName), 240)}`,
      priority: 76,
      untilTurn: 10,
    });
  }
  // Follow-ups reach the call through memory recall (memory-recall-hook.ts);
  // only questions it doesn't already cover are new here.
  const followUps = input.summaries.flatMap((s) => strings(s.followUpItems));
  const seen = [...followUps, input.lastConversationSummary ?? ''];
  const open = strings(last.doc.questionsRemaining)
    .filter((q) => !alreadyCovered(q, seen))
    .slice(0, 2)
    .map((q) => clip(inFerniVoice(q, input.userName), 120));
  if (open.length > 0) {
    lines.push({
      builder: 'last-call',
      text: `Still unknown from last time: ${open.join('; ')}`,
      priority: 75,
      untilTurn: 10,
    });
  }
  return lines;
}

export function recentCallsLines(input: RevivedInput): RevivedLine[] {
  const earlier = pastCalls(input).slice(1, 4);
  const said = [input.lastConversationSummary ?? ''];
  const lines: string[] = [];
  for (const { doc, days } of earlier) {
    const points = strings(doc.keyPoints)
      .filter((p) => !alreadyCovered(p, said))
      .slice(0, 2)
      .map((p) => inFerniVoice(p, input.userName));
    if (points.length === 0) continue;
    said.push(...points);
    lines.push(`${ago(days)}: ${clip(points.join('; '), 160)}`);
  }
  if (lines.length === 0) return [];
  return [
    {
      builder: 'recent-calls',
      text: `Earlier calls: ${lines.join(' | ')}`,
      priority: 70,
      untilTurn: 10,
    },
  ];
}

export function sessionGapLines(input: RevivedInput): RevivedLine[] {
  const last = toDate(input.lastContact);
  if (!last) return [];
  const days = (input.now.getTime() - last.getTime()) / DAY_MS;
  if (days < GAP_DAYS) return [];
  return [
    {
      builder: 'session-gap',
      text: `It's been ${ago(days).replace(' ago', '')} since you last talked. Pick up like a friend who's glad to hear from them; don't ask where they've been or make them explain the gap.`,
      priority: 74,
      untilTurn: 3,
    },
  ];
}

export const REVIVED_BUILDERS: Record<RevivedBuilderName, (input: RevivedInput) => RevivedLine[]> =
  {
    'last-call': lastCallLines,
    'recent-calls': recentCallsLines,
    'session-gap': sessionGapLines,
  };
