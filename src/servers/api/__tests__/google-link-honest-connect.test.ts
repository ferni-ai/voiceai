/**
 * Google's granular consent lets a user untick the calendar and still return with
 * a code. GOOGLE_LINK_HONEST: that link is stored as insufficient_scope and the
 * user is sent back to reconnect, not shown "connected". Off: as on main.
 * The REAL callback route; mocked: state, token exchange (fetch), token storage.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
});

const saveTokens = vi.fn(async (_uid: string, _tokens: unknown) => undefined);
vi.mock('../../token/oauth/google-calendar.js', () => ({
  saveTokens,
  getTokens: vi.fn(),
  getValidToken: vi.fn(),
}));
vi.mock('../../token/oauth-link-state.js', () => ({
  consumeOAuthLinkState: vi.fn(async () => ({ uid: 'u1', returnUrl: '/app' })),
  peekOAuthLinkState: vi.fn(),
}));
const createWatchChannel = vi.fn(async () => null);
vi.mock('../../../services/calendar/webhooks/google-webhook.js', () => ({
  createWatchChannel,
  stopAllUserChannels: vi.fn(),
}));

const { handleGoogleCalendarRoutes } = await import('../routes/google-calendar.js');

const CAL = 'https://www.googleapis.com/auth/calendar';

async function callback(scope: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope }))
  );
  const out = { status: 0, location: '' };
  const res = {
    setHeader: vi.fn(),
    writeHead: (s: number, h?: Record<string, string>) => {
      out.status = s;
      out.location = h?.Location ?? '';
    },
    end: vi.fn(),
  } as unknown as ServerResponse;
  const url = new URL('/auth/google/callback?code=c&state=s', 'http://x');
  const req = { url: url.pathname + url.search, method: 'GET', headers: {} } as IncomingMessage;
  await handleGoogleCalendarRoutes(req, res, url.pathname, url);
  return out;
}

describe('Google connect with the calendar box unticked', () => {
  beforeEach(() => {
    saveTokens.mockClear();
    createWatchChannel.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_LINK_HONEST;
  });

  it('on: stored as insufficient_scope, no watch channel, user sent to reconnect', async () => {
    process.env.GOOGLE_LINK_HONEST = 'on';
    const out = await callback('openid https://www.googleapis.com/auth/userinfo.email');
    expect(saveTokens).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ status: 'insufficient_scope' })
    );
    expect(createWatchChannel).not.toHaveBeenCalled();
    expect(out.location).toContain('calendar_error=insufficient_scope');
    expect(out.location).not.toContain('status=connected');
  });

  it('on: a full consent is stored as a normal link', async () => {
    process.env.GOOGLE_LINK_HONEST = 'on';
    const out = await callback(`${CAL}.events ${CAL}.readonly`);
    expect(saveTokens.mock.calls[0][1]).not.toHaveProperty('status');
    expect(createWatchChannel).toHaveBeenCalled();
    expect(out.location).toContain('status=connected');
  });

  it('off: the same unticked consent is stored as connected, as on main', async () => {
    const out = await callback('openid');
    expect(saveTokens.mock.calls[0][1]).toEqual(
      expect.objectContaining({ scope: 'openid', access_token: 'a' })
    );
    expect(saveTokens.mock.calls[0][1]).not.toHaveProperty('status');
    expect(out.location).toContain('status=connected');
  });
});
