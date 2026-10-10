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
  if (!timeZone) return now;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value])
    );
    return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  } catch {
    return now; // not a time zone Intl knows
  }
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(now: Date): TimeOfDay {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
