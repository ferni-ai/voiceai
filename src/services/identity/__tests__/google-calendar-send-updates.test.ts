/**
 * Ferni's Google Calendar writes never email the event's guests. Nobody
 * confirmed who they are, so a create, change or delete must not send them an
 * invitation, an update or a cancellation (sendUpdates=none).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEvent, deleteEvent, updateEvent } from '../google-calendar-oauth.js';

const fetchMock = vi.fn();
const event = {
  summary: 'Lunch with Sam',
  start: { dateTime: '2026-10-18T16:00:00Z' },
  end: { dateTime: '2026-10-18T17:00:00Z' },
  attendees: [{ email: 'sam@example.com' }],
};

const calledUrl = () => new URL(String(fetchMock.mock.calls[0][0]));

beforeEach(() => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'ext-1', ...event })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('Google Calendar writes send no notifications', () => {
  it('a create', async () => {
    await createEvent('token', 'primary', event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl().pathname).toBe('/calendar/v3/calendars/primary/events');
    expect(calledUrl().searchParams.get('sendUpdates')).toBe('none');
  });

  it('a change', async () => {
    await updateEvent('token', 'primary', 'ext-1', { summary: 'Lunch with Sam and Jo' });
    expect(calledUrl().pathname).toBe('/calendar/v3/calendars/primary/events/ext-1');
    expect(calledUrl().searchParams.get('sendUpdates')).toBe('none');
  });

  it('a delete', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteEvent('token', 'primary', 'ext-1');
    expect(calledUrl().pathname).toBe('/calendar/v3/calendars/primary/events/ext-1');
    expect(calledUrl().searchParams.get('sendUpdates')).toBe('none');
  });
});
