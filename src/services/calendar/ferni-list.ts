/**
 * Ferni's own list, as the caller hears it (#1547). With no calendar connected,
 * the items on Ferni's list are still the caller's, so they are named, labelled.
 *
 * @module services/calendar/ferni-list
 */

import { getDayOverview } from './calendar-service.js';
/** Timed items, as "10:00 AM Lunch with Sam; 3:00 PM Standup". Empty when there are none. */
export function describeFerniList(
  events: readonly { startTime: Date | string; title?: string; isAllDay?: boolean }[]
): string {
  return events
    .filter((event) => !event.isAllDay)
    .map((event) => {
      const time = new Date(event.startTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${time} ${event.title || 'Untitled'}`;
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
