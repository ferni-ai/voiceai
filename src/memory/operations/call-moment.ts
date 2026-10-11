/**
 * The date a call happened, written for a memory prompt.
 *
 * The end-of-call summarizer and the fact extractor never saw when the call
 * took place, so "my interview is tomorrow" could only be stored as
 * "tomorrow": a fact that is wrong a day later and that nothing can ever
 * supersede. This line gives both prompts the call's date in the caller's
 * own time zone (an 8pm call in Denver is already the next day in UTC), the
 * weekday, and the dates of the next seven days, and asks for absolute
 * dates. Computing the days here means the model only has to look them up.
 *
 * @module memory/operations/call-moment
 */

const WEEK = 7;

function validZone(timeZone: string | undefined): string | undefined {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

/** YYYY-MM-DD and weekday of an instant in a zone. */
function localDay(at: Date, timeZone: string): { ymd: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') };
}

/** The calendar day `days` after a YYYY-MM-DD, with its weekday. */
function addDays(ymd: string, days: number): { ymd: string; weekday: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return localDay(d, 'UTC');
}

/**
 * The prompt line naming when the call took place. `timeZone` is the
 * caller's IANA zone where known; without it the date is given in UTC and
 * labelled so.
 */
export function callMomentLine(at: Date, timeZone?: string): string {
  const zone = validZone(timeZone);
  const today = localDay(at, zone ?? 'UTC');
  const ahead = Array.from({ length: WEEK }, (_, i) => {
    const d = addDays(today.ymd, i + 1);
    return `${i === 0 ? 'tomorrow' : d.weekday} ${d.ymd}`;
  });
  return (
    `This call took place on ${today.weekday}, ${today.ymd} (${zone ?? 'UTC, caller time zone unknown'}). ` +
    `Write every plan, event or time reference as an absolute date (YYYY-MM-DD), never as "tomorrow", ` +
    `"next week" or a bare weekday. Next seven days: ${ahead.join(', ')}.`
  );
}

// The caller's zone per session, recorded when the call starts (the dispatch
// metadata carries it) and read by memory writers that only have a session
// id. Bounded: a worker runs one call at a time, so old entries are just
// left over from earlier calls.
const MAX_SESSIONS = 200;
const zones = new Map<string, string>();

export function rememberCallerTimeZone(sessionId: string, timeZone: unknown): void {
  const zone = validZone(typeof timeZone === 'string' ? timeZone : undefined);
  if (!zone) return;
  zones.delete(sessionId);
  zones.set(sessionId, zone);
  if (zones.size > MAX_SESSIONS) zones.delete(zones.keys().next().value as string);
}

export function callerTimeZoneFor(sessionId: string): string | undefined {
  return zones.get(sessionId);
}
