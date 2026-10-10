/**
 * The real signals behind "how we're doing together" and "things I've noticed".
 *
 * Everything here comes from what Ferni already stores per user: the sentiment
 * timeline (one snapshot per emotional turn), the promises Ferni made
 * (ferni_commitments) and the life events the user mentioned. Nothing is
 * estimated or defaulted - a signal that isn't there stays absent.
 *
 * Days and hours are the user's own: the web sends its IANA time zone. Without
 * a usable zone, days fall back to UTC and nothing that depends on the hour or
 * weekday is said at all.
 *
 * @module services/trust-systems/together-signals
 */

import type { LifeEvent } from './life-events.js';
import type { EmotionalSnapshot } from './sentiment-timeline.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A promise Ferni made, with how it turned out (if anyone knows yet). */
export interface PromiseRecord {
  id: string;
  text: string;
  madeAt: Date;
  fulfilled: boolean;
  violated: boolean;
  /** When it was kept or broken; absent while it's still open. */
  resolvedAt?: Date;
}

export interface TogetherSignals {
  snapshots: readonly EmotionalSnapshot[];
  promises: readonly PromiseRecord[];
  lifeEvents: readonly LifeEvent[];
}

/** The user's calendar: local day keys, hours and weekdays. */
export interface LocalClock {
  tz: string;
  /** False when no valid zone was given: hours and weekdays aren't trustworthy. */
  known: boolean;
  dayKey: (d: Date) => string;
  hour: (d: Date) => number;
  /** 0 = Sunday. */
  weekday: (d: Date) => number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function zoneFormatter(tz: string): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
  } catch {
    return null; // RangeError: not a zone this runtime knows
  }
}

/** A clock in `tz`, or a UTC clock marked unknown when `tz` is missing or invalid. */
export function localClock(tz: string | null | undefined): LocalClock {
  const zone = tz ? zoneFormatter(tz) : null;
  const fmt = zone ?? (zoneFormatter('UTC') as Intl.DateTimeFormat);
  const parts = (d: Date): Record<string, string> =>
    Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    tz: zone && tz ? tz : 'UTC',
    known: zone !== null,
    dayKey: (d) => {
      const p = parts(d);
      return `${p.year}-${p.month}-${p.day}`;
    },
    hour: (d) => Number(parts(d).hour) % 24,
    weekday: (d) => WEEKDAYS.indexOf(parts(d).weekday),
  };
}

/** Whole calendar days between two day keys (b after a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** One local day we talked, with that day's snapshots in time order. */
export interface ConversationDay {
  key: string;
  snapshots: EmotionalSnapshot[];
}

export function within(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/** The days we talked between `from` and `to`, oldest first. */
export function conversationDays(
  snapshots: readonly EmotionalSnapshot[],
  clock: LocalClock,
  from: Date,
  to: Date
): ConversationDay[] {
  const byDay = new Map<string, EmotionalSnapshot[]>();
  const inRange = snapshots
    .filter((s) => within(s.timestamp, from, to))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const s of inRange) {
    const key = clock.dayKey(s.timestamp);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  return [...byDay.entries()].map(([key, list]) => ({ key, snapshots: list }));
}

export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/** Signals as they stood at `asOf`: anything recorded later is dropped. */
export function signalsAsOf(signals: TogetherSignals, asOf: Date): TogetherSignals {
  const before = (d: Date | undefined): boolean => d !== undefined && d.getTime() <= asOf.getTime();
  return {
    snapshots: signals.snapshots.filter((s) => before(s.timestamp)),
    promises: signals.promises
      .filter((p) => before(p.madeAt))
      .map((p) =>
        before(p.resolvedAt)
          ? p
          : { ...p, fulfilled: false, violated: false, resolvedAt: undefined }
      ),
    lifeEvents: signals.lifeEvents.filter((e) => before(e.context?.mentionedAt)),
  };
}
