/**
 * IANA time zone checks shared across layers (the voice agent's time context,
 * the API's token route and the seed earn rules all take a zone from a client),
 * plus wall-clock math in a zone: a scheduled time is the user's local wall
 * time, stored as the UTC instant that matches it (DST included).
 *
 * @module utils/time-zone
 */

// Zones already known good: building an Intl.DateTimeFormat to check one is slow,
// and quiet-hours checks ask about the same few zones many times per decision.
const validZones = new Set<string>();
const MAX_VALID_ZONES = 500; // about the number of IANA zones

/** True for an IANA zone the runtime knows ("America/New_York"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  if (validZones.has(tz)) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    return false;
  }
  // Intl accepts any letter case ("europe/london"), so callers could mint new keys forever
  if (validZones.size >= MAX_VALID_ZONES) validZones.clear();
  validZones.add(tz);
  return true;
}

/** A wall-clock time in a zone; month is 1-12. */
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The wall-clock time of an instant in a zone. */
export function wallTimeIn(instant: Date, zone: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const [year, month, day, hour, minute] = ['year', 'month', 'day', 'hour', 'minute'].map(get);
  return { year, month, day, hour: hour % 24, minute };
}

/** The zone's UTC offset at an instant, in ms (New York in summer: -4 h). */
function offsetMs(instantMs: number, zone: string): number {
  const w = wallTimeIn(new Date(instantMs), zone);
  return (
    Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(instantMs / 60000) * 60000
  );
}

/**
 * The UTC instant at which the zone's clock shows this wall time, using the
 * offset in force at that moment (DST included). A time skipped by
 * spring-forward lands just after the gap. Unknown zone = UTC.
 */
export function zonedWallTimeToUtc(wall: WallTime, timeZone: string | undefined): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'Etc/UTC';
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const first = naive - offsetMs(naive, zone);
  return new Date(naive - offsetMs(first, zone));
}

/**
 * A wall clock in a zone with the Date getters and setters date parsers use
 * (setDate(getDate() + 1), setHours(12, 0, 0, 0), getDay()), so a parser
 * written against the server clock works in the user's zone (unknown = UTC).
 * toDate() is the UTC instant matching the wall time it ends on.
 */
export class WallClock {
  private readonly naive: Date;
  private readonly zone: string;

  constructor(instant: Date, timeZone: string | undefined) {
    this.zone = isValidTimeZone(timeZone) ? timeZone : 'Etc/UTC';
    const w = wallTimeIn(instant, this.zone);
    this.naive = new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute));
  }

  getDay = (): number => this.naive.getUTCDay();
  getDate = (): number => this.naive.getUTCDate();
  getMonth = (): number => this.naive.getUTCMonth();
  getHours = (): number => this.naive.getUTCHours();
  getMinutes = (): number => this.naive.getUTCMinutes();
  setDate = (d: number): number => this.naive.setUTCDate(d);
  setMonth = (m: number): number => this.naive.setUTCMonth(m);
  setMinutes = (m: number): number => this.naive.setUTCMinutes(m);
  setHours = (h: number, m = this.getMinutes(), s = 0, ms = 0): number =>
    this.naive.setUTCHours(h, m, s, ms);

  toDate(): Date {
    const n = this.naive;
    const [year, month, day] = [n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()];
    return zonedWallTimeToUtc(
      { year, month, day, hour: n.getUTCHours(), minute: n.getUTCMinutes() },
      this.zone
    );
  }
}

/**
 * What was stored, read back in the user's own time: "tomorrow, Oct 13, 12:00
 * PM your time". With no known zone it says UTC and that the zone is unknown,
 * rather than pass a UTC time off as theirs.
 */
export function formatStoredLocalTime(
  utc: string | Date,
  zone: string | undefined,
  now: Date = new Date()
): string {
  const instant = typeof utc === 'string' ? new Date(utc) : utc;
  const tz = isValidTimeZone(zone) ? zone : 'Etc/UTC';
  const dayNumber = (d: Date): number => {
    const w = wallTimeIn(d, tz);
    return Date.UTC(w.year, w.month - 1, w.day) / 86400000;
  };
  const ahead = dayNumber(instant) - dayNumber(now);
  const fmt = (o: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat('en-US', { ...o, timeZone: tz }).format(instant);
  const label = ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : fmt({ weekday: 'long' });
  const year = ahead < 0 || ahead > 300 ? ({ year: 'numeric' } as const) : {};
  const date = fmt({ month: 'short', day: 'numeric', ...year });
  const time = fmt({ hour: 'numeric', minute: '2-digit', hour12: true });
  const where = tz === zone ? 'your time' : "UTC (I don't know your time zone yet)";
  return `${label}, ${date}, ${time} ${where}`;
}
