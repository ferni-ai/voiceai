/**
 * MORNING_BRIEF_WRITER: the facts Alex writes from, read from the same fresh, screened day the
 * template uses, with the template's own labels (cleanItem) and times in their zone. Order:
 * today's calendar, due today, overdue, still open; an item listed twice is listed once.
 *
 * @module services/outreach/morning-brief/brief-facts
 */

import { wallTimeIn } from '../../../utils/time-zone.js';
import type { DayItems } from './brief-job.js';
import { cleanItem, clock } from './compose.js';
import type { BriefRef } from './freshness.js';

type FactKind = 'event' | 'reminder' | 'task' | 'commitment';
/** 0 today's calendar, 1 due today, 2 overdue, 3 still open. */
type FactRank = 0 | 1 | 2 | 3;

export interface BriefFact {
  readonly kind: FactKind;
  readonly label: string;
  /** A clock time in their zone ("10am"), when the item has one. */
  readonly at?: string;
  readonly rank: FactRank;
  readonly ref?: BriefRef;
}

const dayNumber = (at: Date, zone: string): number => {
  const w = wallTimeIn(at, zone);
  return w.year * 10_000 + w.month * 100 + w.day;
};

/** The day's facts, most important first; empty labels and repeats dropped. */
export function factsOf(day: DayItems, zone: string, now: Date): BriefFact[] {
  const today = dayNumber(now, zone);
  const rankOf = (due: Date | undefined): FactRank => {
    if (!due || Number.isNaN(due.getTime())) return 3;
    const d = dayNumber(due, zone);
    return d === today ? 1 : d < today ? 2 : 3;
  };
  const byTime = [...day.events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const events = byTime.map((e): BriefFact => {
    const at = e.allDay ? undefined : clock(e.start, zone);
    return { kind: 'event', label: e.invite ? 'an invite' : cleanItem(e.title), at, rank: 0 };
  });
  const items = (['reminders', 'tasks', 'commitments'] as const).flatMap((list) =>
    day[list].map((text, i): BriefFact => {
      const ref = day.refs?.[list][i];
      const due = ref?.dueAt ? new Date(ref.dueAt) : undefined;
      const kind = list === 'reminders' ? 'reminder' : list === 'tasks' ? 'task' : 'commitment';
      const at = kind === 'reminder' && due ? clock(due, zone) : undefined;
      return { kind, label: cleanItem(text), at, rank: kind === 'reminder' ? 1 : rankOf(due), ref };
    })
  );
  const seen = new Set<string>();
  return [...events, ...items]
    .filter((f) => {
      const key = f.label.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.rank - b.rank);
}
