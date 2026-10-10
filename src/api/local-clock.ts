/**
 * The time where the person is, not where the server is.
 *
 * The Sanctuary greeted people and picked their practices by the server's clock. Cloud
 * Run runs in UTC, so someone in California at 1am got "Saturday morning" and a morning
 * check-in. The app now sends its IANA time zone (`?tz=America/Los_Angeles`).
 */

/**
 * The person's wall-clock time, as a Date whose getHours(), getDay() and weekday formatting
 * read in their zone. The server's own clock when the zone is missing or unknown.
 */
export function wallClock(timeZone: string | null | undefined, now = new Date()): Date {
  // IANA names are short ("America/Argentina/ComodRivadavia" is among the longest)
  if (!timeZone || timeZone.length > 64) return now;
  try {
    const parts = Object.fromEntries(
      formatterFor(timeZone)
        .formatToParts(now)
        .map((p) => [p.type, p.value])
    );
    const [year, month, day, hour, minute] = ['year', 'month', 'day', 'hour', 'minute'].map((k) =>
      Number(parts[k])
    );
    const local = new Date(year, month - 1, day, hour, minute);
    // A missing or odd part would make an Invalid Date, which reads NaN hours and throws on formatting
    return Number.isNaN(local.getTime()) ? now : local;
  } catch {
    return now; // not a time zone Intl knows
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const MAX_FORMATTERS = 500; // about the number of IANA zones

/** For tests: how many zones have a cached formatter. */
export const cachedZoneCount = (): number => formatters.size;

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    // Intl accepts any letter case ("europe/london"), so callers could mint new keys forever
    if (formatters.size >= MAX_FORMATTERS) formatters.clear();
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(now: Date): TimeOfDay {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
