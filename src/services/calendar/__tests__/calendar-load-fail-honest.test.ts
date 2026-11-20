/**
 * CALENDAR_LOAD_FAIL_HONEST (#4237), on the REAL calendar store and the real tool gate.
 *
 * A Firestore load that throws used to be cached as an empty calendar for the rest of the
 * process, so "what's on my calendar today?" heard "Your calendar is clear" and nothing ever
 * retried. Off, that stays byte-for-byte. On, nothing is cached, the next read retries, and the
 * read that hit the failure says it couldn't check the calendar. Only Firestore is faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ fail: true, gets: 0 }));

vi.mock('../../../utils/shared-firestore.js', () => ({
  sharedFirestore: () => ({
    collection: (path: string) => ({
      get: async () => {
        db.gets += 1;
        if (db.fail) throw new Error('unavailable');
        if (!path.endsWith('/calendar_events')) return { docs: [] };
        const start = new Date();
        start.setHours(12, 0, 0, 0);
        const end = new Date(start.getTime() + 30 * 60000);
        const stored = {
          id: 'evt_1',
          userId: path.split('/')[1],
          title: 'Dentist checkup',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          isAllDay: false,
          attendees: [],
          status: 'confirmed',
          source: 'ferni',
          syncStatus: 'synced',
          reminders: [],
          createdAt: start.toISOString(),
          updatedAt: start.toISOString(),
        };
        return { docs: [{ data: () => stored }] };
      },
    }),
  }),
}));
vi.mock('../calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: async () => true,
}));

const { smartCalendarTools, gateCalendarTools } =
  await import('../../../tools/domains/calendar/calendar-connection-gate.js');
const { getEventsForDay } = await import('../unified-calendar-store.js');
const { CALENDAR_UNCHECKED } = await import('../not-connected-copy.js');
const { calendarLoadFailed, readOrUnchecked } = await import('../calendar-load-state.js');

type Exec = { execute: (p: unknown, o: unknown) => Promise<unknown> };
const CLEAR = 'Your calendar is clear today. No meetings scheduled.';

async function today(userId: string): Promise<unknown> {
  const def = smartCalendarTools.find((d) => d.id === 'getCalendarToday')!;
  return (def.create({ userId } as never) as Exec).execute({}, {});
}

/** A gated tool whose body reads the real store, then answers as it would with nothing listed. */
async function gatedRun(id: string, userId: string): Promise<unknown> {
  const reply =
    id === 'getUnifiedSchedule' ? 'Your schedule is clear today.' : 'Saved "Dentist checkup".';
  const def = {
    id,
    create: () => ({
      execute: async () => {
        await getEventsForDay(userId, new Date());
        return reply;
      },
    }),
  };
  const [gated] = gateCalendarTools([def as never]);
  return (gated.create({ userId } as never) as Exec).execute({ title: 'Dentist checkup' }, {});
}

afterEach(() => {
  delete process.env.CALENDAR_LOAD_FAIL_HONEST;
  db.fail = true;
  db.gets = 0;
});

describe('CALENDAR_LOAD_FAIL_HONEST off (== main)', () => {
  it('a failed load reads as clear, and stays clear after Firestore recovers', async () => {
    const uid = 'uid-riley-test-off-0000000001';
    expect(await today(uid)).toBe(CLEAR);
    const gets = db.gets;
    db.fail = false;
    expect(await today(uid)).toBe(CLEAR); // cached empty: never retried
    expect(db.gets).toBe(gets);
  });

  it('readOrUnchecked passes the read through even after a recorded failure', async () => {
    expect(calendarLoadFailed('uid-riley-test-off-0000000002', new Error('x'))).toBe(false);
    expect(await readOrUnchecked('uid-riley-test-off-0000000002', async () => CLEAR)).toBe(CLEAR);
  });
});

describe('CALENDAR_LOAD_FAIL_HONEST on', () => {
  it('a failed load says it could not check, never "clear"', async () => {
    process.env.CALENDAR_LOAD_FAIL_HONEST = 'on';
    const reply = await today('uid-riley-test-on-00000000001');
    expect(reply).toBe(CALENDAR_UNCHECKED);
    expect(reply).not.toMatch(/clear/i);
  });

  it('nothing is cached, so the next read retries and finds the event', async () => {
    process.env.CALENDAR_LOAD_FAIL_HONEST = 'on';
    const uid = 'uid-riley-test-on-00000000002';
    expect(await today(uid)).toBe(CALENDAR_UNCHECKED);
    const gets = db.gets;
    db.fail = false;
    const reply = await today(uid);
    expect(db.gets).toBeGreaterThan(gets);
    expect(reply).toMatch(/^You have 1 meeting today\. .*Dentist checkup/);
  });

  it('a load that works is not called unchecked', async () => {
    process.env.CALENDAR_LOAD_FAIL_HONEST = 'on';
    db.fail = false;
    expect(await today('uid-riley-test-on-00000000003')).toMatch(/Dentist checkup/);
  });

  it('a schedule view (clear-only) that hit a failed load says it could not check', async () => {
    process.env.CALENDAR_LOAD_FAIL_HONEST = 'on';
    const reply = await gatedRun('getUnifiedSchedule', 'uid-riley-test-on-00000000007');
    expect(reply).toBe(CALENDAR_UNCHECKED);
  });

  it('a write is not relabelled as an unread calendar (its own reply stands)', async () => {
    process.env.CALENDAR_LOAD_FAIL_HONEST = 'on';
    expect(await gatedRun('createCalendarEvent', 'uid-riley-test-on-00000000008')).toBe(
      'Saved "Dentist checkup".'
    );
  });

  it('a failure for one person does not mark another person unread', async () => {
    process.env.CALENDAR_LOAD_FAIL_HONEST = 'on';
    expect(calendarLoadFailed('uid-riley-test-on-00000000004', new Error('x'))).toBe(true);
    const other = await readOrUnchecked('uid-riley-test-on-00000000005', async () => 'listed');
    expect(other).toBe('listed');
  });

  it('a failure left over from before a read began does not taint it', async () => {
    process.env.CALENDAR_LOAD_FAIL_HONEST = 'on';
    const uid = 'uid-riley-test-on-00000000006';
    calendarLoadFailed(uid, new Error('x'));
    expect(await readOrUnchecked(uid, async () => 'listed')).toBe('listed');
  });
});
