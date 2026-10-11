/**
 * What this person's picks taught Ferni: which kinds (video, short, book),
 * which creators, and what length worked for them, learned from their
 * answers to "did it help?" (and the feedback action) in the pick log.
 *
 * Helped scores +1, somewhat +0.5, didn't help -1. A pick that was sent and
 * never tried (not done, or no answer once asked) counts -0.25: a skip says a
 * little. The next pick ranks liked creators and kinds up and disliked ones
 * down (boostFor), the check hears it as fit, and Ferni can say why ("you
 * liked the short ones from her last time").
 *
 * @module services/coach-media/taste
 */

import { callerText } from '../outreach/caller-text.js';
import type { Candidate } from './checked-pick.js';
import type { PickRecord } from './pick-log.js';

export const SHORT_SECONDS = 600;

export interface Taste {
  formats: Record<string, number>;
  creators: Record<string, number>;
  length: { short: number; long: number };
}

const creatorKey = (by: string): string => by.trim().toLowerCase();
const lengthKey = (seconds: number | undefined): 'short' | 'long' | null =>
  seconds === undefined ? null : seconds <= SHORT_SECONDS ? 'short' : 'long';

/** How much one pick's fate says, or null when it says nothing yet. */
export function signalOf(p: PickRecord): number | null {
  if (p.helped === 'yes') return 1;
  if (p.helped === 'somewhat') return 0.5;
  if (p.helped === 'no') return -1;
  if (p.sentVia && (p.outcome === 'not_done' || p.outcome === 'unanswered')) return -0.25;
  return null;
}

export function tasteFrom(records: PickRecord[]): Taste {
  const taste: Taste = { formats: {}, creators: {}, length: { short: 0, long: 0 } };
  for (const p of records) {
    const s = signalOf(p);
    if (s === null) continue;
    taste.formats[p.format] = (taste.formats[p.format] ?? 0) + s;
    if (p.by) taste.creators[creatorKey(p.by)] = (taste.creators[creatorKey(p.by)] ?? 0) + s;
    const len = lengthKey(p.lengthSeconds);
    if (len) taste.length[len] += s;
  }
  return taste;
}

/** How far taste moves a candidate up (or down) the ranking. */
export function boostFor(taste: Taste, c: Candidate, format: string): number {
  const len = lengthKey(c.seconds);
  return (
    (taste.creators[creatorKey(c.by)] ?? 0) +
    0.5 * (taste.formats[format] ?? 0) +
    (len ? 0.5 * taste.length[len] : 0)
  );
}

/** Why this pick suits what worked before, in a few words; '' when taste says nothing. */
export function tasteReason(taste: Taste, c: Candidate, format: string): string {
  const creator = taste.creators[creatorKey(c.by)] ?? 0;
  if (creator < 0) return ''; // never "you liked videos" about a creator they didn't
  const reasons: string[] = [];
  if (creator > 0) reasons.push(`picks from ${callerText(c.by, 60)}`);
  const len = lengthKey(c.seconds);
  if (len && taste.length[len] > 0) reasons.push(len === 'short' ? 'short ones' : 'longer ones');
  if ((taste.formats[format] ?? 0) > 0 && reasons.length === 0) reasons.push(`${format}s`);
  return reasons.length ? `last time they liked ${reasons.join(' and ')}` : '';
}

/** The taste in words for the check's fit text: "liked: short ones, videos; not: books". */
export function tasteWords(taste: Taste): string {
  const liked: string[] = [];
  const not: string[] = [];
  for (const [format, s] of Object.entries(taste.formats))
    (s > 0 ? liked : s < 0 ? not : []).push(`${format}s`);
  if (taste.length.short > 0) liked.push('short ones (under 10 minutes)');
  if (taste.length.long > 0) liked.push('longer ones');
  if (taste.length.short < 0) not.push('short ones');
  if (taste.length.long < 0) not.push('long ones');
  return [
    liked.length ? `liked ${liked.join(', ')}` : '',
    not.length ? `not ${not.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');
}
