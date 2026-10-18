/**
 * Voice writes go to the connected calendar only when CALENDAR_WRITE_TO_PROVIDER
 * is on (#1749). Each reply says where the write went, or that it failed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/calendar/provider-writes.js', () => ({
  PROVIDER_LABEL: {
    google: 'Google Calendar',
    outlook: 'Outlook calendar',
    apple: 'Apple calendar',
  },
  connectedWriteProvider: vi.fn(),
  createOnProvider: vi.fn(),
  updateOnProvider: vi.fn(),
  deleteOnProvider: vi.fn(),
}));
vi.mock('../../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getEventById: vi.fn(),
}));

import { getEventById } from '../../../../services/calendar/index.js';
import {
  connectedWriteProvider,
  createOnProvider,
  deleteOnProvider,
  updateOnProvider,
} from '../../../../services/calendar/provider-writes.js';
import type { ToolContext } from '../../../registry/types.js';
import { routeWriteToProvider } from '../provider-routing.js';

const ctx = { userId: 'user-1', userTimeZone: 'UTC' } as unknown as ToolContext;
const createParams = { title: 'Lunch with Sam', date: '2026-10-18', startTime: '12:00' };
const storedEvent = {
  id: 'e1',
  userId: 'user-1',
  title: 'Standup',
  startTime: new Date('2026-10-18T15:00:00Z'),
  endTime: new Date('2026-10-18T15:30:00Z'),
  source: 'google',
  externalId: 'ext-1',
  externalCalendarId: 'primary',
};

beforeEach(() => {
  process.env.CALENDAR_WRITE_TO_PROVIDER = 'on';
  vi.mocked(connectedWriteProvider).mockResolvedValue('google');
  vi.mocked(createOnProvider).mockResolvedValue({ ok: true, externalId: 'ext-9' });
  vi.mocked(updateOnProvider).mockResolvedValue(true);
  vi.mocked(deleteOnProvider).mockResolvedValue(true);
  vi.mocked(getEventById).mockResolvedValue(storedEvent as never);
});
afterEach(() => {
  delete process.env.CALENDAR_WRITE_TO_PROVIDER;
  vi.clearAllMocks();
});

describe('routeWriteToProvider', () => {
  it('keeps the Ferni path when the flag is off', async () => {
    delete process.env.CALENDAR_WRITE_TO_PROVIDER;
    expect(
      await routeWriteToProvider('createCalendarEvent', 'user-1', createParams, ctx)
    ).toBeNull();
    expect(createOnProvider).not.toHaveBeenCalled();
  });

  it('keeps the Ferni path when nothing is connected', async () => {
    vi.mocked(connectedWriteProvider).mockResolvedValue(null);
    expect(
      await routeWriteToProvider('createCalendarEvent', 'user-1', createParams, ctx)
    ).toBeNull();
  });

  it('a create goes to the provider and the reply names it', async () => {
    const reply = await routeWriteToProvider('createCalendarEvent', 'user-1', createParams, ctx);
    expect(createOnProvider).toHaveBeenCalledWith(
      'user-1',
      'google',
      expect.objectContaining({ title: 'Lunch with Sam', source: 'google', isAllDay: false })
    );
    expect(reply).toMatch(/^Added "Lunch with Sam", .* to your Google Calendar\.$/);
  });

  it('a failed create says it was not added, and never claims it was', async () => {
    vi.mocked(createOnProvider).mockResolvedValue({ ok: false });
    const reply = await routeWriteToProvider('createCalendarEvent', 'user-1', createParams, ctx);
    expect(reply).toMatch(/^I couldn't add "Lunch with Sam" to your Google Calendar/);
    expect(reply).not.toMatch(/^Added/);
  });

  it('a delete removes the stored event from its provider', async () => {
    const reply = await routeWriteToProvider(
      'deleteCalendarEvent',
      'user-1',
      { eventId: 'e1' },
      ctx
    );
    expect(deleteOnProvider).toHaveBeenCalledWith('user-1', 'google', 'ext-1', 'primary');
    expect(reply).toBe('Removed "Standup" from your Google Calendar.');
  });

  it('a failed delete says the event is still there', async () => {
    vi.mocked(deleteOnProvider).mockResolvedValue(false);
    const reply = await routeWriteToProvider(
      'deleteCalendarEvent',
      'user-1',
      { eventId: 'e1' },
      ctx
    );
    expect(reply).toBe(
      'I couldn\'t remove "Standup" from your Google Calendar. It\'s still there.'
    );
  });

  it('an update changes the title on the provider', async () => {
    const reply = await routeWriteToProvider(
      'updateCalendarEvent',
      'user-1',
      { eventId: 'e1', title: 'Standup (moved)' },
      ctx
    );
    expect(updateOnProvider).toHaveBeenCalledWith(
      'user-1',
      'google',
      expect.objectContaining({ title: 'Standup (moved)', externalId: 'ext-1' })
    );
    expect(reply).toBe('Updated "Standup (moved)" on your Google Calendar.');
  });

  it("an item that only lives on Ferni's list keeps the Ferni path", async () => {
    vi.mocked(getEventById).mockResolvedValue({ ...storedEvent, externalId: undefined } as never);
    expect(
      await routeWriteToProvider('deleteCalendarEvent', 'user-1', { eventId: 'e1' }, ctx)
    ).toBeNull();
    expect(deleteOnProvider).not.toHaveBeenCalled();
  });
});
