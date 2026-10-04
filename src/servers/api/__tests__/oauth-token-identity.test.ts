/**
 * GET /auth/google/token?user_id=<anyone> returned that user's live Google
 * access token with no credentials (confirmed against production 2026-10-03).
 * Token, status and unlink now act only for the verified caller.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const optionalAuthAsync = vi.fn();
vi.mock('../../../api/auth-middleware.js', () => ({ optionalAuthAsync }));

const getValidToken = vi.fn(async (_uid: string) => 'ya29.secret-access-token');
vi.mock('../../token/oauth/google-calendar.js', () => ({ getValidToken }));

const { bindVerifiedIdentity } = await import('../request-identity.js');
const { handleGoogleCalendarRoutes } = await import('../routes/google-calendar.js');

async function call(url: string, headers: Record<string, string> = {}) {
  const r = { url, method: 'GET', headers: { ...headers } } as unknown as IncomingMessage;
  await bindVerifiedIdentity(r, { NODE_ENV: 'production' });
  const out = { status: 0, body: '' };
  const res = {
    setHeader: vi.fn(),
    writeHead: (s: number) => {
      out.status = s;
    },
    end: (b?: string) => {
      out.body = b ?? '';
    },
  } as unknown as ServerResponse;
  const parsed = new URL(r.url ?? '/', 'http://x');
  await handleGoogleCalendarRoutes(r, res, parsed.pathname, parsed);
  return out;
}

describe('/auth/google/token identity', () => {
  beforeEach(() => {
    optionalAuthAsync.mockReset();
    getValidToken.mockClear();
  });

  it('refuses an unauthenticated user_id lookup', async () => {
    const out = await call('/auth/google/token?user_id=victim');
    expect(out.status).toBe(401);
    expect(out.body).not.toContain('ya29');
    expect(getValidToken).not.toHaveBeenCalled();
  });

  it('returns only the verified caller’s token, ignoring user_id', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'real-user' });
    const out = await call('/auth/google/token?user_id=victim', { authorization: 'Bearer t' });
    expect(out.status).toBe(200);
    expect(getValidToken).toHaveBeenCalledWith('real-user');
  });
});
