/**
 * The legacy fallback's schedule read with no calendar connected (#1547).
 * It used to guard on isConnected(), which always said yes, and read an
 * empty list as "clear".
 */
import { describe, expect, it, vi } from 'vitest';

const connected = vi.hoisted(() => ({ value: false }));

vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(async () => connected.value),
  getEventsForDay: vi.fn(async () => [
    {
      id: 'e1',
      title: 'Standup with Priya',
      startTime: new Date('2026-10-17T15:00:00Z'),
      endTime: new Date('2026-10-17T15:30:00Z'),
      isAllDay: false,
    },
  ]),
}));

import { executeLegacyFallback } from '../legacy-fallback-executor.js';

const ctx = { userId: 'user-1', sessionId: 's-1', personaId: 'ferni' } as never;

describe('legacy schedule read with no calendar connected', () => {
  it('says no calendar is connected and quotes no events', async () => {
    connected.value = false;
    const out = String(await executeLegacyFallback('getSchedule', {}, ctx));
    expect(out).toMatch(/isn't connected/);
    expect(out).not.toMatch(/Standup|clear/i);
  });

  it('reads the calendar once one is connected', async () => {
    connected.value = true;
    const out = String(await executeLegacyFallback('getSchedule', {}, ctx));
    expect(out).toMatch(/Standup with Priya/);
  });
});
