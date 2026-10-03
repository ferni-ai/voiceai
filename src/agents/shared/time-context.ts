/**
 * What Ferni is told about the date and time.
 *
 * The session prompt used to state the server's clock ("The current time is
 * 11:40 PM") with no zone: LiveKit Cloud runs in UTC, so an evening call on
 * the US east coast read as near midnight. And the character (who "still
 * wakes around five") filled its own day from the backstory: at 7:30 pm
 * Eastern it was "watching the morning light creep in and having my first
 * coffee" (dev, 2026-09-30). The caller's local time and part of the day,
 * and one rule that Ferni's own day keeps step with it, fix both.
 *
 * @module agents/shared/time-context
 */

/** True for an IANA zone the runtime knows ("America/New_York"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** The prompt's date/time section, in the caller's zone when known. */
export function timeContext(now: Date, callerTimeZone?: string): string {
  const rules =
    "Use this naturally; don't announce it unless asked. When you talk about your own day, keep it in step with this time of day.";
  if (!isValidTimeZone(callerTimeZone)) {
    const date = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return `
---

## Current Date & Time

Today is ${date} (UTC). You don't know the caller's local time: don't greet them by time of day or assume it's morning or night for them. If it matters, ask.
When you talk about your own day, keep it vague about the hour.
`;
  }
  const date = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: callerTimeZone,
  });
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: callerTimeZone,
  });
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: callerTimeZone }).format(now)
  );
  return `
---

## Current Date & Time

For the caller it's ${date}, ${time} (${callerTimeZone}): ${partOfDay(hour)}.
${rules}
If someone asks what day or time it is, you know the answer.
`;
}
