/**
 * CALENDAR_WRITES_TRUTHFUL (#4244), on the REAL calendar store and the real gated tools.
 *
 * A Firestore write for a new event, or a delete, that failed was logged and swallowed:
 * createCalendarEvent said "Saved" and deleteCalendarEvent said "removed" while nothing durable
 * changed. Off, that stays exactly as on main. On, an unsaved event is not kept and the tool says
 * it couldn't create it; a failed delete is undone and the tool says it couldn't delete it.
 * Only Firestore is faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ failWrites: false, docs: new Map<string, object>() }));

vi.mock('../../../utils/shared-firestore.js', () => ({
  sharedFirestore: () => ({
    collection: (path: string) => ({
      get: async () => ({
        docs: [...db.docs]
          .filter(([p]) => p.slice(0, p.lastIndexOf('/')) === path)
          .map(([, data]) => ({ data: () => data })),
      }),
      doc: (id: string) => ({
        set: async (data: object) => {
          if (db.failWrites) throw new Error('unavailable');
          db.docs.set(`${path}/${id}`, data);
        },
        delete: async () => {
          if (db.failWrites) throw new Error('unavailable');
          db.docs.delete(`${path}/${id}`);
        },
      }),
    }),
  }),
}));

const { smartCalendarTools } =
  await import('../../../tools/domains/calendar/calendar-connection-gate.js');
const { deleteEvent, getEventsForDay } = await import('../unified-calendar-store.js');
const service = await import('../calendar-service.js');
const { saveEventDoc, deleteEventDoc } = await import('../calendar-event-persist.js');
const { calendarWriteSaved } = await import('../calendar-write-state.js');

type Exec = { execute: (p: unknown, o: unknown) => Promise<unknown> };
let n = 0;
const person = () => `uid-riley-test-writes-${String(++n).padStart(6, '0')}`;

function seedConnected(uid: string): void {
  db.docs.set(`users/${uid}/calendar_providers/apple`, {
    ...{ provider: 'apple', connected: true, syncEnabled: true, syncDirection: 'two-way' },
  });
}

function seedEvent(uid: string, extra: Record<string, unknown> = {}): Date {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const iso = start.toISOString();
  db.docs.set(`users/${uid}/calendar_events/evt_seed`, {
    ...{ id: 'evt_seed', userId: uid, title: 'Dentist checkup', startTime: iso },
    ...{ endTime: new Date(start.getTime() + 30 * 60_000).toISOString(), isAllDay: false },
    ...{ attendees: [], status: 'confirmed', source: 'ferni', syncStatus: 'local' },
    ...{ reminders: [], createdAt: iso, updatedAt: iso },
    ...extra,
  });
  return start;
}

async function tool(id: string, uid: string, params: Record<string, unknown>): Promise<unknown> {
  const def = smartCalendarTools.find((d) => d.id === id)!;
  return (def.create({ userId: uid } as never) as Exec).execute(params, {});
}

const tomorrow = (): string => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const lunch = { title: 'Lunch with Riley', date: tomorrow(), startTime: '12:30' };
const lunchOn = async (uid: string) =>
  (await getEventsForDay(uid, new Date(Date.now() + 86_400_000))).map((e) => e.title);
const stored = (uid: string) =>
  [...db.docs.keys()].filter((k) => k.startsWith(`users/${uid}/calendar_events/`));

afterEach(() => {
  delete process.env.CALENDAR_WRITES_TRUTHFUL;
  db.failWrites = false;
});

describe('CALENDAR_WRITES_TRUTHFUL off (== main)', () => {
  it('a failed create says saved and keeps the event in memory only', async () => {
    const uid = person();
    seedConnected(uid);
    db.failWrites = true;
    expect(await tool('createCalendarEvent', uid, lunch)).toMatch(/^Saved to the Ferni calendar/);
    db.failWrites = false;
    expect(await lunchOn(uid)).toEqual(['Lunch with Riley']);
    expect(stored(uid)).toEqual([]);
  });

  it('a failed delete says removed', async () => {
    const uid = person();
    seedConnected(uid);
    seedEvent(uid);
    db.failWrites = true;
    const reply = await tool('deleteCalendarEvent', uid, {
      eventId: 'evt_seed',
      eventTitle: 'Dentist checkup',
    });
    expect(reply).toBe('Dentist checkup has been removed from your calendar.');
    expect(stored(uid)).toHaveLength(1);
  });
});

describe('CALENDAR_WRITES_TRUTHFUL on', () => {
  it('a failed create says it could not, and the event is not kept', async () => {
    process.env.CALENDAR_WRITES_TRUTHFUL = 'on';
    const uid = person();
    seedConnected(uid);
    db.failWrites = true;
    expect(await tool('createCalendarEvent', uid, lunch)).toMatch(/^Couldn't create the event/);
    db.failWrites = false;
    expect(await lunchOn(uid)).toEqual([]);
  });

  it('a create that saves says saved, and the event is stored', async () => {
    process.env.CALENDAR_WRITES_TRUTHFUL = 'on';
    const uid = person();
    seedConnected(uid);
    expect(await tool('createCalendarEvent', uid, lunch)).toMatch(/^Saved to the Ferni calendar/);
    expect(stored(uid)).toHaveLength(1);
    expect(await lunchOn(uid)).toEqual(['Lunch with Riley']);
  });

  it('a failed delete says it could not, and the event is still listed', async () => {
    process.env.CALENDAR_WRITES_TRUTHFUL = 'on';
    const uid = person();
    seedConnected(uid);
    const day = seedEvent(uid);
    db.failWrites = true;
    const reply = await tool('deleteCalendarEvent', uid, {
      eventId: 'evt_seed',
      eventTitle: 'Dentist checkup',
    });
    expect(reply).toMatch(/^Couldn't delete that event/);
    db.failWrites = false;
    expect((await getEventsForDay(uid, day)).map((e) => e.title)).toEqual(['Dentist checkup']);
  });

  it('a failed delete of a synced event is undone, not left marked deleted', async () => {
    process.env.CALENDAR_WRITES_TRUTHFUL = 'on';
    const uid = person();
    const day = seedEvent(uid, { syncStatus: 'synced', externalId: 'ext-1', source: 'apple' });
    db.failWrites = true;
    expect(await deleteEvent(uid, 'evt_seed')).toBe(false);
    db.failWrites = false;
    const [event] = await getEventsForDay(uid, day);
    expect(event?.syncStatus).toBe('synced');
  });

  it('a delete that saves says removed, and the stored event is gone', async () => {
    process.env.CALENDAR_WRITES_TRUTHFUL = 'on';
    const uid = person();
    seedConnected(uid);
    seedEvent(uid);
    const reply = await tool('deleteCalendarEvent', uid, {
      eventId: 'evt_seed',
      eventTitle: 'Dentist checkup',
    });
    expect(reply).toBe('Dentist checkup has been removed from your calendar.');
    expect(stored(uid)).toEqual([]);
  });

  it('calendar-service createEvent (the confirm flow) returns null when the write failed', async () => {
    const uid = person();
    const input = { title: 'Lunch with Riley', startTime: new Date(Date.now() + 86_400_000) };
    db.failWrites = true;
    expect(await service.createEvent(uid, input as never)).not.toBeNull(); // off == main
    process.env.CALENDAR_WRITES_TRUTHFUL = 'on';
    expect(await service.createEvent(uid, input as never)).toBeNull();
    db.failWrites = false;
    expect(await service.createEvent(uid, input as never)).not.toBeNull();
  });

  it('with no Firestore an event is not saved, and a delete has nothing to undo', async () => {
    process.env.CALENDAR_WRITES_TRUTHFUL = 'on';
    const event = { id: 'evt_x', title: 'x', startTime: new Date(), endTime: new Date() };
    const none = async () => null;
    expect(await saveEventDoc(none, 'p', 'u', event as never, () => ({}) as never)).toBe(false);
    expect(calendarWriteSaved(event as never)).toBe(false);
    expect(await deleteEventDoc(none, 'p', 'evt_x')).toBe(true);
    delete process.env.CALENDAR_WRITES_TRUTHFUL;
    expect(calendarWriteSaved(event as never)).toBe(true);
  });
});
