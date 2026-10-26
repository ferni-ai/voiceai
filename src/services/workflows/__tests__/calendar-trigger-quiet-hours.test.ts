/**
 * QUIET_HOURS_FROM_PREFS: the pre-meeting push (15 minutes before an event) is held while the
 * quiet hours saved in the menu hold, through the reader the calendar-triggers job passes in.
 * Flag off or unset, it goes at every time, whatever is saved: main's decision (main never
 * checked). Instants are UTC; 2026-10-20 is CDT (UTC-5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const users: Record<string, Record<string, unknown>> = {};
const query = () => {
  const q = { where: () => q, get: async () => ({ docs: [], size: 0, empty: true }) };
  return q;
};
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collectionGroup: query,
    collection: () => ({
      doc: (id: string) => ({ get: async () => ({ exists: !!users[id], data: () => users[id] }) }),
    }),
  }),
}));
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collectionGroup = query;
  },
}));
vi.mock('../../outreach/unified-delivery.js', () => ({
  getChannelStatus: async () => ({ push: { available: true } }),
}));
vi.mock('../../identity/google-calendar-token-store.js', () => ({
  listTokenUsers: async () => ['u1'],
}));
let eventN = 0;
vi.mock('../../calendar/unified-calendar-store.js', () => ({
  getEvents: async () => {
    const start = new Date(Date.now() + 15 * 60_000);
    const end = new Date(start.getTime() + 30 * 60_000);
    return [{ id: `e${++eventN}`, title: 'Standup', startTime: start, endTime: end }];
  },
}));
vi.mock('../../calendar/meeting-memory-service.js', () => ({
  enrichPreMeetingBriefing: async () => null,
}));
const sendNotification = vi.fn(async () => true);
vi.mock('../../push-notifications.js', () => ({
  getPushNotificationsService: () => ({ sendNotification }),
}));

const { runCalendarTriggerCheck } = await import('../calendar-trigger-worker.js');
const { isSavedQuietNow } = await import('../../outreach/quiet-hours.js');

const CHI = 'America/Chicago';
const saveWindow = (quietStart: string, quietEnd: string) => {
  users.u1 = { messagingPrefs: { quietStart, quietEnd, zone: CHI } };
};
const pushedAt = async (now: Date): Promise<boolean> => {
  vi.setSystemTime(now);
  sendNotification.mockClear();
  await runCalendarTriggerCheck({ quietNow: isSavedQuietNow });
  return sendNotification.mock.calls.length > 0;
};

beforeEach(() => {
  for (const k of Object.keys(users)) delete users[k];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('pre-meeting push and saved quiet hours', () => {
  it('held inside the saved window (20:00 to 09:30), sent outside it', async () => {
    saveWindow('20:00', '09:30');
    expect(await pushedAt(new Date('2026-10-21T01:15:00Z'))).toBe(false); // 20:15 Chicago
    expect(await pushedAt(new Date('2026-10-21T12:45:00Z'))).toBe(false); // 07:45 Chicago
    expect(await pushedAt(new Date('2026-10-20T20:00:00Z'))).toBe(true); // 15:00 Chicago
  });

  it('nothing saved: sent, as before', async () => {
    expect(await pushedAt(new Date('2026-10-21T01:15:00Z'))).toBe(true);
  });
});

const DAYS = ['2026-03-08', '2026-10-25'];
const TIMES = DAYS.flatMap((d) => {
  const base = Date.parse(`${d}T00:00:00Z`);
  const out: Date[] = [];
  for (let m = 0; m < 24 * 60; m += 50) out.push(new Date(base + m * 60_000));
  return out;
});
const WINDOWS: Array<[string, string]> = [
  ['00:00', '23:59'],
  ['20:00', '09:30'],
  ['12:00', '14:00'],
];

describe('flag off or unset: identical to main over a time grid (always sent)', () => {
  it.each(['off', undefined])('QUIET_HOURS_FROM_PREFS=%s', async (flag) => {
    if (flag) vi.stubEnv('QUIET_HOURS_FROM_PREFS', flag);
    else delete process.env.QUIET_HOURS_FROM_PREFS;
    const held: string[] = [];
    for (const [start, end] of WINDOWS) {
      saveWindow(start, end);
      for (const now of TIMES)
        if (!(await pushedAt(now))) held.push(`${start} ${now.toISOString()}`);
    }
    expect(held).toEqual([]);
  });
});
