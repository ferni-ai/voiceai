/**
 * Temporal facts about the caller's world. A friend's picture moves: "Mindy's
 * knee surgery is Tuesday" becomes "she's recovering", and "I quit that job"
 * ends the old job instead of sitting next to it. Each fact has a valid-time
 * window (validFrom → validTo, null while current), when it was heard, how
 * sure the extractor was, and where it came from.
 * Firestore: bogle_users/{uid}/world_facts/{id}, one doc per TemporalFact.
 *
 * @module intelligence/world-model/temporal/types
 */

/** True when WORLD_MODEL_TEMPORAL=on. Off by default. */
export function isWorldModelTemporalOn(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.WORLD_MODEL_TEMPORAL === 'on';
}

export type SubjectKind = 'person' | 'self' | 'goal' | 'situation';

/** One claim about one subject, as an after-call writer extracted it. */
export interface WorldObservation {
  /** Display name ("Mindy"); "self" for the caller. */
  subject: string;
  subjectKind: SubjectKind;
  /** People only: how they relate to the caller ("sister"). */
  relation?: string;
  /** The slot this claim fills: status, job, event, goal, ... */
  attribute: string;
  /** Short phrase: "knee surgery", "recovering from knee surgery". */
  value: string;
  /** YYYY-MM-DD, resolved against the call's date in the caller's timezone. */
  eventDate?: string;
  /** YYYY-MM-DD the claim started being true, when they said ("she had it Tuesday"). */
  since?: string;
  /** ISO time the caller said it. */
  observedAt: string;
  /** 0..1 */
  confidence: number;
  source: { kind: 'summary' | 'turn'; sessionId: string; quote?: string };
}

export interface TemporalFact extends WorldObservation {
  id: string;
  /** Normalised subject: "person:mindy", "self". */
  subjectKey: string;
  /** Normalised attribute. */
  attribute: string;
  /** ISO time it became true. */
  validFrom: string;
  /** ISO time it stopped being true; null while current. */
  validTo: string | null;
  /** The fact that replaced this one. */
  supersededBy?: string;
  /** Facts this one replaced. */
  supersedes?: string[];
  /** The value it replaced in the same slot ("works at Acme"). */
  replaced?: string;
}

/**
 * One value at a time: a new value replaces the old, no judgment needed. Other
 * attributes (event, goal, commitment, thread) hold several; updating one of
 * those takes an LLM judgment after the call.
 */
export const REPLACEABLE_ATTRIBUTES: ReadonlySet<string> = new Set(
  'status job location relationship health school role'.split(' ')
);

export function normaliseText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function subjectKeyOf(obs: Pick<WorldObservation, 'subject' | 'subjectKind'>): string {
  const name = normaliseText(obs.subject);
  if (obs.subjectKind === 'self' || name === 'self') return 'self';
  return `${obs.subjectKind}:${name}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(value));
}

/** A YYYY-MM-DD as noon UTC: the same calendar day from UTC-11 to UTC+11. */
export function dayToIso(day: string): string {
  return `${day}T12:00:00.000Z`;
}
