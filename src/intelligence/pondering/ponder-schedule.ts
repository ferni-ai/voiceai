/**
 * When to ponder a caller: the timing a friend's afterthoughts keep.
 *
 * A friend doesn't think a call over the second it ends. The thought comes
 * back after some time away from it, most often after a night's sleep
 * (incubation and sleep-dependent consolidation are the best-replicated
 * effects in this area). So the pass runs once, overnight in the caller's
 * own timezone, at least MIN_INCUBATION_MS after their last call. That puts
 * a fresh thought in place for the morning, before they are likely to call.
 *
 * Someone who calls several times a day would talk again before that night
 * comes. For them the pass runs a little before their usual gap between
 * calls runs out, so the next call still finds it. It never runs sooner than
 * MIN_INCUBATION_MS after a call.
 *
 * Each caller gets a fixed minute inside the night window (hashed from the
 * uid), which spreads the work across 02:00 to 05:00 instead of piling it
 * onto one minute. A caller with no call since their last pass is never
 * due: there is nothing new to think about.
 *
 * Pure functions; the queue and the poll that use them live with the job.
 *
 * @module intelligence/pondering/ponder-schedule
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** The least time between a call and thinking it over. */
export const MIN_INCUBATION_MS = 2 * HOUR;
/** How long before a frequent caller's usual next call the thought is ready. */
export const READY_LEAD_MS = 30 * MINUTE;
/** The night window, local time: [NIGHT_START_HOUR, NIGHT_START_HOUR + NIGHT_SPAN_MINUTES). */
export const NIGHT_START_HOUR = 2;
export const NIGHT_SPAN_MINUTES = 180;
/** Most callers pondered in one poll. */
export const MAX_PER_POLL = 25;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** The instant a local wall-clock time occurs in timeZone (DST-correct to the minute). */
export function zonedInstant(local: LocalParts, timeZone: string): Date {
  const wall = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  let guess = wall;
  // Two passes settle the offset, including across a DST change.
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(guess), timeZone);
    const seenWall = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    guess += wall - seenWall;
  }
  return new Date(guess);
}

/** The caller's fixed minute inside the night window, 0 to NIGHT_SPAN_MINUTES - 1. */
export function nightMinute(uid: string): number {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) h = Math.imul(h ^ uid.charCodeAt(i), 16777619);
  return (h >>> 0) % NIGHT_SPAN_MINUTES;
}

/** The first night slot for this caller at or after `earliest`. */
export function nextNightSlot(earliest: Date, timeZone: string, uid: string): Date {
  const minute = nightMinute(uid);
  const day = localParts(earliest, timeZone);
  for (let addDays = 0; addDays < 3; addDays++) {
    const date = new Date(Date.UTC(day.year, day.month - 1, day.day + addDays));
    const slot = zonedInstant(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: NIGHT_START_HOUR + Math.floor(minute / 60),
        minute: minute % 60,
      },
      timeZone
    );
    if (slot >= earliest) return slot;
  }
  return new Date(earliest.getTime() + 24 * HOUR); // unreachable for valid zones
}

/** The middle gap between consecutive calls, or undefined with fewer than three calls. */
export function typicalGapMs(callEnds: readonly Date[]): number | undefined {
  const times = callEnds.map((d) => d.getTime()).sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => t - times[i]!);
  if (gaps.length < 2) return undefined;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

export interface PonderTiming {
  /** When the caller's latest call ended. */
  lastCallEnd: Date;
  /** Earlier call ends, for the caller's rhythm (any order; may include lastCallEnd). */
  recentCallEnds?: readonly Date[];
  /** IANA zone of the caller; invalid or missing falls back to UTC. */
  timeZone?: string;
  uid: string;
}

function validZone(timeZone: string | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** When to ponder after this caller's latest call. */
export function ponderDueAt({
  lastCallEnd,
  recentCallEnds = [],
  timeZone,
  uid,
}: PonderTiming): Date {
  const zone = validZone(timeZone);
  const earliest = new Date(lastCallEnd.getTime() + MIN_INCUBATION_MS);
  const night = nextNightSlot(earliest, zone, uid);
  const gap = typicalGapMs([...recentCallEnds, lastCallEnd]);
  if (gap === undefined) return night;
  const beforeNextCall = lastCallEnd.getTime() + gap - READY_LEAD_MS;
  return new Date(Math.max(earliest.getTime(), Math.min(night.getTime(), beforeNextCall)));
}

/**
 * The due time to keep when another call lands while one is queued: the
 * later of the two, so the pass always runs MIN_INCUBATION_MS after the
 * newest call and reads it.
 */
export function mergeDue(queued: Date | undefined, next: Date): Date {
  return queued && queued > next ? queued : next;
}

export interface DueEntry {
  uid: string;
  dueAt: Date;
  lastCallEnd: Date;
  /** When this caller was last pondered, if ever. */
  lastPonderedAt?: Date;
}

/** True when a call has landed since the caller was last pondered. */
export function hasNewCall(entry: Pick<DueEntry, 'lastCallEnd' | 'lastPonderedAt'>): boolean {
  return !entry.lastPonderedAt || entry.lastCallEnd > entry.lastPonderedAt;
}

/** The callers to ponder now: due, with a call since their last pass, oldest first, capped. */
export function pickDue(entries: readonly DueEntry[], now: Date, cap = MAX_PER_POLL): DueEntry[] {
  return entries
    .filter((e) => e.dueAt <= now && hasNewCall(e))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, cap);
}
