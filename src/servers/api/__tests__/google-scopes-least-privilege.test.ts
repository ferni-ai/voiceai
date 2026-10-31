/**
 * Every Google consent URL asks for the same two calendar scopes, and no Gmail scope.
 * The scopes declared on the Google Cloud consent screen must match these exactly, or
 * each connect shows "unverified app" and counts against the unverified-user cap.
 * The REAL login route and URL builders; only the link state is faked.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

Object.assign(process.env, {
  GOOGLE_CALENDAR_CLIENT_ID: 'g-id',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'g-secret',
});

vi.mock('../../token/oauth-link-state.js', () => ({
  consumeOAuthLinkState: vi.fn(),
  peekOAuthLinkState: vi.fn(async () => ({ uid: 'u1', returnUrl: '/app' })),
}));
vi.mock('../../../services/calendar/webhooks/google-webhook.js', () => ({
  createWatchChannel: vi.fn(),
  stopAllUserChannels: vi.fn(),
}));

const { GOOGLE_CALENDAR_SCOPES } = await import('../../../config/google-calendar-scopes.js');
const { handleGoogleCalendarRoutes } = await import('../routes/google-calendar.js');
const { generateAuthUrl } = await import('../../../services/identity/google-calendar-oauth.js');
const { buildAuthUrl, getConfig } = await import('../../token/oauth/google-calendar.js');
const { googleCalendarProvider } =
  await import('../../../services/calendar/providers/google-provider.js');

const scopeOf = (url: string) => new URL(url).searchParams.get('scope');

async function loginRedirect(): Promise<string> {
  let location = '';
  const res = {
    writeHead: (_s: number, h?: Record<string, string>) => {
      location = h?.Location ?? '';
    },
    end: vi.fn(),
  } as unknown as ServerResponse;
  const url = new URL('/auth/google/login?state=s', 'http://x');
  await handleGoogleCalendarRoutes(
    { url: url.pathname + url.search, method: 'GET', headers: {} } as IncomingMessage,
    res,
    url.pathname,
    url
  );
  return location;
}

describe('Google scopes', () => {
  it('are calendar.events + calendar.readonly, and nothing from Gmail', () => {
    expect([...GOOGLE_CALENDAR_SCOPES].sort()).toEqual([
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ]);
    expect(GOOGLE_CALENDAR_SCOPES.join(' ')).not.toMatch(/gmail|auth\/calendar(\s|$)/);
  });

  it('every consent URL asks for exactly that list', async () => {
    const want = GOOGLE_CALENDAR_SCOPES.join(' ');
    expect(scopeOf(await loginRedirect())).toBe(want);
    expect(scopeOf(generateAuthUrl('s'))).toBe(want);
    expect(scopeOf(buildAuthUrl('s'))).toBe(want);
    expect(scopeOf(googleCalendarProvider.getAuthUrl('u1', 'https://x/cb'))).toBe(want);
    expect(getConfig().scopes).toEqual([...GOOGLE_CALENDAR_SCOPES]);
  });
});
