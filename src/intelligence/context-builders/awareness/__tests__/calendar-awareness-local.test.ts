/**
 * Calendar awareness with no calendar connected still names Ferni's own list,
 * labelled, so the model does not forget a meeting the user made (#1547).
 */
import { describe, expect, it, vi } from 'vitest';
import { CANONICAL_IDS } from '../../../../personas/persona-ids.js';

vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(async () => false),
  getDayOverview: vi.fn(async () => ({
    events: [
      {
        id: 'e1',
        title: 'Lunch with Sam',
        startTime: new Date('2026-10-17T16:00:00.000Z'),
        endTime: new Date('2026-10-17T17:00:00.000Z'),
        isAllDay: false,
      },
    ],
    totalMeetings: 1,
  })),
}));

import { buildCalendarAwarenessContext } from '../calendar-awareness.js';

describe('buildCalendarAwarenessContext with no calendar connected', () => {
  it("names the items on Ferni's own list, labelled as Ferni's list", async () => {
    const context = await buildCalendarAwarenessContext('user-1', CANONICAL_IDS.COMMUNICATOR);
    expect(context.isConnected).toBe(false);
    expect(context.contextInjection).toMatch(/No calendar is connected/);
    expect(context.contextInjection).toMatch(/Ferni's own list today: .*Lunch with Sam/);
  });
});
