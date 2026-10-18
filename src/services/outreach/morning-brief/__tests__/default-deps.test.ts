/**
 * The brief's readers keep to the person's own day, not the server's UTC one.
 */
import { describe, expect, it, vi } from 'vitest';

const getEventsForDay = vi.fn();
vi.mock('../../../calendar/calendar-service.js', () => ({ getEventsForDay }));
vi.mock('../../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../../memory/recall/forget.js', () => ({ forgottenTopicsOrNull: async () => null }));

const event = (id: string, iso: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: id,
  startTime: new Date(iso),
  endTime: new Date(iso),
  isAllDay: false,
  status: 'confirmed',
  ...extra,
});

describe('readDay', () => {
  it("keeps the calendar to today in their zone, across the server's UTC days", async () => {
    // 08:05 in Chicago on 18 Oct is 13:05 UTC. A 7pm dinner there is 00:00 UTC on the 19th.
    const now = new Date('2026-10-18T13:05:00Z');
    getEventsForDay.mockImplementation(async (_u: string, d: Date) => {
      const utcDay = d.toISOString().slice(0, 10);
      if (utcDay === '2026-10-18') return [event('standup', '2026-10-18T15:00:00Z')];
      if (utcDay === '2026-10-19')
        return [
          event('dinner', '2026-10-19T00:00:00Z'),
          event('tomorrow', '2026-10-19T14:00:00Z'),
          event('cancelled', '2026-10-19T01:00:00Z', { status: 'cancelled' }),
        ];
      return [event('yesterday', '2026-10-17T20:00:00Z')];
    });
    const { readDay } = await import('../default-deps.js');

    const day = await readDay('uid-seth', {}, 'America/Chicago', now);

    expect(day.events.map((e) => e.title)).toEqual(['standup', 'dinner']);
    // No forget list could be read: no commitments, the privacy-safe side.
    expect(day.commitments).toEqual([]);
  });
});

describe('openTasks', () => {
  it('lists up to three open tasks, soonest due first', async () => {
    const { openTasks } = await import('../default-deps.js');
    const tasks = [
      { title: 'Someday', status: 'pending' },
      { title: 'Done already', status: 'completed', dueDate: '2026-10-01T00:00:00Z' },
      { title: 'Renew passport', status: 'pending', dueDate: '2026-10-20T00:00:00Z' },
      { title: 'Fix the gate', status: 'in_progress', dueDate: '2026-10-19T00:00:00Z' },
      { title: 'Pay rent', status: 'pending', dueDate: '2026-10-25T00:00:00Z' },
    ];
    expect(openTasks({ productivityData: { tasks } })).toEqual([
      'Fix the gate',
      'Renew passport',
      'Pay rent',
    ]);
    expect(openTasks({})).toEqual([]);
  });
});
