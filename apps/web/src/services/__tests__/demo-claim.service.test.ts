/**
 * The demo claim sends the signed-in user's Firebase ID token: the server
 * claims for the account in that verified token and answers 401 without it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ClaimModule = typeof import('../demo-claim.service.js');

async function freshModule(): Promise<ClaimModule> {
  vi.resetModules();
  return import('../demo-claim.service.js');
}

describe('checkAndClaimDemoSession', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, already_claimed: false }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState({}, '', '/?claim=claim-123');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('sends the ID token as a Bearer header and no uid in the body', async () => {
    const { checkAndClaimDemoSession } = await freshModule();
    const result = await checkAndClaimDemoSession(async () => 'id-token-abc');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/demo-claim');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer id-token-abc');
    expect(JSON.parse(String(init.body))).toEqual({ claim_token: 'claim-123' });
  });

  it('does not call the server before the user is signed in', async () => {
    const { checkAndClaimDemoSession } = await freshModule();
    const result = await checkAndClaimDemoSession(async () => null);

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries once a token is available', async () => {
    const { checkAndClaimDemoSession } = await freshModule();
    await checkAndClaimDemoSession(async () => null);
    const result = await checkAndClaimDemoSession(async () => 'id-token-later');

    expect(result.success).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer id-token-later');
  });
});
