/**
 * Open threads from earlier calls, with when they came up.
 *
 * "My interview is Thursday" is only useful to a friend who knows when it
 * was said: on Wednesday they wish you luck, on Friday they ask how it went,
 * and once they have asked they do not ask again. Session summaries keep the
 * follow-ups; this keeps the day each was said (in the caller's own
 * calendar) and which ones Ferni has already raised, so it never asks twice.
 *
 * Pure: parsing, wording and matching. Storage lives with the recall store.
 *
 * @module memory/recall/follow-ups
 */

import { localDayNumber, localWeekday } from '../../utils/local-clock.js';
import { contentWords } from './words.js';

export interface FollowUp {
  /** Stable across calls: the same thread from the same call has the same id. */
  id: string;
  text: string;
  /** When the call it came from happened (epoch ms; 0 when unknown). */
  at: number;
}

const MAX_FOLLOW_UPS = 3;
/** Older than this, a thread has usually resolved itself or gone stale. */
const MAX_AGE_DAYS = 45;
/** Words a reply shares with a thread before it counts as raised... */
const MIN_OVERLAP = 2;
/** ...or one word this long ("interview", "surgery"): specific enough alone. */
const DISTINCTIVE_LENGTH = 6;
/** How summaries phrase a thread ("ask how ... went"), not what it is about. */
const INSTRUCTION_WORDS = new Set([
  'ask',
  'check',
  'see',
  'follow',
  'find',
  'remind',
  'went',
  'whether',
  'next',
  'time',
  'user',
  'caller',
  'update',
  // How a caller's own plan is quoted ("They said: \"I'll call...\"")
  'said',
  "i'll",
  'gonna',
  'need',
  'plan',
  'planning',
  'promised',
  // When, not what: "Thursday" alone must never close the interview thread
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'weekend',
  'today',
  'tonight',
  'tomorrow',
  'yesterday',
  'morning',
  'afternoon',
  'evening',
  'week',
  'month',
]);

/** Epoch ms from a stored timestamp (Firestore Timestamp, Date, ISO string or number), or 0. */
export function toMillis(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime() || 0;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (value && typeof value === 'object') {
    const v = value as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof v.toMillis === 'function') return v.toMillis();
    const seconds = v._seconds ?? v.seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return 0;
}

/** What a thread is about: its content words minus how it was phrased. */
function topicWords(text: string): string[] {
  return [...contentWords(text)].filter((w) => !INSTRUCTION_WORDS.has(w));
}

/** A stable id for a thread: its topic words, in order. */
export function followUpId(text: string): string {
  const topic = topicWords(text).join('-');
  return (topic || text.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 120) || 'thread';
}

/**
 * The open threads from recent session summaries (newest first), minus the
 * ones already raised and the stale ones.
 */
export function followUpsFromSummaries(
  summaries: ReadonlyArray<Record<string, unknown>>,
  closed: ReadonlySet<string>,
  now: number = Date.now()
): FollowUp[] {
  const out: FollowUp[] = [];
  const seen = new Set<string>();
  for (const s of summaries) {
    const at = toMillis(s.timestamp);
    if (at && now - at > MAX_AGE_DAYS * 86_400_000) continue;
    for (const item of Array.isArray(s.followUpItems) ? s.followUpItems : []) {
      const text = String(item).trim();
      const id = followUpId(text);
      if (!text || seen.has(id) || closed.has(id)) continue;
      seen.add(id);
      out.push({ id, text, at });
      if (out.length >= MAX_FOLLOW_UPS) return out;
    }
  }
  return out;
}

/** When a thread came up, the way a person would say it. */
export function whenSaid(at: number, now: number, timezone?: string): string {
  if (!at) return 'on an earlier call';
  const days = localDayNumber(new Date(now), timezone) - localDayNumber(new Date(at), timezone);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago (${localWeekday(new Date(at), timezone)})`;
  if (days < 14) return `last ${localWeekday(new Date(at), timezone)}, ${days} days ago`;
  return `about ${Math.round(days / 7)} weeks ago`;
}

/** The lines for the recall note; empty when there are none. */
export function formatFollowUps(
  followUps: readonly FollowUp[],
  now: number,
  timezone?: string
): string[] {
  if (followUps.length === 0) return [];
  return [
    'Open threads from earlier calls (and when they came up):',
    ...followUps.map((f) => `- ${f.text} [said ${whenSaid(f.at, now, timezone)}]`),
    'If one was about something coming up, work out from when it was said whether it has happened yet: ask how it went, or wish them well for it.',
  ];
}

/** The offered threads a reply actually brought up. */
export function raisedIn(reply: string, offered: readonly FollowUp[]): FollowUp[] {
  const said = contentWords(reply);
  return offered.filter((f) => {
    const shared = topicWords(f.text).filter((w) => said.has(w));
    return shared.length >= MIN_OVERLAP || shared.some((w) => w.length >= DISTINCTIVE_LENGTH);
  });
}
