/**
 * The voice create tool, through the calendar gate, with a connected calendar
 * (#1749): with the flag on, the create goes to the provider and not to Ferni's
 * list; with it off, the Ferni path runs as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(async () => true),
}));
vi.mock('../../../../services/calendar/provider-writes.js', () => ({
  PROVIDER_LABEL: {
    google: 'Google Calendar',
    outlook: 'Outlook calendar',
    apple: 'Apple calendar',
  },
  connectedWriteProvider: vi.fn(async () => 'google'),
  createOnProvider: vi.fn(async () => ({ ok: true, externalId: 'ext-1' })),
  updateOnProvider: vi.fn(async () => true),
  deleteOnProvider: vi.fn(async () => true),
}));
vi.mock('../../../../services/calendar/index.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createEvent: vi.fn(async () => ({ id: 'local-1' })),
  getEventById: vi.fn(async () => null),
}));

import { createEvent } from '../../../../services/calendar/index.js';
import { createOnProvider } from '../../../../services/calendar/provider-writes.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { smartCalendarTools } from '../calendar-connection-gate.js';

const ctx = { userId: 'user-1' } as unknown as ToolContext;
const create = () => {
  const def = smartCalendarTools.find((d) => d.id === 'createCalendarEvent') as ToolDefinition;
  return def.create(ctx) as { execute: (p: unknown, o: unknown) => Promise<unknown> };
};
const params = { title: 'Lunch with Sam', date: '2026-10-18', startTime: '12:00' };

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.CALENDAR_WRITE_TO_PROVIDER;
});

describe('voice create with a calendar connected', () => {
  it("with the flag on, the create reaches the provider, not Ferni's list", async () => {
    process.env.CALENDAR_WRITE_TO_PROVIDER = 'on';
    const reply = await create().execute(params, {});
    expect(createOnProvider).toHaveBeenCalledTimes(1);
    expect(createEvent).not.toHaveBeenCalled();
    expect(String(reply)).toMatch(/^Added "Lunch with Sam".* to your Google Calendar\.$/);
  });

  it('with the flag off, the create keeps the Ferni path as before', async () => {
    delete process.env.CALENDAR_WRITE_TO_PROVIDER;
    await create().execute(params, {});
    expect(createOnProvider).not.toHaveBeenCalled();
    expect(createEvent).toHaveBeenCalledTimes(1);
  });
});
