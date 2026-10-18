/**
 * The schedule API with no calendar connected still returns Ferni's own list,
 * labelled, not an empty day (#1547).
 */
import { describe, expect, it, vi } from 'vitest';

const ferniEvent = {
  id: 'e1',
  userId: 'user-1',
  title: 'Lunch with Sam',
  startTime: new Date('2026-10-17T16:00:00.000Z'),
  endTime: new Date('2026-10-17T17:00:00.000Z'),
  isAllDay: false,
  attendees: [],
  status: 'confirmed',
  source: 'ferni',
  syncStatus: 'local',
  reminders: [],
  createdAt: new Date('2026-10-16T00:00:00.000Z'),
  updatedAt: new Date('2026-10-16T00:00:00.000Z'),
};

vi.mock('../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(async () => false),
  getDayOverview: vi.fn(async () => ({ events: [ferniEvent] })),
  getWeekOverview: vi.fn(async () => ({ days: [{ events: [ferniEvent] }] })),
}));

import { handleToday, handleWeek } from '../schedule-handlers.js';

function fakeResponse() {
  const res = { statusCode: 0, headers: {} as Record<string, unknown>, body: '' };
  return {
    res,
    writeHead: vi.fn((code: number) => {
      res.statusCode = code;
    }),
    setHeader: vi.fn((name: string, value: unknown) => {
      res.headers[name] = value;
    }),
    end: vi.fn((body?: string) => {
      res.body = body ?? '';
    }),
    get: () => res,
  };
}

describe('schedule API with no calendar connected', () => {
  it("today lists Ferni's own list as connected: false, not an empty overview", async () => {
    const fake = fakeResponse();
    await handleToday({} as never, fake as never, 'user-1');
    const body = JSON.parse(fake.get().body);
    expect(body.connected).toBe(false);
    expect(body.ferniList.map((e: { title: string }) => e.title)).toEqual(['Lunch with Sam']);
    expect(body.message).toMatch(/Ferni's own list/);
    // The What's Ahead panel reads overview.events; a null overview showed its error state
    expect(body.overview.events.map((e: { title: string }) => e.title)).toEqual(['Lunch with Sam']);
  });

  it("week lists Ferni's own list the same way", async () => {
    const fake = fakeResponse();
    await handleWeek({} as never, fake as never, 'user-1');
    const body = JSON.parse(fake.get().body);
    expect(body.connected).toBe(false);
    expect(body.ferniList.map((e: { title: string }) => e.title)).toEqual(['Lunch with Sam']);
    expect(body.overview.days[0].events.map((e: { title: string }) => e.title)).toEqual([
      'Lunch with Sam',
    ]);
  });
});
