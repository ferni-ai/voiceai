/**
 * A reminder's words stay out of the logs below the tools, too (#4325 review, round 3).
 * setReminder and recurringReminder hand the caller's message to createReminder, which syncs
 * it to the calendar: the calendar bridge, then the calendar service. Each row runs that real
 * path (the scheduler, the bridge and the service), with the reminder store, the calendar
 * stores and Google stubbed, under prod settings and under dev's (dev's database with
 * LOG_FULL_RESPONSES on, where replyForLog shows text). It records every argument of every
 * log call, and the child bindings, and checks that none holds the invented words.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => {
  interface Call {
    level: string;
    bindings: Record<string, unknown>;
    args: unknown[];
  }
  const calls: Call[] = [];
  const make = (bindings: Record<string, unknown>): Record<string, unknown> => {
    const logger: Record<string, unknown> = {};
    for (const level of ['info', 'warn', 'error', 'debug', 'trace', 'fatal']) {
      logger[level] = (...args: unknown[]) => calls.push({ level, bindings, args });
    }
    logger.child = (more: Record<string, unknown>) => make({ ...bindings, ...more });
    return logger;
  };
  /** A Firestore that takes every write, or fails each one when `failStore` is set. */
  const state = { failStore: false, google: false, unifiedThrows: false };
  const ref = (): Record<string, unknown> => ({
    collection: () => ({ doc: () => ref() }),
    set: async () => {
      if (state.failStore) throw new Error('store unavailable');
    },
  });
  const event = (title: unknown): Record<string, unknown> => ({
    id: 'event-1',
    title,
    startTime: new Date('2026-12-01T09:00:00Z'),
    endTime: new Date('2026-12-01T09:15:00Z'),
    status: 'confirmed',
    source: 'ferni',
  });
  return {
    calls,
    logger: make({}),
    db: { collection: () => ({ doc: () => ref() }) },
    state,
    event,
  };
});

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => cap.logger,
  safeLog: () => cap.logger,
  createLogger: () => cap.logger,
}));
vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => cap.db,
}));
vi.mock('../../data-layer/hooks/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  onReminderChange: () => undefined,
}));
vi.mock('../../identity/google-calendar-oauth.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isCalendarConfigured: async () => cap.state.google,
  getValidAccessToken: async () => 'token-1',
  getEvents: async () => [],
  createEvent: async (_token: string, _calendarId: string, e: { summary?: string }) => ({
    id: 'google-1',
    summary: e.summary,
    start: { dateTime: '2026-12-01T09:00:00Z' },
    end: { dateTime: '2026-12-01T09:15:00Z' },
  }),
}));
vi.mock('../../calendar/unified-calendar-store.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEvents: async () => [],
  getEventsForDay: async () => [],
  hasAnyProviderConnected: async () => false,
  createEvent: async (_userId: string, input: { title: string }) => {
    if (cap.state.unifiedThrows) throw new Error('calendar store unavailable');
    return cap.event(input.title);
  },
}));

const { createReminder } = await import('../reminder-scheduler.js');
const { replyForLog } = await import('../../../utils/reply-for-log.js');

/** Invented words for the reminder's message. */
const WORD = 'oatfield';
const MESSAGE = 'pick up the oatfield seed order for Riley';
const USER = 'riley-test-1';
const AT = new Date('2026-12-01T09:00:00Z');

/** What setReminder passes for a voice reminder (reminders.ts, the createReminder call). */
const setReminderArgs = {
  userId: USER,
  message: MESSAGE,
  scheduledFor: AT,
  timezone: 'America/New_York',
  deliveryMethod: 'voice_message' as const,
  deliveryAddress: `voice:${USER}`,
  createdBy: 'ferni',
  personaId: 'ferni',
};
/** What recurringReminder passes for its first occurrence (advanced-reminders.ts). */
const recurringReminderArgs = {
  userId: USER,
  message: MESSAGE,
  scheduledFor: AT,
  timezone: 'America/New_York',
  deliveryMethod: 'voice_message' as const,
  deliveryAddress: `voice:${USER}`,
  createdBy: 'ferni',
};

/** Errors keep their message and stack, so text inside one is still seen. */
const asText = (): string =>
  JSON.stringify(cap.calls, (_k, v: unknown) =>
    v instanceof Error ? { message: v.message, stack: v.stack } : v
  ).toLowerCase();

/** The fields of the one captured line with this message; fails the row if it never logged. */
function line(msg: string): Record<string, unknown> {
  const found = cap.calls.find((c) => c.args.includes(msg));
  expect(found, `no log line "${msg}"`).toBeDefined();
  const fields = found?.args.find((a) => typeof a === 'object' && a !== null) ?? {};
  return { ...found?.bindings, ...(fields as Record<string, unknown>) };
}

/** Every argument of every log call, and every binding: none holds the words. */
function nothingSaid(): void {
  expect(cap.calls.length).toBeGreaterThan(0);
  expect(asText()).not.toContain(WORD);
}

const SETTINGS: Array<[string, Record<string, string>]> = [
  ['prod', { FIRESTORE_DATABASE: '', LOG_FULL_RESPONSES: '' }],
  ['dev', { FIRESTORE_DATABASE: 'ferni-dev', LOG_FULL_RESPONSES: 'true' }],
];

describe.each(SETTINGS)('a reminder synced to the calendar, %s settings', (name, env) => {
  beforeEach(() => {
    cap.calls.length = 0;
    Object.assign(cap.state, { failStore: false, google: false, unifiedThrows: false });
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('the settings took effect: replyForLog shows text only on dev', () => {
    expect(replyForLog(MESSAGE)).toBe(name === 'dev' ? MESSAGE : `[${MESSAGE.length} chars]`);
  });

  it("setReminder's reminder on the Ferni calendar: lengths in bridge and service", async () => {
    await createReminder(setReminderArgs);
    expect(line('🌉 Calendar bridge: creating synced item').titleLength).toBe(MESSAGE.length);
    const eventTitle = line('Unified calendar event created').titleLength;
    expect(eventTitle).toBeGreaterThan(MESSAGE.length); // the bridge's prefix + the message
    line('📅 Scheduled item synced to calendar');
    nothingSaid();
  });

  it("recurringReminder's first occurrence, with Google connected", async () => {
    cap.state.google = true;
    await createReminder(recurringReminderArgs);
    expect(line('🌉 Calendar bridge: creating synced item').titleLength).toBe(MESSAGE.length);
    expect(line('Google Calendar event created').titleLength).toBeGreaterThan(MESSAGE.length);
    line('📅 Scheduled item synced to calendar');
    nothingSaid();
  });

  it('the store-failure fallback still syncs, and the calendar failing logs a length', async () => {
    cap.state.failStore = true;
    await createReminder(setReminderArgs);
    line('Firestore not available for reminders, using in-memory');
    expect(line('Unified calendar event created').titleLength).toBeGreaterThan(MESSAGE.length);
    nothingSaid();
    cap.calls.length = 0;
    cap.state.unifiedThrows = true;
    await createReminder(recurringReminderArgs);
    expect(line('Calendar sync failed').titleLength).toBe(MESSAGE.length);
    nothingSaid();
  });
});
