/**
 * The person model's numeric sections: when they usually call (rhythms) and
 * how open items tend to end (followThrough). Pure and text-free: counts,
 * hours and kinds only, so nothing here can carry what they said.
 *
 * @module intelligence/person-model/stats
 */
import type { FollowUpKind } from '../../services/follow-through/index.js';
import type { PersonModelInputs } from './build.js';
import type { FollowThroughStats, Rhythms, Section } from './types.js';
import { DAY, ferniOpen, followUpKind, iso, local, ms, prov, type Doc } from './util.js';

type QuietWindow = NonNullable<PersonModelInputs['quiet']>;

/** Nothing goes out 21:00-08:00 in their zone (channel-policy.ts), whatever they set. */
const QUIET_FLOOR: QuietWindow = { startMin: 21 * 60, endMin: 8 * 60 };
/** Distinct call-hours needed before any "usual time" is claimed. */
const MIN_EVENTS = 5;
const HALF_LIFE_DAYS = 28;

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;

function inQuiet(hour: number, q: QuietWindow): boolean {
  const m = hour * 60;
  return q.startMin <= q.endMin ? m >= q.startMin && m < q.endMin : m >= q.startMin || m < q.endMin;
}

/** Best non-overlapping 2-hour windows of an hour histogram, by share of all weight. */
function windows(hist: number[], total: number, minShare: number, max: number) {
  const scored = hist.map((w, h) => ({ h, w: w + hist[(h + 1) % 24] }));
  const picked: Array<{ startHour: number; endHour: number; share: number }> = [];
  const taken = new Set<number>();
  for (const { h, w } of scored.sort((a, b) => b.w - a.w)) {
    const share = total > 0 ? w / total : 0;
    if (share < minShare || picked.length >= max) break;
    if (taken.has(h) || taken.has((h + 1) % 24)) continue;
    taken.add(h).add((h + 1) % 24);
    picked.push({ startHour: h, endHour: (h + 2) % 24, share: round(share) });
  }
  return picked;
}

export function buildRhythms(i: PersonModelInputs, now: Date): Section<Rhythms> {
  // summaries are saved at call end with duration in seconds: the call began duration earlier.
  const starts = i.summaries.flatMap((s) => {
    const t = ms(s.timestamp);
    return t === null ? [] : [t - (typeof s.duration === 'number' ? s.duration : 0) * 1000];
  });
  // One event per local day and hour, from calls and their per-turn snapshots, recent ones weighing more.
  const events = new Map<string, { hour: number; dow: number; w: number }>();
  for (const t of [...starts, ...i.temporalSnapshots.map((s) => ms(s.timestamp))]) {
    if (t === null) continue;
    const l = local(t, i.timezone);
    const w = 0.5 ** ((now.getTime() - t) / DAY / HALF_LIFE_DAYS);
    events.set(`${l.day}T${l.hour}`, { hour: l.hour, dow: l.dow, w });
  }
  const all = Array<number>(24).fill(0);
  const byDow = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const e of events.values()) {
    all[e.hour] += e.w;
    byDow[e.dow][e.hour] += e.w;
  }
  const total = all.reduce((a, b) => a + b, 0);
  const enough = events.size >= MIN_EVENTS;
  const any = enough ? windows(all, total, 0.15, 3) : [];
  const weekday = enough
    ? byDow.flatMap((h, dow) => windows(h, total, 0.25, 1).map((w) => ({ dow, ...w })))
    : [];
  const quiet = [QUIET_FLOOR, ...(i.quiet ? [i.quiet] : [])];
  const isQuiet = (h: number) => quiet.some((q) => inQuiet(h, q));
  const sorted = [...starts].sort((a, b) => a - b);
  const minutes = i.summaries.map((s) => Number(s.duration)).filter((d) => d > 0);
  return {
    value: {
      callsLast30d: starts.filter((t) => now.getTime() - t <= 30 * DAY).length,
      medianGapDays: median(sorted.slice(1).map((t, k) => round((t - sorted[k]) / DAY, 1))),
      usualHours: [
        ...any.map((w) => ({ dow: 'any' as const, ...w })),
        ...weekday.sort((a, b) => b.share - a.share).slice(0, 1),
      ],
      reachWindows: any
        .filter((w) => !isQuiet(w.startHour) && !isQuiet((w.startHour + 1) % 24))
        .slice(0, 2)
        .map(({ startHour, endHour, share }) => ({
          startHour,
          endHour,
          confidence: round(share * Math.min(1, events.size / 10)),
        })),
      medianMinutes: median(minutes.map((d) => round(d / 60, 1))),
      lastCallAt: iso(ms(i.summaries[0]?.timestamp)),
      timezone: i.timezone,
    },
    prov: prov(
      now,
      [
        i.summaries.length && 'summaries',
        i.temporalSnapshots.length && 'temporal_snapshots',
      ].filter((s): s is string => typeof s === 'string'),
      i.summaries.length + i.temporalSnapshots.length
    ),
  };
}

type State = 'open' | 'done' | 'slipped';

export function buildFollowThrough(i: PersonModelInputs, now: Date): Section<FollowThroughStats> {
  const t = now.getTime();
  const items: Array<{ kind: FollowUpKind; state: State; at: number | null }> = [];
  for (const f of i.followThrough) {
    const kind = followUpKind(f.kind);
    if (!kind || f.status === 'released') continue; // let go by the caller: not a slip
    const late = f.status !== 'done' && (ms(f.dueAt) ?? Infinity) < t;
    const state: State =
      f.status === 'done' ? 'done' : f.status === 'expired' || late ? 'slipped' : 'open';
    items.push({ kind, state, at: ms(f.createdAt) });
  }
  // follow_through stays empty until FOLLOW_THROUGH_IMPORT: read the store it imports from.
  if (i.followThrough.length === 0) {
    for (const c of i.commitments) {
      const state: State =
        c.status === 'completed' ? 'done' : c.status === 'abandoned' ? 'slipped' : 'open';
      items.push({ kind: 'commitment', state, at: ms(c.createdAt) });
    }
  }
  for (const c of i.ferniCommitments) {
    if (c.type === 'remember' || c.type === 'avoid') continue;
    const kept = c.fulfilled === true || c.outcome === 'kept';
    const state: State = kept ? 'done' : c.outcome === 'missed' ? 'slipped' : 'open';
    items.push({ kind: 'promise', state, at: ms(c.madeAt) });
  }
  const recent = items.filter((x) => x.at === null || t - x.at <= 60 * DAY);
  const byKind: FollowThroughStats['byKind'] = {};
  if (recent.length >= 3) {
    for (const x of recent) {
      const k = (byKind[x.kind] ??= { opened: 0, done: 0, slipped: 0 });
      k.opened++;
      if (x.state !== 'open') k[x.state]++;
    }
  }
  const missed = (c: Doc) =>
    c.outcome === 'missed' && t - (ms(c.dueBy) ?? ms(c.madeAt) ?? 0) <= 30 * DAY;
  return {
    value: {
      byKind,
      slips: Object.entries(byKind)
        .filter(([, v]) => v.slipped >= 2 && v.slipped > v.done)
        .map(([k]) => `${k}s`)
        .slice(0, 3),
      ferniPromisesOpen: i.ferniCommitments.filter((c) => ferniOpen(c, t)).length,
      ferniPromisesMissed30d: i.ferniCommitments.filter(missed).length,
    },
    prov: prov(
      now,
      [i.followThrough.length ? 'follow_through' : 'commitments', 'ferni_commitments'],
      items.length
    ),
  };
}
