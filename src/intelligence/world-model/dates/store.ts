/**
 * Dates that matter live in the temporal world store
 * (bogle_users/{uid}/world_facts, temporal/store.ts) as open "event" facts
 * with a few fields of their own: kind, recurrence (yearly or once), MM-DD
 * for yearly ones, the caller's words for when, and whether to confirm it.
 * One store means one erasure path (eraseUserRecord deletes the user doc
 * recursively). Nothing reads these dates during a call yet.
 *
 * The same date heard again is refreshed, and keeps its time of day only when the
 * newer words say that time again (timeHeardAgain); a yearly date (a birthday) or a
 * correction replaces the one on file for that person and kind; a one-time
 * date heard with a new day while the old day is still ahead is a reschedule
 * and replaces it too. An old one-time date that has passed stays, since the
 * next dentist visit is a new one.
 *
 * @module intelligence/world-model/dates/store
 */
import { forgetTokens } from '../../../memory/index.js';
import type { ResolutionPlan } from '../temporal/resolve.js';
import { createFirestoreWorldFactStore, type WorldFactStore } from '../temporal/store.js';
import { subjectKeyOf, type TemporalFact } from '../temporal/types.js';
import type { DateObservation, TimeDoubt } from './extract.js';

/** A stored fact, with the date fields when dates-that-matter wrote it. */
export type DateFact = TemporalFact & Partial<Omit<DateObservation, keyof TemporalFact>>;

let counter = 0;
const newDateId = (): string => `wd_${Date.now().toString(36)}_${(counter += 1).toString(36)}`;

/**
 * The same thing on someone's calendar: same kind for yearly dates, overlapping words otherwise.
 * A one-time date is never a yearly one, either way round: mom's birthday party and her
 * birthday are two dates. A fact without a recurrence (the world extractor's) matches only
 * the same words: its "birthday" is replaced by the yearly one, its "birthday party" isn't.
 */
function sameThing(
  f: DateFact,
  o: Pick<DateObservation, 'subject' | 'subjectKind' | 'recurrence' | 'kind' | 'value'>
): boolean {
  if (f.attribute !== 'event' || f.subjectKey !== subjectKeyOf(o) || f.by === 'ferni') return false;
  if (f.recurrence !== undefined && f.recurrence !== o.recurrence) return false;
  if (o.recurrence === 'yearly' && f.recurrence === 'yearly' && f.kind === o.kind) return true;
  const a = forgetTokens(f.value);
  const b = forgetTokens(o.value);
  if (a.length === 0 || b.length === 0) return false;
  if (f.recurrence === undefined) return a.length === b.length && a.every((w) => b.includes(w));
  return a.every((w) => b.includes(w)) || b.every((w) => a.includes(w));
}

/** sameThing, and not only in part: the same words ("appointment" is only part of "dentist appointment"). */
function sameWords(f: DateFact, o: DateObservation): boolean {
  if (o.recurrence === 'yearly' && f.recurrence === 'yearly' && f.kind === o.kind) return true;
  const a = new Set(forgetTokens(f.value));
  const b = new Set(forgetTokens(o.value));
  return a.size === b.size && [...a].every((w) => b.has(w));
}

/**
 * The time of day a date heard again should have, as a bookend is built on it (#2527).
 * Fail-safe: a stored time survives only when the newest mention says the same time,
 * plainly. A new plain time replaces it ("friday at 4pm"); anything else drops it: no
 * time ("friday", "sometime friday"), a doubtful one (unsure, a midnight, the model's
 * own day), or a correction without one. Fewer timed reminders, never a stale one.
 * Undefined: unchanged.
 */
function timeHeardAgain(f: DateFact, o: DateObservation): string | null | undefined {
  if (o.at !== undefined && !o.needsConfirmation) return o.at === f.at ? undefined : o.at;
  return f.at === undefined ? undefined : null;
}

/**
 * Sets a live fact's time (null drops it). One made this call is ours to change in place;
 * one on file changes by its refresh, the last one if the call already has one, so a
 * later refresh can't put back the time.
 */
function retime(plan: ResolutionPlan, f: DateFact, at: string | null): void {
  if (at === null) delete f.at;
  else f.at = at;
  if (plan.create.includes(f)) return;
  const heard = plan.refresh.filter((r) => r.id === f.id).at(-1);
  if (heard) heard.at = at;
  else plan.refresh.push({ id: f.id, observedAt: f.observedAt, confidence: f.confidence, at });
}

/** True when a dropped mention (TimeDoubt) names this fact: same thing, and its day or any day. */
function doubted(f: DateFact, d: TimeDoubt): boolean {
  const day = (x: string): string => (d.recurrence === 'yearly' ? x.slice(5) : x);
  const onFile = d.recurrence === 'yearly' ? f.monthDay : f.eventDate;
  return (d.anyDay || d.days.some((x) => day(x) === onFile)) && sameThing(f, d);
}

/**
 * A date heard again on its day: the first match is refreshed, as before #2527. A time is
 * written only onto the one fact these words are; when two are on the day ("appointment",
 * with the doctor's and the dentist's) or the words are only a part of its words, every
 * one loses its time instead.
 */
function heardAgain(plan: ResolutionPlan, onDay: readonly DateFact[], o: DateObservation): void {
  const [heard] = onDay;
  const confidence = Math.max(heard.confidence, o.confidence);
  plan.refresh.push({ id: heard.id, observedAt: o.observedAt, confidence });
  const sole = onDay.length === 1 && sameWords(heard, o);
  for (const f of onDay) {
    const at = sole ? timeHeardAgain(f, o) : f.at === undefined ? undefined : null;
    if (at !== undefined) retime(plan, f, at);
  }
}

/**
 * What a call's dates do to the facts on file (pure). callDay is the call's day
 * in the caller's timezone; without it, the UTC day it was observed.
 */
export function planDates(
  open: readonly DateFact[],
  observations: readonly DateObservation[],
  newId: () => string = newDateId,
  callDay?: string,
  doubts: readonly TimeDoubt[] = []
): ResolutionPlan {
  const plan: ResolutionPlan = { create: [], close: [], refresh: [] };
  // Copies: a time changed here is seen by a later mention in the same call, and the caller's facts stay as they were.
  const live = open.filter((f) => f.validTo === null).map((f) => ({ ...f }));
  for (const o of observations) {
    const same = live.filter((f) => sameThing(f, o));
    const onDay = same.filter((f) =>
      o.recurrence === 'yearly' ? f.monthDay === o.monthDay : f.eventDate === o.eventDate
    );
    if (onDay.length > 0) {
      heardAgain(plan, onDay, o);
      continue;
    }
    const today = callDay ?? o.observedAt.slice(0, 10);
    const replaced = same.filter(
      (f) =>
        o.recurrence === 'yearly' ||
        o.replaces !== undefined ||
        (f.eventDate !== undefined && f.eventDate >= today)
    );
    const fact: DateFact = {
      ...o,
      id: newId(),
      subjectKey: subjectKeyOf(o),
      validFrom: o.observedAt,
      validTo: null,
      ...(replaced.length ? { supersedes: replaced.map((f) => f.id) } : {}),
    };
    for (const f of replaced) {
      plan.close.push({ id: f.id, validTo: o.observedAt, supersededBy: fact.id });
      live.splice(live.indexOf(f), 1);
    }
    plan.create.push(fact);
    live.push(fact);
  }
  for (const d of doubts) for (const f of live) if (f.at !== undefined && doubted(f, d)) retime(plan, f, null); // prettier-ignore
  return plan;
}

/** Stores a call's dates. Throws only if the store does. */
export async function recordDates(
  userId: string,
  observations: readonly DateObservation[],
  store: WorldFactStore = createFirestoreWorldFactStore(),
  callDay?: string,
  doubts: readonly TimeDoubt[] = []
): Promise<{ created: number; closed: number; refreshed: number }> {
  if (observations.length + doubts.length === 0) return { created: 0, closed: 0, refreshed: 0 };
  const plan = planDates(await store.listOpen(userId), observations, newDateId, callDay, doubts);
  await store.apply(userId, plan);
  return { created: plan.create.length, closed: plan.close.length, refreshed: plan.refresh.length };
}
