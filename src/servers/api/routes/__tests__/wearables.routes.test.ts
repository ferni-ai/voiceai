/**
 * /wearables OAuth routes act only on the caller's own account.
 * Run with: npx vitest run src/servers/api/routes/__tests__/wearables.routes.test.ts
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestUserId = vi.fn();
vi.mock('../../../../api/identity-guard.js', () => ({
  requestUserId: (req: IncomingMessage) => requestUserId(req),
  isAnonymousIdentity: (id: string) => /^device[:_][\w.:-]+$/.test(id),
}));

const getAllConnectionStatuses = vi.fn();
const getValidToken = vi.fn();
const removeTokens = vi.fn();
vi.mock('../../../token/oauth/wearables.js', () => ({
  getAllConnectionStatuses: (id: string) => getAllConnectionStatuses(id),
  getValidToken: (p: string, id: string) => getValidToken(p, id),
  removeTokens: (p: string, id: string) => removeTokens(p, id),
  isProviderConfigured: () => true,
  buildAuthUrl: (p: string, state: string) => `https://auth.example/${p}?state=${state}`,
}));
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { handleWearablesRoutes } from '../wearables.js';

function makeReq(url: string): IncomingMessage {
  return { method: 'GET', url, headers: {}, socket: {} } as unknown as IncomingMessage;
}

function makeRes() {
  const res = {
    status: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead: vi.fn((status: number, headers?: Record<string, string>) => {
      res.status = status;
      res.headers = headers ?? {};
      return res;
    }),
    end: vi.fn((chunk?: string) => {
      res.body = chunk ?? '';
    }),
    json: () => JSON.parse(res.body) as Record<string, unknown>,
  };
  return res;
}

async function call(url: string) {
  const res = makeRes();
  const parsed = new URL(url, 'http://localhost');
  await handleWearablesRoutes(
    makeReq(url),
    res as unknown as ServerResponse,
    parsed.pathname,
    parsed
  );
  return res;
}

describe('Wearables routes', () => {
  beforeEach(() => {
    requestUserId.mockReset().mockReturnValue('user-1');
    getAllConnectionStatuses.mockReset().mockResolvedValue([]);
    getValidToken.mockReset().mockResolvedValue('tok');
    removeTokens.mockReset().mockResolvedValue(undefined);
  });

  it("returns the caller's statuses without a user_id", async () => {
    const res = await call('/wearables/status');
    expect(res.status).toBe(200);
    expect(getAllConnectionStatuses).toHaveBeenCalledWith('user-1');
  });

  it("refuses another account's token and unlink", async () => {
    const token = await call('/wearables/oura/token?user_id=victim');
    expect(token.status).toBe(403);
    expect(getValidToken).not.toHaveBeenCalled();

    const unlink = await call('/wearables/oura/unlink?user_id=victim');
    expect(unlink.status).toBe(403);
    expect(removeTokens).not.toHaveBeenCalled();
  });

  it('allows the caller to name their own account', async () => {
    const res = await call('/wearables/oura/unlink?user_id=user-1');
    expect(res.status).toBe(200);
    expect(removeTokens).toHaveBeenCalledWith('oura', 'user-1');
  });

  it('returns the OAuth URL as JSON for authenticated clients', async () => {
    const res = await call('/wearables/oura/login?format=json&return_url=%2Fsettings');
    expect(res.status).toBe(200);
    expect(String(res.json().url)).toMatch(/^https:\/\/auth\.example\/oura\?state=/);
  });

  it('redirects plain navigation using user_id', async () => {
    requestUserId.mockReturnValue(null);
    const res = await call('/wearables/oura/login?user_id=user-9');
    expect(res.status).toBe(302);
    expect(res.headers.Location).toMatch(/^https:\/\/auth\.example\/oura/);
  });
});
