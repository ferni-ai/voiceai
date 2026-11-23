/**
 * Writing a calendar event to Firestore, and whether it was kept (CALENDAR_WRITES_TRUTHFUL, #4244).
 *
 * The unified store keeps events in memory and writes each one to Firestore. A failed write
 * was logged and swallowed, so createEvent returned the event as saved and the create tool
 * said "Saved", though the event lived only in this process and was gone after a restart or
 * on another instance. A failed delete or update was swallowed the same way ("removed", "Updated").
 *
 * Every write here records its result: 'saved', 'no-db' (no Firestore, so nothing durable)
 * or 'failed'. With the flag on, an event that wasn't saved is not kept, and the create tool
 * says it couldn't create it; a failed delete is undone and returns false; a failed update
 * is rolled back to the old event and returns null. Off,
 * the results are recorded and nothing else changes.
 *
 * @module calendar/calendar-event-persist
 */
import { getLogger } from '../../utils/safe-logger.js';
import { onCalendarEventChange } from '../data-layer/hooks/calendar-hooks.js';
import {
  calendarWritesTruthfulOn,
  recordCalendarWrite,
  type CalendarWrite,
} from './calendar-write-state.js';
import type { CalendarEvent } from './types.js';

/** The part of Firestore these writes use (the store hands in its own client). */
interface EventsDb {
  collection(path: string): { doc(id: string): { delete(): Promise<unknown> } };
}
type EventsDbGetter<Db = EventsDb> = () => Promise<Db | null>;

/**
 * Save `event` with `write` (the store's own cleaned set). True when the event may be kept:
 * always with the flag off (as before), else only when the write saved.
 */
export async function saveEventDoc<Db>(
  db: EventsDbGetter<Db>,
  userId: string,
  event: CalendarEvent,
  write: (firestore: Db) => Promise<unknown>
): Promise<boolean> {
  return recordCalendarWrite(event, await writeEvent(db, userId, event, write));
}

async function writeEvent<Db>(
  db: EventsDbGetter<Db>,
  userId: string,
  event: CalendarEvent,
  write: (firestore: Db) => Promise<unknown>
): Promise<CalendarWrite> {
  const firestore = await db();
  if (!firestore) return 'no-db';
  let result: CalendarWrite = 'failed';
  try {
    await write(firestore);
    result = 'saved';
    // Index to semantic memory for calendar awareness
    void onCalendarEventChange(
      userId,
      event.id,
      {
        title: event.title,
        date: event.startTime.toISOString(),
        time: event.startTime.toTimeString().slice(0, 5),
        duration: event.endTime
          ? Math.round((event.endTime.getTime() - event.startTime.getTime()) / 60000)
          : undefined,
        attendees: event.attendees,
        notes: event.description,
        importance: 'medium',
      },
      event.syncStatus === 'local' ? 'create' : 'update'
    );
  } catch (error) {
    getLogger().error({ error: String(error), eventId: event.id }, 'Failed to persist event');
  }
  return result;
}

const queues = new Map<string, Promise<unknown>>();

/**
 * With the flag on, changes to one event run one at a time, so each is built from the state
 * the one before it left (a failed change rolled back, a saved one kept), never from another
 * change still in flight. Off, `run` starts at once, as before.
 */
export function oneChangeAtATime<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (!calendarWritesTruthfulOn()) return run();
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run);
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  queues.set(key, settled);
  void settled.then(() => queues.get(key) === settled && queues.delete(key));
  return next;
}

/**
 * Delete the event's document. True when the delete may stand: always with the flag off,
 * else unless the write failed (with no Firestore there is nothing stored to delete).
 */
export async function deleteEventDoc(
  db: EventsDbGetter,
  path: string,
  eventId: string
): Promise<boolean> {
  const firestore = await db();
  if (!firestore) return true;
  try {
    await firestore.collection(path).doc(eventId).delete();
    return true;
  } catch (error) {
    getLogger().error({ error: String(error), eventId }, 'Failed to delete persisted event');
    return !calendarWritesTruthfulOn();
  }
}
