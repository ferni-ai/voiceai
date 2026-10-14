/**
 * Dates that matter live in the temporal world store
 * (bogle_users/{uid}/world_facts, temporal/store.ts) as open "event" facts
 * with a few fields of their own: kind, recurrence (yearly or once), MM-DD
 * for yearly ones, the caller's words for when, and whether to confirm it.
 * One store means one erasure path (eraseUserRecord deletes the user doc
 * recursively) and one reader for a call (temporal/in-call.ts) besides
 * upcoming.ts.
 *
 * The same date heard again is refreshed; a yearly date (a birthday) or a
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
import type { DateObservation } from './extract.js';

/** A stored fact, with the date fields when dates-that-matter wrote it. */
export type DateFact = TemporalFact & Partial<Omit<DateObservation, keyof TemporalFact>>;

let counter = 0;
const newDateId = (): string => `wd_${Date.now().toString(36)}_${(counter += 1).toString(36)}`;

/** The same thing on someone's calendar: same kind for yearly dates, overlapping words otherwise. */
function sameThing(f: DateFact, o: DateObservation): boolean {
  if (f.attribute !== 'event' || f.subjectKey !== subjectKeyOf(o) || f.by === 'ferni') return false;
  if (o.recurrence === 'yearly' && f.kind === o.kind) return true;
  const a = forgetTokens(f.value);
  const b = forgetTokens(o.value);
  if (a.length === 0 || b.length === 0) return false;
  return a.every((w) => b.includes(w)) || b.every((w) => a.includes(w));
}

/** What a call's dates do to the facts on file (pure). */
export function planDates(
  open: readonly DateFact[],
  observations: readonly DateObservation[],
  newId: () => string = newDateId
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
      plan.refresh.push({ id: heard.id, observedAt: o.observedAt, confidence });
      continue;
    }
    const callDay = o.observedAt.slice(0, 10);
    const replaced = same.filter(
      (f) =>
        o.recurrence === 'yearly' ||
        o.replaces !== undefined ||
        (f.eventDate !== undefined && f.eventDate >= callDay)
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
  return plan;
}

/** Stores a call's dates. Throws only if the store does. */
export async function recordDates(
  userId: string,
  observations: readonly DateObservation[],
  store: WorldFactStore = createFirestoreWorldFactStore()
): Promise<{ created: number; closed: number; refreshed: number }> {
  if (observations.length === 0) return { created: 0, closed: 0, refreshed: 0 };
  const plan = planDates(await store.listOpen(userId), observations);
  await store.apply(userId, plan);
  return { created: plan.create.length, closed: plan.close.length, refreshed: plan.refresh.length };
}
