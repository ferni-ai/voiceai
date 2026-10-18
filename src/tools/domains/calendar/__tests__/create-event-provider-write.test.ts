/**
 * createCalendarEvent writes to the caller's connected calendar (#1749).
 *
 * Runs the registered (gated) tool. Mocked: the Google Calendar HTTP client,
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
}));
// The unified store's Firestore-backed calls.
vi.mock('../../../../services/calendar/unified-calendar-store.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createEvent: vi.fn(),
  importExternalEvent: vi.fn(),
  getProviderConnections: vi.fn(),
}));
// The #1547 gate's connection check.
vi.mock('../../../../services/calendar/calendar-service.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isConnected: vi.fn(),
}));

import {
  createEvent as googleCreate,
  getValidAccessToken,
  isCalendarConfigured,
} from '../../../../services/identity/google-calendar-oauth.js';
import {
  createEvent as storeCreate,
  getProviderConnections,
  importExternalEvent,
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
  attendees: ['sam@example.com'],
};
const WHAT = '"Dentist", Tuesday, Nov 3, 1:00 PM your time, 30 minutes';

function createTool(): Exec {
  const def = smartCalendarTools.find((d) => d.id === 'createCalendarEvent')!;
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

describe('createCalendarEvent with a connected calendar (#1749)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(storeCreate).mockImplementation(async (userId, input) =>
      stored(userId, input.title, input.startTime)
    );
    vi.mocked(importExternalEvent).mockImplementation(async (userId, _p, _id, _cal, input) =>
      stored(userId, input.title, input.startTime)
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('flag off: Google connected still saves to Ferni list with the same result text', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', '');

    const said = await createTool().execute(ASK);

    expect(said).toBe(`Saved to the Ferni calendar only, not Google Calendar: ${WHAT}.`);
    expect(storeCreate).toHaveBeenCalledTimes(1);
    expect(googleCreate).not.toHaveBeenCalled();
  });

  it('flag on + Google connected: writes to Google with the mapped fields and names Google', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');

    const said = await createTool().execute(ASK);

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
    expect(sent.attendees).toEqual([{ email: 'sam@example.com' }]);
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

  it("flag on: Ferni's copy failing does not undo the Google write or its result", async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(importExternalEvent).mockRejectedValue(new Error('firestore down'));

    const said = await createTool().execute(ASK);

    expect(said).toBe(`Added to your Google Calendar: ${WHAT}.`);
    expect(googleCreate).toHaveBeenCalledTimes(1);
  });

  it('flag on + Google API fails: says it failed, claims nothing, saves nothing', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(googleCreate).mockRejectedValue(new Error('Failed to create event: 403'));

    const said = await createTool().execute(ASK);

    expect(said).toMatch(/^I couldn't add "Dentist" to your Google Calendar/);
    expect(said).not.toMatch(/\bAdded\b|\bSaved\b/);
    expect(storeCreate).not.toHaveBeenCalled();
    expect(importExternalEvent).not.toHaveBeenCalled();
  });

  it('flag on + Google token cannot be refreshed: says it failed', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(getValidAccessToken).mockResolvedValue(null);

    const said = await createTool().execute(ASK);

    expect(said).toMatch(/^I couldn't add "Dentist" to your Google Calendar/);
    expect(googleCreate).not.toHaveBeenCalled();
    expect(storeCreate).not.toHaveBeenCalled();
  });

  it('flag on + nothing connected: Ferni list, with the not-connected line', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(isCalendarConfigured).mockResolvedValue(false);
    vi.mocked(isConnected).mockResolvedValue(false);

    const said = await createTool().execute(ASK);

    expect(said).toBe(notConnectedCreate('Dentist, 2026-11-03, 13:00'));
    expect(storeCreate).toHaveBeenCalledTimes(1);
    expect(googleCreate).not.toHaveBeenCalled();
  });

  it('flag on + Outlook connected: Ferni list, and the result says it is not on their calendar', async () => {
    vi.stubEnv('CALENDAR_PROVIDER_WRITE', 'on');
    vi.mocked(isCalendarConfigured).mockResolvedValue(false);
    vi.mocked(getProviderConnections).mockResolvedValue([outlook]);

    const said = await createTool().execute(ASK);

    expect(said).toBe(
      `Saved to Ferni's own list: ${WHAT}. It isn't on your calendar, since I can't add to Outlook yet.`
    );
    expect(storeCreate).toHaveBeenCalledTimes(1);
    expect(googleCreate).not.toHaveBeenCalled();
  });
});
