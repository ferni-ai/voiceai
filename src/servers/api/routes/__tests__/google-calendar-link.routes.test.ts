/**
 * Google Calendar linking binds to the verified caller: the web client fetches
 * /auth/google/calendar?format=json with its auth headers and gets the Google
 * URL, whose state carries that user (not the query userId).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it, vi } from 'vitest';

const caller = vi.hoisted(() => ({ id: null as string | null }));
vi.mock('../../../../api/identity-guard.js', () => ({
  requestUserId: vi.fn(() => caller.id),
  isAnonymousIdentity: vi.fn((id: string) => id.startsWith('device:')),
}));
const states = vi.hoisted(() => ({ created: [] as Array<{ user_id: string }> }));
vi.mock('../../../../utils/ddos-protection.js', () => ({
  createOAuthStateManager: () => ({
    create: (data: { user_id: string }) => {
      states.created.push(data);
      return 'state123';
    },
    consume: vi.fn(),
  }),
}));
vi.mock('../../../token/oauth/google-calendar.js', () => ({
  isConfigured: () => true,
  buildAuthUrl: (state: string) => `https://accounts.google.com/o?state=${state}`,
}));
vi.mock('../../../../services/identity/google-calendar-oauth.js', () => ({
  deleteUserTokens: vi.fn(),
  getUserTokens: vi.fn(),
}));
vi.mock('../../../../services/calendar/webhooks/google-webhook.js', () => ({
  createWatchChannel: vi.fn(),
  stopAllUserChannels: vi.fn(),
}));

const { handleGoogleCalendarRoutes } = await import('../google-calendar.js');

async function get(path: string) {
  const url = new URL(`http://x${path}`);
  let status = 0;
  let body = '';
  const headers: Record<string, string> = {};
  const res = {
    writeHead(code: number, h?: Record<string, string>) {
      status = code;
      Object.assign(headers, h);
      return this;
    },
    setHeader: vi.fn(),
    end(data?: string) {
      body = data ?? '';
    },
  } as unknown as ServerResponse;
  await handleGoogleCalendarRoutes({ method: 'GET', headers: {} } as IncomingMessage, res, url.pathname, url);
  return { status, body, headers };
}

describe('Google Calendar link start', () => {
  it('returns the Google URL as JSON bound to the verified caller', async () => {
    caller.id = 'alice';
    const res = await get('/auth/google/calendar?userId=device:abc&format=json');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ url: 'https://accounts.google.com/o?state=state123' });
    expect(states.created.at(-1)?.user_id).toBe('alice');
  });

  it('still redirects plain navigations', async () => {
    caller.id = null;
    const res = await get('/auth/google/calendar?userId=device:abc');
    expect(res.status).toBe(302);
    expect(res.headers.Location).toContain('accounts.google.com');
  });
});
