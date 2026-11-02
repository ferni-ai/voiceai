/**
 * GOOGLE_LINK_HONEST: a Google link whose consent left out the calendar reads as
 * not connected everywhere the calendar is read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({
  tokens: null as null | Record<string, unknown>,
}));
vi.mock('../google-calendar-token-store.js', () => ({
  getTokens: vi.fn(async () => stored.tokens),
  saveTokens: vi.fn(),
  removeTokens: vi.fn(),
  peekTokens: vi.fn(() => stored.tokens),
  listTokenUsers: vi.fn(async () => []),
  googleTokenStore: { isRefreshBlocked: vi.fn(() => false) },
}));

const { hasCalendarScope } = await import('../google-link-scope.js');
const { isCalendarConfigured, getValidAccessToken } = await import('../google-calendar-oauth.js');

const FUTURE = Date.now() + 3_600_000;

describe('hasCalendarScope', () => {
  it('needs the calendar scope itself, not just another Google scope', () => {
    const cal = 'https://www.googleapis.com/auth/calendar';
    expect(hasCalendarScope(`openid ${cal} ${cal}.events`)).toBe(true); // older, wider link
    expect(hasCalendarScope(`${cal}.events ${cal}.readonly`)).toBe(true); // today's request
    expect(hasCalendarScope(`${cal}.events`)).toBe(false); // readonly unticked: no free/busy
    expect(hasCalendarScope(`${cal}.readonly`)).toBe(false); // events unticked: cannot write
    expect(hasCalendarScope('openid email')).toBe(false);
    expect(hasCalendarScope(undefined)).toBe(false);
  });
});

describe('an insufficient_scope link', () => {
  afterEach(() => {
    delete process.env.GOOGLE_LINK_HONEST;
  });
  const link = {
    access_token: 'a',
    refresh_token: 'r',
    expires_at: FUTURE,
    status: 'insufficient_scope',
  };

  it('on: reads as not connected and yields no access token', async () => {
    process.env.GOOGLE_LINK_HONEST = 'on';
    stored.tokens = link;
    expect(await isCalendarConfigured('u1')).toBe(false);
    expect(await getValidAccessToken('u1')).toBeNull();
  });

  it('off: identical to main (the stored link is used)', async () => {
    stored.tokens = link;
    expect(await isCalendarConfigured('u1')).toBe(true);
    expect(await getValidAccessToken('u1')).toBe('a');
  });

  it('on: a normal link still works', async () => {
    process.env.GOOGLE_LINK_HONEST = 'on';
    stored.tokens = { ...link, status: undefined };
    expect(await isCalendarConfigured('u1')).toBe(true);
  });
});
