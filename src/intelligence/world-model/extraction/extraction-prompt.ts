/**
 * The prompt that turns one call's transcript into world observations.
 *
 * The model is told the call's date, weekday and timezone because people say
 * "Thursday" and "next month": without them every scheduled thing was dropped
 * (the end-of-call signal extractor saved 0 dates from a call naming Monday,
 * Thursday and next month, 2026-10-10).
 *
 * @module intelligence/world-model/extraction/extraction-prompt
 */
import type { WorldObservation } from '../temporal/types.js';

/** Attributes the store accepts; replaceable ones replace an earlier fact about the subject. */
export const WORLD_ATTRIBUTES = [
  'status',
  'job',
  'location',
  'relationship',
  'health',
  'school',
  'role',
  'event',
  'goal',
  'commitment',
  'thread',
] as const satisfies ReadonlyArray<WorldObservation['attribute']>;

export const SUBJECT_KINDS = [
  'person',
  'self',
  'goal',
  'situation',
] as const satisfies ReadonlyArray<WorldObservation['subjectKind']>;

export interface CallMoment {
  /** YYYY-MM-DD in the caller's timezone. */
  date: string;
  /** "Saturday" */
  weekday: string;
  /** IANA name, e.g. America/New_York. */
  timezone: string;
}

/** The call's local date and weekday in the caller's timezone. */
export function callMomentFor(startedAt: Date, timezone: string): CallMoment {
  let tz = timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(startedAt);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
    timezone: tz,
  };
}

export function buildExtractionPrompt(transcript: string, moment: CallMoment): string {
  return `You read a phone call between a person (CALLER) and their friend Ferni (FERNI, an AI). Write down what the CALLER said about their own life and the people in it, so a good friend could follow up next time.

The call happened on ${moment.weekday} ${moment.date} (${moment.timezone}). Resolve every relative date against that day: "Tuesday" means the next Tuesday after ${moment.date} unless the caller clearly means a past one, "tomorrow" is the day after, "next month" with no day is not a date. If you cannot resolve a date to a single day, leave eventDate out: a wrong date is worse than none.

Return JSON only: {"observations": [ ... ]}. Each observation:
- subject: the person's name as said ("Mindy"), "self" for the caller, or a short label for a goal or situation
- subjectKind: "person" | "self" | "goal" | "situation"
- relation: for people, how they relate to the caller ("sister", "coworker"); omit if unknown
- attribute: one of ${WORLD_ATTRIBUTES.join(', ')}
  - event: something scheduled or that happened on a day (give eventDate when you can)
  - status/health/job/location/relationship/school/role: the current state, which replaces any earlier one
  - goal: something the caller wants; commitment: something someone promised; thread: an unfinished topic worth asking about
- value: a short phrase in plain words ("knee surgery", "recovering well", "interview at Stripe")
- eventDate: YYYY-MM-DD for events; since: YYYY-MM-DD if the caller said when a status began
- confidence: 0..1, how sure you are the caller meant this
- quote: the caller's own words it came from, at most 20 words
- replaces: when something CHANGED ("moved to Denver", "quit Acme", "broke up with Sam"), add {"attribute": the attribute that changed, "priorValue": the old value if said}, e.g. "I quit Acme" -> {"subject":"self","subjectKind":"self","attribute":"job","value":"quit Acme","replaces":{"attribute":"job","priorValue":"Acme"}}

Rules:
- Only what the CALLER said or clearly confirmed. Never what Ferni said about itself, its own life or its guesses.
- Ferni is never a subject. Do not use pronouns or filler as names ("they", "that", "my friend" with no name is subject "friend" only if it matters).
- Pair a scheduled event with its outcome when both are said: an "event" for the surgery on its date and a "health" or "status" for "recovering".
- Skip small talk, the weather, and anything the caller asked Ferni not to bring up (put that as attribute "thread" with value starting "avoid:").
- Return {"observations": []} if nothing about the caller's life came up.

TRANSCRIPT:
${transcript}`;
}
