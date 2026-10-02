/**
 * Boundaries — HARD constraints for anything Ferni does on its own initiative
 * (openers, predictions, insights, reminders, outreach).
 *
 * Callers:
 *   F (openers / predictions / insights): `isTopicAllowedProactively` before raising a topic.
 *   G (important dates / reminders): `isContactAllowedAt` before an unprompted message,
 *     `isTopicAllowedProactively` before a date-based nudge about a person/topic.
 *
 * Topic checks fail CLOSED (return false) when the profile can't be read: a missed
 * opener is cheap, raising a topic the user asked us to leave alone is not.
 * Reacting to what the user brings up is never blocked by these helpers.
 *
 * @module services/user-preferences/boundaries
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isActive, normalizeItem } from './rules.js';
import { listPreferences } from './store.js';
import type { ProactiveBoundaries, UserPreference } from './types.js';

const log = createLogger({ module: 'UserPreferenceBoundaries' });

/** Small equivalence sets so "don't bring up my dad" also covers "father". */
const SYNONYMS: readonly (readonly string[])[] = [
  ['dad', 'father', 'papa', 'pop'],
  ['mom', 'mother', 'mum', 'mama'],
  ['ex', 'ex-wife', 'ex-husband', 'ex-girlfriend', 'ex-boyfriend', 'ex-partner', 'former partner'],
  ['weight', 'weight loss', 'dieting', 'body'],
  ['job', 'work', 'career', 'boss'],
  ['money', 'finances', 'debt', 'budget'],
  ['divorce', 'separation'],
  ['death', 'grief', 'loss', 'passed away'],
];

function expand(term: string): string[] {
  const t = normalizeItem(term).replace(/^(my|the|our|his|her) /, '');
  const set = new Set([t]);
  for (const group of SYNONYMS) if (group.includes(t)) group.forEach((g) => set.add(g));
  return [...set];
}

function containsTerm(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i').test(haystack);
}

/** Pure: does `topic` touch any of the avoided topics? */
export function topicMatchesBoundary(topic: string, avoidTopics: readonly string[]): boolean {
  const text = normalizeItem(topic);
  if (!text) return false;
  return avoidTopics.some((avoid) =>
    expand(avoid).some((term) => containsTerm(text, term) || containsTerm(term, text))
  );
}

export function boundariesFrom(prefs: readonly UserPreference[]): ProactiveBoundaries {
  const active = prefs.filter((p) => p.domain === 'boundaries' && isActive(p));
  return {
    avoidTopics: active
      .filter((p) => p.key.startsWith('avoidTopic:'))
      .map((p) => normalizeItem(p.value)),
    doNotContact: active.filter((p) => p.key === 'doNotContact').map((p) => p.value),
    sensitivities: active
      .filter((p) => p.key.startsWith('sensitivity:'))
      .map((p) => normalizeItem(p.value)),
  };
}

export async function getProactiveBoundaries(userId: string): Promise<ProactiveBoundaries> {
  return boundariesFrom(await listPreferences(userId));
}

/**
 * May Ferni raise `topic` without the user bringing it up first?
 * Sensitivities count too: those are never raised proactively.
 */
export async function isTopicAllowedProactively(userId: string, topic: string): Promise<boolean> {
  if (!userId || userId === 'anonymous') return true; // no profile, no boundaries
  try {
    const b = await getProactiveBoundaries(userId);
    return !topicMatchesBoundary(topic, [...b.avoidTopics, ...b.sensitivities]);
  } catch (error) {
    log.warn(
      { userId, error: String(error) },
      'Boundary check failed; holding back proactive topic'
    );
    return false;
  }
}

function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i.exec(hhmm.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  const ampm = m[3]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Parse "21:00-08:00" / "9pm-8am" into minute bounds; null if unparseable. */
export function parseWindow(raw: string): { start: number; end: number } | null {
  const parts = raw.split(/\s*(?:-|–|to)\s*/i);
  if (parts.length !== 2) return null;
  const start = minutesOf(parts[0]);
  const end = minutesOf(parts[1]);
  return start === null || end === null ? null : { start, end };
}

function localMinutes(at: Date, timeZone?: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    });
    const [h, m] = fmt.format(at).split(':').map(Number);
    return (h % 24) * 60 + m;
  } catch {
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  }
}

/** Pure: is `at` inside any do-not-contact window? */
export function isInQuietWindow(windows: readonly string[], at: Date, timeZone?: string): boolean {
  const now = localMinutes(at, timeZone);
  return windows.some((raw) => {
    const w = parseWindow(raw);
    if (!w) return false;
    return w.start <= w.end ? now >= w.start && now < w.end : now >= w.start || now < w.end;
  });
}

/**
 * May Ferni reach out (push, SMS, email, call) at `at`? Uses the user's saved
 * timezone preference unless one is passed. Fails open on read errors: the
 * channel's own quiet-hours logic still applies.
 */
export async function isContactAllowedAt(
  userId: string,
  at: Date,
  timeZone?: string
): Promise<boolean> {
  try {
    const prefs = await listPreferences(userId);
    const zone =
      timeZone ?? prefs.find((p) => p.domain === 'practical' && p.key === 'timezone')?.value;
    return !isInQuietWindow(boundariesFrom(prefs).doNotContact, at, zone);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Do-not-contact check failed');
    return true;
  }
}
