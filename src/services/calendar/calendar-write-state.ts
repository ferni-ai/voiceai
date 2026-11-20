/**
 * Whether a calendar event's last Firestore write saved (CALENDAR_WRITES_TRUTHFUL, #4244).
 *
 * Kept apart from the writes (calendar-event-persist.ts) so the tools and calendar-service can
 * ask without loading the store's write path. Off, every event counts as saved, as before.
 *
 * @module calendar/calendar-write-state
 */
import { flagOn } from '../../config/env-flag.js';
import type { CalendarEvent } from './types.js';

export type CalendarWrite = 'saved' | 'no-db' | 'failed';

const writes = new WeakMap<CalendarEvent, CalendarWrite>();

export function calendarWritesTruthfulOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('CALENDAR_WRITES_TRUTHFUL', env);
}

/** False only with the flag on and this event's last write not saved: the caller must not say saved. */
export function calendarWriteSaved(event: CalendarEvent): boolean {
  return !calendarWritesTruthfulOn() || (writes.get(event) ?? 'saved') === 'saved';
}

/** Record a write's result; true when the event may be kept (always with the flag off). */
export function recordCalendarWrite(event: CalendarEvent, result: CalendarWrite): boolean {
  writes.set(event, result);
  return calendarWriteSaved(event);
}
