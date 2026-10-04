/**
 * Calendar writes act on the verified caller, never on the user a body names.
 *
 * Before: the router took `body.userId || body.user_id || <verified caller>`,
 * so a body naming someone else won — with or without credentials — and every
 * handler below it (status, selection, conflict, provider, schedule,
 * notification preferences) acted on that person's calendar. The Outlook
 * callback likewise took the user straight from ?state=.
 *
 * These tests drive the real router and handlers; only the auth verifier and
 * the calendar data services are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const data = vi.hoisted(() => ({
  deleteUserTokens: vi.fn(),
  updateSelectedCalendars: vi.fn(),
  resolveConflict: vi.fn(),
  autoResolveConflicts: vi.fn(),
  setResolutionPreference: vi.fn(),
  storeCredentials: vi.fn(),
  findFreeTimeSlots: vi.fn(),
  setNotificationPreference: vi.fn(),
  outlookAuthCallback: vi.fn(),
}));

vi.mock('../../services/identity/google-calendar-oauth.js', () => ({
  isCalendarConfigured: vi.fn(() => true),
  deleteUserTokens: data.deleteUserTokens,
}));
vi.mock('../../services/calendar/webhooks/google-webhook.js', () => ({
  stopAllUserChannels: vi.fn(),
}));
vi.mock('../../services/calendar/calendar-selection.js', () => ({
  getSelectedCalendars: vi.fn(),
  updateSelectedCalendars: data.updateSelectedCalendars,
}));
vi.mock('../../services/calendar/conflict-resolver.js', () => ({
  getPendingConflicts: vi.fn(),
  getConflictSummary: vi.fn(),
  resolveConflict: data.resolveConflict,
  dismissConflict: vi.fn(),
  autoResolveConflicts: data.autoResolveConflicts,
  getResolutionPreference: vi.fn(),
  setResolutionPreference: data.setResolutionPreference,
}));
vi.mock('../../services/calendar/providers/apple-provider.js', () => ({
  appleCalendarProvider: { storeCredentials: data.storeCredentials },
}));
vi.mock('../../services/calendar/providers/outlook-provider.js', () => ({
  outlookCalendarProvider: { handleAuthCallback: data.outlookAuthCallback },
}));
vi.mock('../../services/calendar/polling/apple-polling.js', () => ({
  registerUser: vi.fn(),
  unregisterUser: vi.fn(),
  pollUser: vi.fn(),
}));
vi.mock('../../services/calendar/calendar-service.js', () => ({
  isConnected: vi.fn(),
  getDayOverview: vi.fn(),
  getWeekOverview: vi.fn(),
  getEventsForDay: vi.fn(),
  findFreeTimeSlots: data.findFreeTimeSlots,
  createEvent: vi.fn(),
}));
vi.mock('../../services/calendar/notification-preferences.js', () => ({
  setNotificationPreference: data.setNotificationPreference,
  getNotificationPreferences: vi.fn(),
}));

// The verifier: "Bearer <uid>" is a verified token for <uid>; admin-uid is an admin.
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    const userId = header.slice(7);
    return { userId, isAdmin: userId === 'admin-uid' };
  }),
}));

import { handleCalendarRoutes } from '../calendar-routes/index.js';

interface Result {
  status: number;
  body: Record<string, unknown>;
}

/** A real one-shot request stream, with the headers bindVerifiedIdentity leaves behind. */
async function call(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  caller: string | null
): Promise<Result> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = { 'content-type': 'application/json' };
  if (caller) {
    req.headers.authorization = `Bearer ${caller}`;
    req.headers['x-firebase-uid'] = caller;
  }
  stream.end(body ? JSON.stringify(body) : '');

  const out: Result = { status: 200, body: {} };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    end: vi.fn((d?: string) => {
      out.body = d ? (JSON.parse(d) as Record<string, unknown>) : {};
    }),
  } as unknown as ServerResponse;

  const url = new URL(`http://x${path}`);
  await handleCalendarRoutes(req, res, url.pathname, url);
  return out;
}

const WRITES = [
  {
    name: 'disconnect (router → status handler)',
    method: 'POST',
    path: '/api/calendar/disconnect',
    body: {},
    spy: data.deleteUserTokens,
  },
  {
    name: 'calendar selection (selection handler)',
    method: 'POST',
    path: '/api/calendar/google/calendars/select',
    body: { calendar_ids: ['work'] },
    spy: data.updateSelectedCalendars,
  },
  {
    name: 'resolve a conflict (conflict handler)',
    method: 'POST',
    path: '/api/calendar/conflicts/c1/resolve',
    body: { resolution: 'ferni-wins' },
    spy: data.resolveConflict,
  },
  {
    name: 'auto-resolve conflicts (conflict handler)',
    method: 'POST',
    path: '/api/calendar/conflicts/auto-resolve',
    body: { strategy: 'newest-wins' },
    spy: data.autoResolveConflicts,
  },
  {
    name: 'resolution preference (conflict handler, PUT)',
    method: 'PUT',
    path: '/api/calendar/conflicts/preference',
    body: { strategy: 'manual' },
    spy: data.setResolutionPreference,
  },
  {
    name: 'Apple connect (provider handler)',
    method: 'POST',
    path: '/api/calendar/apple/connect',
    body: { apple_id: 'me@icloud.com', app_password: 'abcd-efgh-ijkl-mnop' },
    spy: data.storeCredentials,
  },
  {
    name: 'block focus time (schedule handler)',
    method: 'POST',
    path: '/api/calendar/block-focus',
    body: { durationMinutes: 30 },
    spy: data.findFreeTimeSlots,
  },
  {
    name: 'notification preferences (router)',
    method: 'POST',
    path: '/api/calendar/notification-preferences',
    body: { setting: 'morningBriefing', enabled: false },
    spy: data.setNotificationPreference,
  },
];

const allData = Object.values(data);

function calledFor(userId: string): boolean {
  return allData.some((fn) => fn.mock.calls.some((args) => args[0] === userId));
}

describe('calendar writes act only on the verified caller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    data.deleteUserTokens.mockResolvedValue(undefined);
    data.updateSelectedCalendars.mockResolvedValue({ success: true, calendars: [] });
    data.resolveConflict.mockResolvedValue({ success: true });
    data.autoResolveConflicts.mockResolvedValue({ resolved: 0 });
    data.setResolutionPreference.mockResolvedValue(true);
    data.storeCredentials.mockResolvedValue(false);
    data.findFreeTimeSlots.mockResolvedValue([]);
    data.setNotificationPreference.mockResolvedValue(undefined);
  });

  for (const route of WRITES) {
    for (const key of ['userId', 'user_id']) {
      it(`${route.name}: signed-in alice naming bob in body.${key} gets 403; bob untouched`, async () => {
        const { status } = await call(
          route.method,
          route.path,
          { ...route.body, [key]: 'bob' },
          'alice'
        );

        expect(status).toBe(403);
        expect(route.spy).not.toHaveBeenCalled();
        expect(calledFor('bob')).toBe(false);
      });

      it(`${route.name}: no credentials and body.${key} naming bob gets 401; bob untouched`, async () => {
        const { status } = await call(
          route.method,
          route.path,
          { ...route.body, [key]: 'bob' },
          null
        );

        expect(status).toBe(401);
        expect(calledFor('bob')).toBe(false);
      });
    }

    it(`${route.name}: alice naming herself (as the web does) still works`, async () => {
      const { status } = await call(
        route.method,
        route.path,
        { ...route.body, user_id: 'alice' },
        'alice'
      );

      expect(status).not.toBe(401);
      expect(status).not.toBe(403);
      expect(route.spy.mock.calls[0]?.[0]).toBe('alice');
    });
  }

  it('a verified admin may act for the user the body names', async () => {
    const { status } = await call(
      'POST',
      '/api/calendar/disconnect',
      { userId: 'bob' },
      'admin-uid'
    );

    expect(status).toBe(200);
    expect(data.deleteUserTokens).toHaveBeenCalledWith('bob');
  });

  it('the Outlook callback no longer takes the user from ?state=', async () => {
    const { status } = await call(
      'GET',
      '/api/calendar/outlook/callback?code=attacker-code&state=bob',
      null,
      null
    );

    expect(status).toBe(401);
    expect(data.outlookAuthCallback).not.toHaveBeenCalled();
  });
});
