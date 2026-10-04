/**
 * The API drops unverified ?userId= in production (src/servers/api/request-identity.ts),
 * so a raw fetch('/api/...') must still carry the signed-in user's token.
 */
import { describe, expect, it, vi } from 'vitest';
import { installApiAuthFetch, isOwnApiRequest } from '../../src/services/api-auth-fetch.js';

const ORIGIN = 'https://app.ferni.ai';

function host() {
  const inner = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('ok'));
  const h = { fetch: inner as unknown as typeof fetch, location: { origin: ORIGIN } };
  return { h, inner };
}
function authOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('Authorization');
}

describe('installApiAuthFetch', () => {
  it('adds the bearer token to a relative /api call', async () => {
    const { h, inner } = host();
    installApiAuthFetch(h, async () => 'tok-1');
    await h.fetch('/api/export?userId=me', { method: 'POST' });
    const init = inner.mock.calls[0][1];
    expect(authOf(init)).toBe('Bearer tok-1');
    expect(init?.method).toBe('POST');
  });

  it('keeps a header the call site already set', async () => {
    const { h, inner } = host();
    installApiAuthFetch(h, async () => 'tok-1');
    await h.fetch('/api/x', { headers: { Authorization: 'Bearer own' } });
    expect(authOf(inner.mock.calls[0][1])).toBe('Bearer own');
  });

  it('never sends the token to another host', async () => {
    const { h, inner } = host();
    const getToken = vi.fn(async () => 'tok-1');
    installApiAuthFetch(h, getToken);
    await h.fetch('https://api.spotify.com/api/v1/me');
    expect(getToken).not.toHaveBeenCalled();
    expect(authOf(inner.mock.calls[0][1])).toBeNull();
  });

  it('leaves non-API same-origin requests alone', async () => {
    const { h, inner } = host();
    installApiAuthFetch(h, async () => 'tok-1');
    await h.fetch('/assets/app.css');
    expect(inner.mock.calls[0][1]).toBeUndefined();
  });

  it('sends the request unchanged when there is no token or it fails', async () => {
    const { h, inner } = host();
    installApiAuthFetch(h, async () => {
      throw new Error('auth not ready');
    });
    await h.fetch('/api/x');
    expect(authOf(inner.mock.calls[0][1])).toBeNull();
  });

  it('installs once per host', async () => {
    const { h, inner } = host();
    const getToken = vi.fn(async () => 'tok-1');
    installApiAuthFetch(h, getToken);
    installApiAuthFetch(h, getToken);
    await h.fetch('/api/x');
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

describe('isOwnApiRequest', () => {
  it.each([
    ['/api/a', true],
    [`${ORIGIN}/api/a`, true],
    ['/apiary', false],
    ['https://evil.example/api/a', false],
  ])('%s → %s', (url, expected) => {
    expect(isOwnApiRequest(url, ORIGIN)).toBe(expected);
  });
});
