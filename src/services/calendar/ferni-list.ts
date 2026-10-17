/**
 * Ferni's own list, as the caller hears it (#1547). With no calendar connected,
 * the items on Ferni's list are still the caller's, so they are named, labelled.
 *
 * @module services/calendar/ferni-list
 */

import { getDayOverview, getEventsForDay } from './calendar-service.js';
import { parseNaturalDate } from './natural-date-parser.js';
import { notConnectedWithList } from './not-connected-copy.js';
/**
 * Items as "10:00 AM Lunch with Sam; 3:00 PM Standup" (or "Mon, Oct 19 10:00 AM ..." with
 * the day). All-day items read "All day". Empty when there are none.
 */
export function describeFerniList(
  events: readonly { startTime: Date | string; title?: string; isAllDay?: boolean }[],
  withDay = false
): string {
  return events
    .map((event) => {
      const when = new Date(event.startTime);
      const day = withDay
        ? `${when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} `
        : '';
      const time = event.isAllDay
        ? 'All day'
        : when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `${day}${time} ${event.title || 'Untitled'}`;
    })
    .join('; ');
}

/** Ferni's list for the day, as "10:00 AM Lunch"; empty when there is nothing on it. */
export async function ferniListToday(userId: string, now = new Date()): Promise<string> {
  return describeFerniList((await getDayOverview(userId, now)).events);
}

/**
 * Awareness with no calendar connected (#1547): Ferni's list is named when it has
 * items; otherwise only the persona that suggests connecting gets a line.
 */
export async function notConnectedAwareness(
  userId: string,
  suggestConnect: boolean
): Promise<{ isConnected: false; contextInjection: string | null }> {
  const onList = await ferniListToday(userId);
  if (onList) {
    return {
      isConnected: false,
      contextInjection: `[CALENDAR: No calendar is connected. On Ferni's own list today: ${onList}. Say it is Ferni's list, not their calendar.]`,
    };
  }
  return {
    isConnected: false,
    contextInjection: suggestConnect
      ? '[CALENDAR: Not connected. If user asks about calendar, suggest connecting.]'
      : null,
  };
}

/** The schedule read with nothing connected: Ferni's list for the day asked, or null when empty. */
export async function ferniScheduleReply(userId: string, dateArg?: string): Promise<string | null> {
  const parsed = dateArg ? parseNaturalDate(dateArg) : null;
  const list = describeFerniList(await getEventsForDay(userId, parsed?.date ?? new Date()));
  return list ? notConnectedWithList(list, parsed?.interpretation ?? 'today') : null;
}
