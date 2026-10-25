/**
 * Disconnect reads the tokens fresh, revokes the Google grant (with the
 * refresh token) unless a Gmail send grant would go with it, then deletes the
 * stored tokens. A revoke failure never blocks the local delete; a failed
 * read is an error, not a pretend disconnect.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  readTokensFresh: vi.fn(),
  removeTokens: vi.fn(async () => undefined),
}));
vi.mock('../google-calendar-token-store.js', () => store);
const gmail = vi.hoisted(() => ({ hasGmailSendGrant: vi.fn(async () => false) }));
vi.mock('../gmail-send-as-user.js', () => gmail);
const queueGoogleRevocation = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../google-revocations.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  queueGoogleRevocation,
}));

const { disconnectGoogleCalendar, GOOGLE_REVOKE_URL } =
  await import('../google-calendar-disconnect.js');

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  gmail.hasGmailSendGrant.mockResolvedValue(false);
  store.readTokensFresh.mockResolvedValue({
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

    expect(await disconnectGoogleCalendar('user-1')).toEqual({
      revoked: true,
      keptGmailGrant: false,
      queued: false,
    });

    expect(GOOGLE_REVOKE_URL).toBe('https://oauth2.googleapis.com/revoke');
    expect(store.readTokensFresh).toHaveBeenCalledWith('user-1');
    expect(revokedToken()).toBe('refresh-1');
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      store.removeTokens.mock.invocationCallOrder[0]
    );
  });

  it('still removes the tokens when Google refuses the revoke', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"invalid_token"}', { status: 400 }));

    expect(await disconnectGoogleCalendar('user-1')).toMatchObject({ revoked: false });
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
  });

  it('still removes the tokens when Google is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect(await disconnectGoogleCalendar('user-1')).toMatchObject({ revoked: false });
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
  });

  it('revokes the access token when there is no refresh token', async () => {
    store.readTokensFresh.mockResolvedValue({
      access_token: 'access-1',
      refresh_token: '',
      expires_at: 0,
    });
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    await disconnectGoogleCalendar('user-1');
    expect(revokedToken()).toBe('access-1');
  });

  it('skips the revoke when nothing is stored, and still clears', async () => {
    store.readTokensFresh.mockResolvedValue(null);

    expect(await disconnectGoogleCalendar('user-1')).toEqual({
      revoked: false,
      keptGmailGrant: false,
      queued: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
  });

  it('keeps a Gmail send grant: no revoke, calendar tokens deleted locally', async () => {
    gmail.hasGmailSendGrant.mockResolvedValue(true);

    expect(await disconnectGoogleCalendar('user-1')).toEqual({
      revoked: false,
      keptGmailGrant: true,
      queued: false,
    });
    expect(gmail.hasGmailSendGrant).toHaveBeenCalledWith('user-1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.removeTokens).toHaveBeenCalledWith('user-1');
  });

  it('a failed read is an error: nothing revoked, nothing deleted', async () => {
    store.readTokensFresh.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(disconnectGoogleCalendar('user-1')).rejects.toThrow('Firestore unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.removeTokens).not.toHaveBeenCalled();
  });

  it('a failed Gmail grant check is an error too (a revoke could drop Gmail)', async () => {
    gmail.hasGmailSendGrant.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(disconnectGoogleCalendar('user-1')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.removeTokens).not.toHaveBeenCalled();
  });

  it('erasure (queueIfUnreachable): a revoke Google could not take is queued, then deleted', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));

    expect(await disconnectGoogleCalendar('user-1', { queueIfUnreachable: true })).toMatchObject({
      revoked: false,
      queued: true,
    });
    expect(queueGoogleRevocation).toHaveBeenCalledWith('refresh-1');
    expect(queueGoogleRevocation.mock.invocationCallOrder[0]).toBeLessThan(
      store.removeTokens.mock.invocationCallOrder[0]
    );
  });

  it('queues nothing on a plain disconnect, or when Google refuses the token', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    await disconnectGoogleCalendar('user-1');
    fetchMock.mockResolvedValue(new Response('{"error":"invalid_token"}', { status: 400 }));
    await disconnectGoogleCalendar('user-1', { queueIfUnreachable: true });

    expect(queueGoogleRevocation).not.toHaveBeenCalled();
  });
});
