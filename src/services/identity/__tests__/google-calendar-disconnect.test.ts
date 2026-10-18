/**
 * Disconnect revokes the Google grant (with the refresh token), then deletes
 * the stored tokens, and a revoke failure never blocks the local delete.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  getTokens: vi.fn(),
  removeTokens: vi.fn(async () => undefined),
}));
vi.mock('../google-calendar-token-store.js', () => store);

const { disconnectGoogleCalendar, GOOGLE_REVOKE_URL } = await import(
  '../google-calendar-disconnect.js'
);

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  store.getTokens.mockResolvedValue({
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_at: 0,
  });
});

function revokedToken(): string | null {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(GOOGLE_REVOKE_URL);
  expect(init.method).toBe('POST');
  return new URLSearchParams(String(init.body)).get('token');
}

describe('disconnectGoogleCalendar', () => {
  it('revokes the refresh token at Google, then removes the stored tokens', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    expect(await disconnectGoogleCalendar('user-1')).toEqual({ revoked: true });

    expect(GOOGLE_REVOKE_URL).toBe('https://oauth2.googleapis.com/revoke');
    expect(revokedToken()).toBe('refresh-1');
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      store.removeTokens.mock.invocationCallOrder[0]
    );
  });

  it('still removes the tokens when Google refuses the revoke', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"invalid_token"}', { status: 400 }));

    expect(await disconnectGoogleCalendar('user-1')).toEqual({ revoked: false });
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
  });

  it('still removes the tokens when Google is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect(await disconnectGoogleCalendar('user-1')).toEqual({ revoked: false });
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
  });

  it('revokes the access token when there is no refresh token', async () => {
    store.getTokens.mockResolvedValue({ access_token: 'access-1', refresh_token: '', expires_at: 0 });
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await disconnectGoogleCalendar('user-1');
    expect(revokedToken()).toBe('access-1');
  });

  it('skips the revoke when nothing is stored, and still clears', async () => {
    store.getTokens.mockResolvedValue(null);

    expect(await disconnectGoogleCalendar('user-1')).toEqual({ revoked: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
  });
});
