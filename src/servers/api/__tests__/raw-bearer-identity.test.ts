/**
 * Ten route files used the raw Authorization bearer string as the user id, so
 * `Authorization: Bearer <victim-uid>` acted as that user without any token
 * verification. They now read the identity bindVerifiedIdentity bound.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const optionalAuthAsync = vi.fn();
vi.mock('../../../api/auth-middleware.js', () => ({ optionalAuthAsync }));

const getState = vi.fn(async (userId: string) => ({ userId }));
vi.mock('../../../services/ambient-mode/index.js', () => ({ ambientMode: { getState } }));

const { bindVerifiedIdentity, getVerifiedUserId } = await import('../request-identity.js');
const { handleAmbientModeRoutes } = await import('../routes/ambient-mode.js');

const PROD = { NODE_ENV: 'production' };

function req(headers: Record<string, string>): IncomingMessage {
  return { url: '/api/ambient-mode/state', method: 'GET', headers: { ...headers } } as unknown as IncomingMessage;
}
function res() {
  const out = { status: 0, body: '' };
  const r = {
    setHeader: vi.fn(),
    writeHead: (s: number) => {
      out.status = s;
    },
    end: (b?: string) => {
      out.body = b ?? '';
    },
  } as unknown as ServerResponse;
  return { r, out };
}

async function route(headers: Record<string, string>) {
  const q = req(headers);
  await bindVerifiedIdentity(q, PROD);
  const { r, out } = res();
  await handleAmbientModeRoutes(q, r, '/api/ambient-mode/state', new URL('http://x/api/ambient-mode/state'));
  return out;
}

describe('raw bearer string is never a user id', () => {
  beforeEach(() => {
    optionalAuthAsync.mockReset();
    getState.mockClear();
  });

  it('refuses a forged "Bearer <uid>" that fails verification', async () => {
    optionalAuthAsync.mockResolvedValue(null);
    const out = await route({ authorization: 'Bearer victim-uid' });
    expect(out.status).toBe(401);
    expect(getState).not.toHaveBeenCalled();
  });

  it('refuses a forged X-User-Id in production', async () => {
    const out = await route({ 'x-user-id': 'victim-uid' });
    expect(out.status).toBe(401);
    expect(getState).not.toHaveBeenCalled();
  });

  it('serves the verified uid, not the token string', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'real-user' });
    const out = await route({ authorization: 'Bearer eyJhbGciOi.real.jwt' });
    expect(out.status).toBe(200);
    expect(getState).toHaveBeenCalledWith('real-user');
  });

  it('getVerifiedUserId ignores the Authorization header entirely', () => {
    expect(getVerifiedUserId(req({ authorization: 'Bearer victim-uid' }))).toBeNull();
  });
});
