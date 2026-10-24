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
 * A dropped mention (TimeDoubt) that names a timed date and its day takes the time off
 * it, as a mention without a time would: "sometime friday" after "friday at 3pm".
 */
function dropDoubtedTimes(
  plan: ResolutionPlan,
  live: readonly DateFact[],
  doubts: readonly TimeDoubt[]
): void {
  for (const d of doubts)
    for (const f of live) {
      const day = (x: string): string => (d.recurrence === 'yearly' ? x.slice(5) : x);
      const onFile = d.recurrence === 'yearly' ? f.monthDay : f.eventDate;
      if (f.at === undefined || !d.days.some((x) => day(x) === onFile) || !sameThing(f, d))
        continue;
      // Made this call: it is ours to change. On file: a refresh drops it.
      if (plan.create.includes(f)) delete f.at;
      else {
        const heard = plan.refresh.find((r) => r.id === f.id);
        if (heard) heard.at = null;
        else plan.refresh.push({ id: f.id, observedAt: f.observedAt, confidence: f.confidence, at: null }); // prettier-ignore
      }
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
  const live = open.filter((f) => f.validTo === null);
  for (const o of observations) {
    const same = live.filter((f) => sameThing(f, o));
    const heard = same.find((f) =>
      o.recurrence === 'yearly' ? f.monthDay === o.monthDay : f.eventDate === o.eventDate
    );
    if (heard) {
      const confidence = Math.max(heard.confidence, o.confidence);
      const at = timeHeardAgain(heard, o);
      plan.refresh.push({ id: heard.id, observedAt: o.observedAt, confidence, ...(at === undefined ? {} : { at }) }); // prettier-ignore
      // A later mention in the same call compares with this one's time.
      if (at !== undefined) live[live.indexOf(heard)] = { ...heard, at: at ?? undefined };
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
  dropDoubtedTimes(plan, live, doubts);
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
