/**
 * The CEO briefing with no calendar connected names Ferni's own list, labelled
 * (#1547).
 */
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ connected: false }));

vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(async () => state.connected),
}));
vi.mock('../../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getEventsForDay: vi.fn(async () => [
    {
      id: 'e1',
      title: 'Lunch with Sam',
      startTime: new Date('2026-10-18T16:00:00.000Z'),
      endTime: new Date('2026-10-18T17:00:00.000Z'),
      isAllDay: false,
    },
  ]),
}));

import { getTodayCalendarSummary } from '../briefing-tools.js';

describe('CEO briefing calendar summary', () => {
  it("with nothing connected, names Ferni's own list, labelled", async () => {
    state.connected = false;
    const summary = await getTodayCalendarSummary('user-1');
    expect(summary).toMatch(
      /^No calendar is connected\. On Ferni's own list today: .*Lunch with Sam\.$/
    );
  });

  it('with a calendar connected, lists the real events', async () => {
    state.connected = true;
    const summary = await getTodayCalendarSummary('user-1');
    expect(summary).toMatch(/Lunch with Sam/);
    expect(summary).not.toMatch(/No calendar is connected/);
  });
});
