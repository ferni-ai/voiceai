/**
 * The person model: one document per caller, built nightly from the stores
 * the live pipeline already fills, read once at call start.
 *
 * It folds the live member of each split store group (people in 8 places, open
 * items in 10) into seven sections, each with its sources and build time, so a
 * reader can drop one stale section without dropping the doc. Design sec. 3
 * (person-model-design-2026-10-18). Nothing reads or writes it yet.
 *
 * @module intelligence/person-model/types
 */
import type { FollowUpKind } from '../../services/follow-through/index.js';

export const PERSON_MODEL_VERSION = 1;

export interface Provenance {
  /** ISO time the section was built; null marks it dirty (derive live instead). */
  builtAt: string | null;
  /** The stores read, e.g. "summaries", "dynamic_facts". */
  sources: string[];
  method: 'code' | 'llm';
  /** Documents that went into the section. */
  inputDocs: number;
}

export interface Section<T> {
  value: T;
  prov: Provenance;
}

export interface Rhythms {
  callsLast30d: number;
  medianGapDays: number | null;
  /** Hours in the caller's own zone; `dow` 0 = Sunday. */
  usualHours: Array<{ dow: number | 'any'; startHour: number; endHour: number; share: number }>;
  /** Their usual windows outside quiet hours: when reaching out is likely welcome. */
  reachWindows: Array<{ startHour: number; endHour: number; confidence: number }>;
  medianMinutes: number | null;
  lastCallAt: string | null;
  timezone: string | null;
}

export interface FollowThroughStats {
  /** Last 60 days. Empty when fewer than 3 items: too few to say anything. */
  byKind: Partial<Record<FollowUpKind, { opened: number; done: number; slipped: number }>>;
  /** Kinds that slip more than they get done. Never the caller's words. */
  slips: string[];
  ferniPromisesOpen: number;
  ferniPromisesMissed30d: number;
}

/** Freshness from the newest waypoint or the doc's updateTime: emotional_arcs.lastUpdated goes stale. */
export interface MoodTrajectory {
  points: Array<{ day: string; valence: number; energy: number | null }>;
  trend: 'up' | 'down' | 'steady' | 'unknown';
  vsBaseline: number | null;
  /** LLM, at most 120 characters, never a diagnosis. */
  note: string | null;
}

export interface Person {
  name: string;
  /** Only a relation the caller stated clearly (memory/recall/people.ts); never guessed. */
  relation: string | null;
  mentions90d: number;
  lastMentioned: string | null;
  /** LLM; 'unknown' until that pass runs. */
  sentiment: 'warm' | 'mixed' | 'strained' | 'unknown';
  /** LLM; null until that pass runs. */
  openThread: string | null;
  /** Grief, health, money, break-ups: only ever "let them lead". */
  sensitive: boolean;
}

export interface Unfinished {
  openLoops: Array<{ text: string; ageDays: number; kind: FollowUpKind; dueAt: string | null }>;
  /** The next 14 days. */
  upcomingDates: Array<{ text: string; on: string }>;
  /** What Ferni said he would do and hasn't yet. */
  ferniOwes: Array<{ text: string; since: string }>;
}

export interface Topics {
  /** In at least 3 of the last 10 calls. */
  recurring: Array<{ label: string; calls: number }>;
  /** First seen in the last 2 calls. */
  new: string[];
  /** Recurring before, absent from the last 5 calls. */
  fading: string[];
}

export interface PersonModel {
  v: typeof PERSON_MODEL_VERSION;
  userId: string;
  builtAt: string;
  /** Newest summaries/{id} folded in: the idempotency key for the nightly write. */
  throughSessionId: string | null;
  /** The forget counter at build; behind the live one means re-filter or rebuild. */
  forgetGeneration: number;
  /** The prompt block (render.ts), at most 3,000 characters; empty until rendered. */
  rendered: string;
  rhythms: Section<Rhythms>;
  followThrough: Section<FollowThroughStats>;
  mood: Section<MoodTrajectory>;
  people: Section<Person[]>;
  unfinished: Section<Unfinished>;
  topics: Section<Topics>;
  changed: Section<string[]>;
}

const HOUR_MS = 60 * 60 * 1000;
/** Fresh for 36 hours, or for a week when they haven't called since. */
export const FRESH_HOURS = 36;
export const QUIET_FRESH_HOURS = 7 * 24;

/**
 * Whether a section can be used as built (design sec. 5): `dirty` and `stale`
 * sections are derived live by the old builders instead.
 */
export function freshness(
  prov: Provenance,
  now: Date,
  lastCallAt: string | null = null
): 'fresh' | 'stale' | 'dirty' {
  if (prov.builtAt === null) return 'dirty';
  const built = Date.parse(prov.builtAt);
  if (!Number.isFinite(built)) return 'dirty';
  const ageH = (now.getTime() - built) / HOUR_MS;
  if (ageH < FRESH_HOURS) return 'fresh';
  const calledSince = lastCallAt !== null && Date.parse(lastCallAt) > built;
  return ageH < QUIET_FRESH_HOURS && !calledSince ? 'fresh' : 'stale';
}
