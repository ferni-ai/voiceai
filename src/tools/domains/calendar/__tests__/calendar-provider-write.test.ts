/**
 * The calendar write tools write to the caller's connected calendar (#1749).
 *
 * Runs the registered (gated) tools. Mocked: the Google Calendar HTTP client,
 * the unified store's Firestore-backed calls, and the gate's isConnected (its
 * own tests are calendar-connection-gate.test.ts). The provider choice, the
 * Google adapter and the result wording are the real code.
 */
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    safeLog: () => logger,
  };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => config) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// The Google Calendar HTTP boundary.
vi.mock('../../../../services/identity/google-calendar-oauth.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isCalendarConfigured: vi.fn(),
  getValidAccessToken: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));
// The unified store's Firestore-backed calls.
vi.mock('../../../../services/calendar/unified-calendar-store.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createEvent: vi.fn(),
  importExternalEvent: vi.fn(),
  getProviderConnections: vi.fn(),
  getEventById: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));
// The #1547 gate's connection check.
vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(),
}));

import {
  createEvent as googleCreate,
  deleteEvent as googleDelete,
  getValidAccessToken,
  isCalendarConfigured,
  updateEvent as googleUpdate,
} from '../../../../services/identity/google-calendar-oauth.js';
import {
  createEvent as storeCreate,
  deleteEvent as storeDelete,
  getEventById,
  getProviderConnections,
  importExternalEvent,
  updateEvent as storeUpdate,
} from '../../../../services/calendar/unified-calendar-store.js';
import { isConnected } from '../../../../services/calendar/calendar-service.js';
import type { CalendarEvent, ProviderConnection } from '../../../../services/calendar/types.js';
import { notConnectedCreate } from '../../../../services/calendar/not-connected-copy.js';
import { rememberCallerTimeZone } from '../../../../utils/caller-time-zone.js';
import type { ToolContext } from '../../../registry/types.js';
import { smartCalendarTools } from '../calendar-connection-gate.js';

type Exec = { execute: (args: Record<string, unknown>, options?: unknown) => Promise<string> };

const USER = 'provider-write-user';
const ASK = {
  title: 'Dentist',
  date: '2026-11-03',
  startTime: '13:00',
  durationMinutes: 30,
  location: 'Main St',
  description: 'Cleaning',
};
const WHAT = '"Dentist", Tuesday, Nov 3, 1:00 PM your time, 30 minutes';
const COPY_ID = 'evt_g-123';

function tool(id = 'createCalendarEvent'): Exec {
  const def = smartCalendarTools.find((d) => d.id === id)!;
  return def.create({
    userId: USER,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
  } as ToolContext) as unknown as Exec;
}

const stored = (userId: string, title: string, startTime: Date): CalendarEvent => ({
  id: 'evt_1',
  userId,
  title,
  startTime,
  endTime: startTime,
  isAllDay: false,
  attendees: [],
  status: 'confirmed',
  source: 'ferni',
  syncStatus: 'local',
  reminders: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const outlook: ProviderConnection = {
  provider: 'outlook',
  connected: true,
  syncEnabled: true,
  syncDirection: 'two-way',
};

/** Ferni's copies of Google events, as importExternalEvent keeps them, read back by id. */
const copies = new Map<string, CalendarEvent>();

beforeEach(() => {
  vi.clearAllMocks();
  copies.clear();
  rememberCallerTimeZone('America/New_York', USER);
  vi.mocked(isCalendarConfigured).mockResolvedValue(true);
  vi.mocked(isConnected).mockResolvedValue(true);
  vi.mocked(getProviderConnections).mockResolvedValue([]);
  vi.mocked(getValidAccessToken).mockResolvedValue('token-1');
  vi.mocked(googleCreate).mockResolvedValue({
    id: 'g-123',
    summary: 'Dentist',
    start: {},
    end: {},
  });
  vi.mocked(googleUpdate).mockResolvedValue({
    id: 'g-123',
    summary: 'Dentist',
    start: {},
    end: {},
  });
  vi.mocked(googleDelete).mockResolvedValue(undefined);
  vi.mocked(storeCreate).mockImplementation(async (userId, input) =>
    stored(userId, input.title, input.startTime)
  );
  vi.mocked(importExternalEvent).mockImplementation(
    async (userId, source, externalId, calendarId, input) => {
      const copy: CalendarEvent = {
        ...stored(userId, input.title, input.startTime),
        id: `evt_${externalId}`,
        endTime: input.endTime ?? input.startTime,
        attendees: input.attendees ?? [],
        source,
        externalId,
        externalCalendarId: calendarId,
        syncStatus: 'synced',
      };
      copies.set(copy.id, copy);
      return copy;
    }
  );
  vi.mocked(getEventById).mockImplementation(async (_u, id) => copies.get(id) ?? null);
  vi.mocked(storeUpdate).mockImplementation(async (_u, id) => copies.get(id) ?? null);
  vi.mocked(storeDelete).mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createCalendarEvent with a connected calendar (#1749)', () => {
  it('flag off: Google connected still saves to Ferni list with the same result text', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', '');

    const said = await tool().execute(ASK);

    expect(said).toBe(`Saved to the Ferni calendar only, not Google Calendar: ${WHAT}.`);
    expect(storeCreate).toHaveBeenCalledTimes(1);
    expect(googleCreate).not.toHaveBeenCalled();
  });

  it('flag on + Google connected: writes to Google with the mapped fields and names Google', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');

    const said = await tool().execute(ASK);

    expect(said).toBe(`Added to your Google Calendar: ${WHAT}.`);
    expect(googleCreate).toHaveBeenCalledTimes(1);
    const [token, calendarId, sent] = vi.mocked(googleCreate).mock.calls[0];
    expect(token).toBe('token-1');
    expect(calendarId).toBe('primary');
    expect(sent.summary).toBe('Dentist');
    expect(sent.location).toBe('Main St');
    expect(sent.description).toBe('Cleaning');
    expect(sent.start.dateTime).toBe('2026-11-03T18:00:00.000Z');
    expect(sent.end.dateTime).toBe('2026-11-03T18:30:00.000Z');
    // Not saved to Ferni's list as its own event; a copy of the Google event is kept instead.
    expect(storeCreate).not.toHaveBeenCalled();
    expect(importExternalEvent).toHaveBeenCalledWith(
      USER,
      'google',
      'g-123',
      'primary',
      expect.objectContaining({ title: 'Dentist' })
    );
  });

  it('flag on: model-filled attendees never reach Google, and the result says no one was invited', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');

    const said = await tool().execute({
      ...ASK,
      attendees: ['sam@example.com', 'boss@example.com'],
    });

    expect(said).toBe(
      `Added to your Google Calendar: ${WHAT}. I didn't invite anyone, so no invites went out.`
    );
    const sent = vi.mocked(googleCreate).mock.calls[0][2];
    expect(sent.attendees ?? []).toEqual([]);
    expect(JSON.stringify(sent)).not.toContain('example.com');
    expect(importExternalEvent).toHaveBeenCalledWith(
      USER,
      'google',
      'g-123',
      'primary',
      expect.objectContaining({ attendees: [] })
    );
  });

  it("flag on: Ferni's copy failing does not undo the Google write or its result", async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(importExternalEvent).mockRejectedValue(new Error('firestore down'));

    const said = await tool().execute(ASK);

    expect(said).toBe(`Added to your Google Calendar: ${WHAT}.`);
    expect(googleCreate).toHaveBeenCalledTimes(1);
  });

  it('flag on + Google API fails: says it failed, claims nothing, saves nothing', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(googleCreate).mockRejectedValue(new Error('Failed to create event (HTTP 403): no'));

    const said = await tool().execute(ASK);

    expect(said).toMatch(/^I couldn't add "Dentist" to your Google Calendar/);
    expect(said).not.toContain('reconnecting');
    expect(said).not.toMatch(/\bAdded\b|\bSaved\b/);
    expect(storeCreate).not.toHaveBeenCalled();
    expect(importExternalEvent).not.toHaveBeenCalled();
  });

  it('flag on + tokens stored but none valid: says the connection needs reconnecting', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(getValidAccessToken).mockResolvedValue(null);

    const said = await tool().execute(ASK);

    expect(said).toBe(
      `I couldn't add "Dentist" to your Google Calendar, since the Google Calendar connection needs reconnecting, so it isn't on your calendar. Nothing was saved.`
    );
    expect(googleCreate).not.toHaveBeenCalled();
    expect(storeCreate).not.toHaveBeenCalled();
  });

  it('flag on + nothing connected: Ferni list, with the not-connected line', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(isCalendarConfigured).mockResolvedValue(false);
    vi.mocked(isConnected).mockResolvedValue(false);

    const said = await tool().execute(ASK);

    expect(said).toBe(notConnectedCreate('Dentist, 2026-11-03, 13:00'));
    expect(storeCreate).toHaveBeenCalledTimes(1);
    expect(googleCreate).not.toHaveBeenCalled();
  });

  it('flag on + Outlook connected: Ferni list, and the result says it is not on their calendar', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(isCalendarConfigured).mockResolvedValue(false);
    vi.mocked(getProviderConnections).mockResolvedValue([outlook]);

    const said = await tool().execute(ASK);

    expect(said).toBe(
      `Saved to Ferni's own list: ${WHAT}. It isn't on your calendar, since I can't add to Outlook yet.`
    );
    expect(storeCreate).toHaveBeenCalledTimes(1);
    expect(googleCreate).not.toHaveBeenCalled();
  });
});

describe('updating and deleting an event created on Google Calendar (#1749)', () => {
  const MOVE = { eventId: COPY_ID, date: '2026-11-03', startTime: '15:00' };

  beforeEach(async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    await tool().execute(ASK);
    expect(copies.has(COPY_ID)).toBe(true);
  });

  it('update after create: changes it on Google, keeps its length, then the copy', async () => {
    const said = await tool('updateCalendarEvent').execute(MOVE);

    expect(said).toBe(
      'Updated on your Google Calendar. Dentist is now scheduled for Tuesday, Nov 3, 3:00 PM your time.'
    );
    expect(googleUpdate).toHaveBeenCalledTimes(1);
    const [token, calendarId, googleId, sent] = vi.mocked(googleUpdate).mock.calls[0];
    expect([token, calendarId, googleId]).toEqual(['token-1', 'primary', 'g-123']);
    expect(sent.start?.dateTime).toBe('2026-11-03T20:00:00.000Z');
    expect(sent.end?.dateTime).toBe('2026-11-03T20:30:00.000Z');
    expect(storeUpdate).toHaveBeenCalledWith(
      USER,
      COPY_ID,
      expect.objectContaining({ endTime: new Date('2026-11-03T20:30:00.000Z') })
    );
  });

  it('update after create, Google refuses: says so, and the copy is left alone', async () => {
    vi.mocked(googleUpdate).mockRejectedValue(new Error('Failed to update event: 500'));

    const said = await tool('updateCalendarEvent').execute(MOVE);

    expect(said).toBe(
      `I couldn't change "Dentist" on your Google Calendar, so it's unchanged there.`
    );
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('update of a Google event with guests: not changed, and says why', async () => {
    copies.set(COPY_ID, { ...copies.get(COPY_ID)!, attendees: ['sam@example.com'] });

    const said = await tool('updateCalendarEvent').execute(MOVE);

    expect(said).toMatch(
      /^I couldn't change "Dentist" on your Google Calendar, since it has guests/
    );
    expect(googleUpdate).not.toHaveBeenCalled();
    expect(storeUpdate).not.toHaveBeenCalled();
  });

  it('delete after create: removes it from Google, then the copy', async () => {
    const said = await tool('deleteCalendarEvent').execute({ eventId: COPY_ID });

    expect(said).toBe('Dentist has been removed from your Google Calendar.');
    expect(googleDelete).toHaveBeenCalledWith('token-1', 'primary', 'g-123');
    expect(storeDelete).toHaveBeenCalledWith(USER, COPY_ID);
  });

  it('delete after create, connection dead: says reconnect, removes nothing', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null);

    const said = await tool('deleteCalendarEvent').execute({ eventId: COPY_ID });

    expect(said).toBe(
      `I couldn't remove "Dentist" from your Google Calendar, since the Google Calendar connection needs reconnecting, so it's still there.`
    );
    expect(googleDelete).not.toHaveBeenCalled();
    expect(storeDelete).not.toHaveBeenCalled();
  });

  it('flag off: update and delete touch only the store, with the old lines', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', '');

    const updated = await tool('updateCalendarEvent').execute(MOVE);
    const deleted = await tool('deleteCalendarEvent').execute({ eventId: COPY_ID });

    expect(updated).toMatch(/^Updated\. Dentist is now scheduled for /);
    expect(deleted).toBe('The event has been removed from your calendar.');
    expect(googleUpdate).not.toHaveBeenCalled();
    expect(googleDelete).not.toHaveBeenCalled();
    expect(storeUpdate).toHaveBeenCalledTimes(1);
    expect(storeDelete).toHaveBeenCalledTimes(1);
  });
});
