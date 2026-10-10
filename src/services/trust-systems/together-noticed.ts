/**
 * "Things I've noticed": Ferni's short first-person note for a week or a month.
 *
 * Each observation is a pattern found in the user's own records and names the
 * records it came from (`evidence`). An observation whose pattern isn't clearly
 * there is left out - a quiet week gets a short note, not filler.
 *
 * The note carries kinds and numbers, not sentences: the web turns them into
 * words in the user's language.
 *
 * @module services/trust-systems/together-noticed
 */

import type { EmotionalSnapshot } from './sentiment-timeline.js';
import {
  DAY_MS,
  conversationDays,
  daysBetween,
  mean,
  within,
  type LocalClock,
  type TogetherSignals,
} from './together-signals.js';

export type NoticedPeriod = 'week' | 'month';

export type NoticedKind =
  | 'moodShift'
  | 'bounceBack'
  | 'liftTopic'
  | 'brightest'
  | 'timeOfDay'
  | 'favoriteDay'
  | 'cameUp'
  | 'promisesKept';

export interface NoticedInsight {
  kind: NoticedKind;
  /** Which sentence of the kind fits (e.g. 'lighter' / 'heavier', 'evening'). */
  variant: string;
  params: Record<string, string | number>;
  /** Ids of the snapshots, life events or promises the observation rests on. */
  evidence: string[];
}

export interface NoticedNote {
  period: NoticedPeriod;
  periodStart: string;
  periodEnd: string;
  daysTalked: number;
  insights: NoticedInsight[];
}

const PERIOD_DAYS: Record<NoticedPeriod, number> = { week: 7, month: 30 };
const MAX_INSIGHTS = 5;
interface Window {
  from: Date;
  to: Date;
}

function moodShift(
  s: readonly EmotionalSnapshot[],
  prev: readonly EmotionalSnapshot[]
): NoticedInsight | null {
  if (s.length < 3 || prev.length < 3) return null;
  const shift =
    (mean(s.map((x) => x.valence)) as number) - (mean(prev.map((x) => x.valence)) as number);
  if (Math.abs(shift) < 0.15) return null;
  return {
    kind: 'moodShift',
    variant: shift > 0 ? 'lighter' : 'heavier',
    params: {},
    evidence: [...s, ...prev].map((x) => x.id),
  };
}

function bounceBack(signals: TogetherSignals, w: Window, clock: LocalClock): NoticedInsight | null {
  const days = conversationDays(signals.snapshots, clock, w.from, w.to).map((d) => ({
    ...d,
    avg: mean(d.snapshots.map((x) => x.valence)) as number,
  }));
  const hard = days.filter((d) => d.avg <= -0.3).sort((a, b) => a.avg - b.avg)[0] as
    | (typeof days)[number]
    | undefined;
  if (hard === undefined) return null;
  const better = days.find((d) => d.key > hard.key && d.avg >= 0);
  if (better === undefined) return null;
  return {
    kind: 'bounceBack',
    variant: daysBetween(hard.key, better.key) === 1 ? 'nextDay' : 'later',
    params: { date: hard.key, days: daysBetween(hard.key, better.key) },
    evidence: [...hard.snapshots, ...better.snapshots].map((x) => x.id),
  };
}

function liftTopic(s: readonly EmotionalSnapshot[]): NoticedInsight | null {
  const overall = mean(s.map((x) => x.valence));
  if (overall === null) return null;
  const byTopic = new Map<string, EmotionalSnapshot[]>();
  for (const x of s) {
    const topic = x.context?.topic?.trim();
    if (topic) byTopic.set(topic.toLowerCase(), [...(byTopic.get(topic.toLowerCase()) ?? []), x]);
  }
  const best = [...byTopic.values()]
    .filter((list) => list.length >= 2)
    .map((list) => ({ list, avg: mean(list.map((x) => x.valence)) as number }))
    .filter((t) => t.avg > 0.2 && t.avg >= overall + 0.2)
    .sort((a, b) => b.avg - a.avg)[0] as { list: EmotionalSnapshot[]; avg: number } | undefined;
  if (best === undefined) return null;
  return {
    kind: 'liftTopic',
    variant: 'default',
    params: { topic: (best.list[0].context?.topic ?? '').trim() },
    evidence: best.list.map((x) => x.id),
  };
}

function brightest(s: readonly EmotionalSnapshot[], clock: LocalClock): NoticedInsight | null {
  if (s.length < 3) return null;
  const top = [...s].sort((a, b) => b.valence - a.valence)[0];
  if (top.valence < 0.5) return null;
  return {
    kind: 'brightest',
    variant: 'default',
    params: { date: clock.dayKey(top.timestamp) },
    evidence: [top.id],
  };
}

const BUCKETS = ['night', 'morning', 'afternoon', 'evening'] as const;
function bucket(hour: number): (typeof BUCKETS)[number] {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function timeOfDay(s: readonly EmotionalSnapshot[], clock: LocalClock): NoticedInsight | null {
  if (!clock.known) return null;
  // One vote per (day, part of day), so a long call doesn't outvote a habit.
  const votes = new Map<string, EmotionalSnapshot>();
  for (const x of s) {
    const k = `${clock.dayKey(x.timestamp)}|${bucket(clock.hour(x.timestamp))}`;
    if (!votes.has(k)) votes.set(k, x);
  }
  if (votes.size < 3) return null;
  const counts = BUCKETS.map((b) => ({
    b,
    ids: [...votes].filter(([k]) => k.endsWith(`|${b}`)).map(([, x]) => x.id),
  })).sort((a, b) => b.ids.length - a.ids.length);
  if (counts[0].ids.length <= counts[1].ids.length || counts[0].ids.length / votes.size < 0.5)
    return null;
  return { kind: 'timeOfDay', variant: counts[0].b, params: {}, evidence: counts[0].ids };
}

function favoriteDay(
  signals: TogetherSignals,
  w: Window,
  clock: LocalClock
): NoticedInsight | null {
  if (!clock.known) return null;
  const days = conversationDays(signals.snapshots, clock, w.from, w.to);
  if (days.length < 4) return null;
  const byWeekday = new Map<number, string[]>();
  for (const d of days) {
    const wd = clock.weekday(d.snapshots[0].timestamp);
    byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), d.snapshots[0].id]);
  }
  const ranked = [...byWeekday.entries()].sort((a, b) => b[1].length - a[1].length);
  if (ranked[0][1].length < 2 || ranked[0][1].length === ranked[1]?.[1].length) return null;
  return {
    kind: 'favoriteDay',
    variant: 'default',
    params: { weekday: ranked[0][0] },
    evidence: ranked[0][1],
  };
}

function cameUp(signals: TogetherSignals, w: Window): NoticedInsight | null {
  const events = signals.lifeEvents
    .filter(
      (e) => e.context?.mentionedAt !== undefined && within(e.context.mentionedAt, w.from, w.to)
    )
    .sort((a, b) => b.context.mentionedAt.getTime() - a.context.mentionedAt.getTime());
  if (events.length === 0) return null;
  return {
    kind: 'cameUp',
    variant: events.length === 1 ? 'one' : 'other',
    params: { n: events.length, example: events[0].description },
    evidence: events.map((e) => e.id),
  };
}

function promisesKept(signals: TogetherSignals, w: Window): NoticedInsight | null {
  const resolved = signals.promises.filter(
    (p) => p.resolvedAt && within(p.resolvedAt, w.from, w.to)
  );
  if (resolved.length === 0) return null;
  const kept = resolved.filter((p) => p.fulfilled && !p.violated).length;
  return {
    kind: 'promisesKept',
    variant: kept === resolved.length ? 'all' : 'some',
    params: { kept, total: resolved.length },
    evidence: resolved.map((p) => p.id),
  };
}

/** Ferni's note for the `period` ending at `now`. */
export function computeNoticedNote(
  signals: TogetherSignals,
  period: NoticedPeriod,
  now: Date,
  clock: LocalClock
): NoticedNote {
  const span = PERIOD_DAYS[period] * DAY_MS;
  const w: Window = { from: new Date(now.getTime() - span), to: now };
  const prev: Window = {
    from: new Date(now.getTime() - 2 * span),
    to: new Date(w.from.getTime() - 1),
  };
  const inW = signals.snapshots.filter((x) => within(x.timestamp, w.from, w.to));
  const inPrev = signals.snapshots.filter((x) => within(x.timestamp, prev.from, prev.to));

  const insights = [
    moodShift(inW, inPrev),
    bounceBack(signals, w, clock),
    liftTopic(inW),
    brightest(inW, clock),
    timeOfDay(inW, clock),
    period === 'month' ? favoriteDay(signals, w, clock) : null,
    cameUp(signals, w),
    promisesKept(signals, w),
  ].filter((i): i is NoticedInsight => i !== null);

  return {
    period,
    periodStart: w.from.toISOString(),
    periodEnd: now.toISOString(),
    daysTalked: conversationDays(signals.snapshots, clock, w.from, w.to).length,
    insights: insights.slice(0, MAX_INSIGHTS),
  };
}
