/**
 * Dates that matter, from one call: who, what, and when, as the caller said
 * it. "my mom's birthday is the 14th", "Mindy's surgery is next Thursday",
 * "our anniversary was in June, the 3rd".
 *
 * The model finds the mention and copies the caller's own words for when
 * ("the 14th"); timex.ts turns those words into a day against the call's
 * date in the caller's timezone. The model's own date is kept only as a
 * fallback when the words don't parse, and is then marked to confirm. A
 * birthday, anniversary or memorial recurs yearly; a surgery or an
 * interview happens once. A later "actually it's the 15th" replaces the
 * earlier date in the same call and, stored, the one on file.
 *
 * @module intelligence/world-model/dates/extract
 */
import { flagOn } from '../../../config/env-flag.js';
import { isDay, type WorldObservation } from '../temporal/types.js';
import type { CallMoment } from '../extraction/extraction-prompt.js';
import { daysBetween, nextOccurrence, resolveWhen } from './timex.js';

/** True when DATES_THAT_MATTER=on. Off by default. */
export function datesThatMatterOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('DATES_THAT_MATTER', env);
}

export const DATE_KINDS = [
  'birthday',
  'anniversary',
  'memorial',
  'medical',
  'event',
  'deadline',
] as const;
export type DateKind = (typeof DATE_KINDS)[number];
const YEARLY_KINDS: ReadonlySet<DateKind> = new Set(['birthday', 'anniversary', 'memorial']);

/** "birthday" or "her birthday" is the kind itself; "birthday party" is something on it. */
function isJustTheKind(what: string, kind: DateKind): boolean {
  const words = what.toLowerCase().match(/[a-z']+/g) ?? [];
  const rest = words.filter((w) => !/^(?:my|her|his|their|our|the|a|an)$|'s$/.test(w));
  return rest.length === 1 && rest[0] === kind;
}

/** One mention, as the model reported it. */
export interface DateMention {
  /** "self" for the caller; otherwise a name ("Mindy") or the relation ("mom"). */
  who: string;
  relation?: string;
  /** "birthday", "knee surgery", "job interview at Stripe". */
  what: string;
  kind: DateKind;
  /** The caller's words for when: "the 14th", "next Thursday". */
  when: string;
  recurring: boolean;
  /** It already happened ("was Tuesday"). */
  past: boolean;
  /** The caller corrected an earlier date ("actually it's the 15th"). */
  correction: boolean;
  /** The caller wasn't sure ("I think it's the 14th"). */
  unsure: boolean;
  confidence: number;
  quote?: string;
  /** The model's own YYYY-MM-DD, used only when `when` doesn't parse. */
  guess?: string;
}

/** A WorldObservation (attribute "event") carrying the date's own fields. */
export interface DateObservation extends WorldObservation {
  origin: 'dates';
  kind: DateKind;
  recurrence: 'yearly' | 'once';
  /** MM-DD, for yearly dates. */
  monthDay?: string;
  /** The caller's words for when. */
  when: string;
  /** HH:MM in the caller's zone, when the words named a time ("biopsy at 3"). */
  at?: string;
  /** Ambiguous, unsure or resolved by the model: ask before relying on it. */
  needsConfirmation: boolean;
}

export function buildDatesPrompt(transcript: string, moment: CallMoment): string {
  return `A phone call between a person (CALLER) and their friend Ferni (FERNI, an AI) happened on ${moment.weekday} ${moment.date}. List every date that matters in the CALLER's life that came up: birthdays, anniversaries, the day someone died, surgeries and doctor visits, interviews, trips, weddings, deadlines, anything a good friend would remember to ask about.

Return JSON only: {"dates": [ ... ]}. Each item:
- who: "self" when it is the caller's own; otherwise the person's name as said ("Mindy"), or the relation if no name ("mom")
- relation: how they relate to the caller ("mother", "coworker"), if said
- what: a short plain phrase ("birthday", "knee surgery", "interview at Stripe")
- kind: one of ${DATE_KINDS.join(', ')}
- when: the CALLER's exact words for the day, copied, not computed ("the 14th", "next Thursday", "October 3rd", "tomorrow"); if they named the month anywhere in the call, include it ("December 19th", not "the 19th"); if they named a time, include it ("Tuesday at 3", "the 14th at 10am")
- guess: your own YYYY-MM-DD for that day
- recurring: true for a date that comes back every year (a birthday, an anniversary, the day someone died); false for a one-time thing (a birthday party this Saturday is one-time)
- past: true if it already happened
- correction: true if the caller corrected a date they gave earlier
- unsure: true if the caller hedged ("I think", "maybe the 14th")
- confidence: 0..1 that the caller meant this
- quote: the caller's own words, at most 20 words

Rules:
- Only days the CALLER said or clearly confirmed. Never Ferni's own life or guesses.
- A date with no single day ("next month", "in the spring", "sometime in June") is left out.
- Ordinary days are not dates that matter ("made it to Friday", "the weekend", "work tomorrow" as routine).
- When the caller corrects a date, list only the corrected one, with correction true.
- Return {"dates": []} if none came up.

TRANSCRIPT:
${transcript}`;
}

const str = (x: unknown, max: number): string | undefined =>
  typeof x === 'string' && x.trim() ? x.replace(/\s+/g, ' ').trim().slice(0, max) : undefined;

function toMention(raw: unknown): DateMention | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const who = str(r.who, 60);
  const what = str(r.what, 80);
  const when = str(r.when, 60);
  const kind = DATE_KINDS.find((k) => k === r.kind) ?? 'event';
  if (!who || !what || !when || /^(?:ferni|ai|assistant|they|he|she|it)$/i.test(who)) return null;
  const confidence =
    typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? r.confidence : 0.6;
  return {
    who: /^(?:self|me|i|caller|user)$/i.test(who) ? 'self' : who,
    ...(str(r.relation, 40) ? { relation: str(r.relation, 40) } : {}),
    what,
    kind,
    when,
    // Unsaid: only the bare kind recurs ("birthday" does, "birthday party" doesn't).
    recurring: r.recurring === undefined ? isJustTheKind(what, kind) : r.recurring !== false,
    past: r.past === true,
    correction: r.correction === true,
    unsure: r.unsure === true,
    confidence: Math.min(1, Math.max(0, confidence)),
    ...(str(r.quote, 200) ? { quote: str(r.quote, 200) } : {}),
    ...(str(r.guess, 10) ? { guess: str(r.guess, 10) } : {}),
  };
}

/** The mentions in a model reply; [] when it has no usable JSON. */
export function parseDateMentions(reply: string | null | undefined): DateMention[] {
  const json = reply?.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  try {
    const items = (JSON.parse(json) as { dates?: unknown }).dates;
    return Array.isArray(items)
      ? items.map(toMention).filter((m): m is DateMention => m !== null)
      : [];
  } catch {
    return [];
  }
}

const yearlyKind = (m: DateMention): boolean => YEARLY_KINDS.has(m.kind) && m.recurring;

/** A yearly date is one per person and kind; a one-time one (a birthday party) is its own thing. */
const key = (m: DateMention): string =>
  `${m.who.toLowerCase()}|${yearlyKind(m) ? `yearly:${m.kind}` : `once:${m.what.toLowerCase()}`}`;

/** The model's own day, if it is a real day within two years of the call. */
function plausibleGuess(guess: string | undefined, callDate: string): string | null {
  if (!isDay(guess)) return null;
  return Math.abs(daysBetween(callDate, guess)) <= 730 ? guess : null;
}

/**
 * Resolves each mention against the call's date; a later mention of the same
 * date (a correction) wins. Mentions whose day can't be found are dropped.
 */
export function toDateObservations(
  mentions: readonly DateMention[],
  call: { sessionId: string; observedAt: string; callDate: string }
): DateObservation[] {
  const last = new Map<string, DateMention>();
  for (const m of mentions) last.set(key(m), m);
  const out: DateObservation[] = [];
  for (const m of last.values()) {
    const resolved = resolveWhen(m.when, call.callDate, m.past);
    const guess = resolved ? null : plausibleGuess(m.guess, call.callDate);
    const day = resolved?.date ?? guess;
    if (!day) continue;
    const yearly = yearlyKind(m);
    // The model's own reading disagrees with the words (it may know a month said earlier): ask.
    const other = resolved ? plausibleGuess(m.guess, call.callDate) : null;
    const disagree = other !== null && (yearly ? other.slice(5) !== day.slice(5) : other !== day);
    const doubtful = Boolean(resolved?.ambiguous || guess || m.unsure || disagree);
    const confidence = Math.round(m.confidence * (doubtful ? 0.7 : 1) * 100) / 100;
    out.push({
      subject: m.who,
      subjectKind: m.who === 'self' ? 'self' : 'person',
      ...(m.relation && m.who !== 'self' ? { relation: m.relation } : {}),
      attribute: 'event',
      value: m.what,
      eventDate: yearly ? nextOccurrence(day.slice(5), call.callDate) : day,
      observedAt: call.observedAt,
      confidence,
      source: { kind: 'turn', sessionId: call.sessionId, ...(m.quote ? { quote: m.quote } : {}) },
      origin: 'dates',
      kind: m.kind,
      recurrence: yearly ? 'yearly' : 'once',
      ...(yearly ? { monthDay: day.slice(5) } : {}),
      when: m.when,
      ...(resolved?.at ? { at: resolved.at } : {}),
      needsConfirmation: doubtful || confidence < 0.7,
      ...(m.correction ? { replaces: { attribute: 'event', priorValue: m.what } } : {}),
    });
  }
  return out;
}
