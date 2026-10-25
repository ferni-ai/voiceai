/**
 * The person model's "unfinished" section: open loops (follow_through, then
 * the threads of recent calls), dates in the next two weeks, and what Ferni
 * said he would do. Every text passes keep(): not forgotten, no contact data.
 *
 * @module intelligence/person-model/unfinished
 */
import { CALLER_PROVENANCE, undisputed } from '../../memory/index.js';
import type { FollowUpKind } from '../../services/follow-through/index.js';
import { daysBetween, nextOccurrence } from '../world-model/dates/timex.js';
import type { PersonModelInputs } from './build.js';
import type { Unfinished } from './types.js';
import { arr, DAY, ferniOpen, followUpKind, iso, keep, local, ms, str } from './util.js';

const MAX_ITEMS = 5;
const DATE_DAYS = 14;

export function buildUnfinished(i: PersonModelInputs, now: Date, forgotten: string[]): Unfinished {
  const t = now.getTime();
  const age = (at: number | null) => (at === null ? 0 : Math.max(0, Math.floor((t - at) / DAY)));
  const loops: Unfinished['openLoops'] = [];
  const add = (
    text: string | null,
    kind: FollowUpKind,
    at: number | null,
    dueAt: string | null
  ) => {
    if (text && !loops.some((l) => l.text.toLowerCase() === text.toLowerCase()))
      loops.push({ text, ageDays: age(at), kind, dueAt });
  };
  for (const f of i.followThrough) {
    const kind = followUpKind(f.kind);
    if (kind && (f.status === 'open' || f.status === 'surfaced'))
      add(keep(f.text, forgotten), kind, ms(f.createdAt), iso(ms(f.dueAt)));
  }
  for (const raw of i.summaries) {
    const s = undisputed(raw);
    if (s.callerProvenance !== CALLER_PROVENANCE) continue; // only items checked against their lines
    for (const item of [...arr(s.followUpItems), ...arr(s.questionsRemaining)])
      add(keep(item, forgotten), 'thread', ms(s.timestamp), null);
  }
  // Dated items first, soonest due; then threads, newest first.
  const due = (l: { dueAt: string | null }) => (l.dueAt ? Date.parse(l.dueAt) : Infinity);
  loops.sort((a, b) => (due(a) === due(b) ? a.ageDays - b.ageDays : due(a) < due(b) ? -1 : 1));

  const today = local(t, i.timezone).day;
  const upcomingDates = i.worldFacts.flatMap((f) => {
    // The caller's own open, confirmed events (as dates/recall.ts reads them).
    if (f.attribute !== 'event' || f.validTo || str(f.forgottenAt) || f.wrong) return [];
    if (f.by === 'ferni' || f.needsConfirmation) return [];
    const yearly = f.recurrence === 'yearly' && str(f.monthDay);
    const on = yearly ? nextOccurrence(str(f.monthDay), today) : str(f.eventDate);
    const days = /^\d{4}-\d\d-\d\d$/.test(on) ? daysBetween(today, on) : -1;
    const what = f.subjectKind === 'person' ? `${str(f.subject)}: ${str(f.value)}` : f.value;
    const text = keep(what, forgotten);
    return days >= 0 && days <= DATE_DAYS && text ? [{ text, on }] : [];
  });
  const ferniOwes = i.ferniCommitments.flatMap((c) => {
    const text = ferniOpen(c, t) ? keep(c.commitment, forgotten) : null;
    return text ? [{ text, since: iso(ms(c.madeAt)) ?? '' }] : [];
  });
  return {
    openLoops: loops.slice(0, MAX_ITEMS),
    upcomingDates: upcomingDates.sort((a, b) => a.on.localeCompare(b.on)).slice(0, MAX_ITEMS),
    ferniOwes: ferniOwes.slice(0, MAX_ITEMS),
  };
}
