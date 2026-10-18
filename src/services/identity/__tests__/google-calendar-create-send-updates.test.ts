/**
 * Creating a Google Calendar event never asks Google to email the guests
 * (#1749): sendUpdates is set to none explicitly rather than left to Google's
 * default, since an invitation is a message sent on the caller's behalf.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
  };
});

import { createEvent } from '../google-calendar-oauth.js';

describe('google-calendar-oauth createEvent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts with sendUpdates=none', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: 'g-1', start: {}, end: {} }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const created = await createEvent('token-1', 'primary', {
      summary: 'Dentist',
      start: { dateTime: '2026-11-03T18:00:00.000Z' },
      end: { dateTime: '2026-11-03T18:30:00.000Z' },
    });

    expect(created.id).toBe('g-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/calendar/v3/calendars/primary/events');
    expect(url.searchParams.get('sendUpdates')).toBe('none');
  });
});
