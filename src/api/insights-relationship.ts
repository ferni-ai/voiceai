/**
 * The "relationship" card of GET /api/insights/:userId: how long we've known each other and
 * how many conversations we've had, from the user's profile (first contact date and
 * conversation counter), never estimated from other activity.
 *
 * Time is counted in calendar units in the user's zone: 250 days is "8 months", never "a
 * month". A time milestone also needs the user to have come back at least once; elapsed
 * days alone are not a relationship.
 *
 * @module api/insights-relationship
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Conversations needed before a "time together" line: they came back at least once. */
const MIN_CONVERSATIONS_FOR_TIME = 2;

export interface RelationshipCard {
  daysTogether: number;
  conversations: number;
  milestone?: string;
}

/** The slice of the memory-store UserProfile this card reads */
export interface RelationshipProfile {
  firstContact?: Date | string | number | null;
  totalConversations?: number | null;
  contactInfo?: { timezone?: string } | null;
}

/** Year, month (1-12) and day of an instant in a time zone (UTC when none or unknown). */
function ymd(ms: number, timeZone?: string): [number, number, number] {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date(ms));
  } catch {
    return ymd(ms);
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return [get('year'), get('month'), get('day')];
}

/** Whole calendar months from `from` to `to` in a zone (Jan 31 to Feb 28 is 0 months). */
export function calendarMonthsBetween(from: number, to: number, timeZone?: string): number {
  const [y1, m1, d1] = ymd(from, timeZone);
  const [y2, m2, d2] = ymd(to, timeZone);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** Whole calendar days from `from` to `to` in a zone (midnight to midnight). */
export function calendarDaysBetween(from: number, to: number, timeZone?: string): number {
  const [y1, m1, d1] = ymd(from, timeZone);
  const [y2, m2, d2] = ymd(to, timeZone);
  return Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS));
}

/** "a week" / "3 weeks" / "a month" / "8 months" / "a year" / "2 years", or undefined. */
function timeTogether(days: number, months: number): string | undefined {
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return years === 1 ? 'a year' : `${years} years`;
  }
  if (months >= 1) return months === 1 ? 'a month' : `${months} months`;
  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'a week' : `${weeks} weeks`;
  }
  return undefined;
}

/** Undefined when the profile doesn't say, or there is no milestone worth marking yet */
export function buildRelationship(
  profile: RelationshipProfile | null | undefined,
  now = Date.now()
): RelationshipCard | undefined {
  const first = profile?.firstContact;
  const firstContact = first == null ? NaN : new Date(first).getTime();
  const conversations = profile?.totalConversations;
  if (!Number.isFinite(firstContact) || typeof conversations !== 'number') return undefined;

  const timeZone = profile?.contactInfo?.timezone;
  const daysTogether = calendarDaysBetween(firstContact, now, timeZone);
  if (daysTogether < 7 && conversations < 10) return undefined;

  const months = calendarMonthsBetween(firstContact, now, timeZone);
  const together =
    conversations >= MIN_CONVERSATIONS_FOR_TIME ? timeTogether(daysTogether, months) : undefined;

  let milestone: string | undefined;
  if (conversations >= 100) {
    milestone = "100+ conversations! We've built something meaningful.";
  } else if (together && months >= 1) {
    milestone = `It's been ${together} since we first talked. Thank you for trusting me.`;
  } else if (conversations >= 50) {
    milestone = "50+ conversations. I see how far you've come.";
  } else if (together) {
    milestone = `It's been ${together} since we first talked.`;
  }
  return milestone ? { daysTogether, conversations, milestone } : undefined;
}
