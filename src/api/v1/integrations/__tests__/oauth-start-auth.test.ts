/**
 * Starting an OAuth connection (/biometrics/connect/:platform, /calendar/connect)
 * needs the signed-in user; only provider callbacks are public. These routes
 * used to skip auth and then 500 on the missing auth context.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('../../../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
    if (auth.userId) return { userId: auth.userId, isAdmin: false };
    res.writeHead(401);
    res.end('{"error":"auth required"}');
    return null;
  }),
}));

const biometrics = vi.hoisted(() => ({ getAuthorizationUrl: vi.fn() }));
vi.mock('../../../../services/biometrics/index.js', () => ({
  getAuthorizationUrl: biometrics.getAuthorizationUrl,
  exchangeCodeForTokens: vi.fn(),
  syncBiometrics: vi.fn(),
  getCurrentBiometrics: vi.fn(),
  hasBiometricsConnectedAsync: vi.fn(),
  getConnectedPlatformAsync: vi.fn(),
  disconnectBiometrics: vi.fn(),
}));

const calendar = vi.hoisted(() => ({ getCalendarAuthUrl: vi.fn() }));
vi.mock('../../../../services/context-awareness/location-calendar.js', () => calendar);

const { handleIntegrationsRoutes } = await import('../handler.js');

async function get(path: string) {
  const req = { method: 'GET', url: path, headers: {} } as unknown as IncomingMessage;
  let status = 0;
  let body = '';
  const res = {
    headersSent: false,
    setHeader: vi.fn(),
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(data?: string) {
      body = data ?? '';
    },
  } as unknown as ServerResponse;
  const url = new URL(`http://x${path}`);
  await handleIntegrationsRoutes(req, res, url.pathname, url);
  return { status, body: body ? JSON.parse(body) : undefined };
}

describe('integrations OAuth start requires the signed-in user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    biometrics.getAuthorizationUrl.mockImplementation((p: string, u: string) => `https://auth/${p}?u=${u}`);
    calendar.getCalendarAuthUrl.mockImplementation((u: string) => `https://cal?u=${u}`);
  });

  it('401s without a user instead of crashing', async () => {
    auth.userId = null;
    expect((await get('/api/v1/integrations/biometrics/connect/oura')).status).toBe(401);
    expect((await get('/api/v1/integrations/calendar/connect')).status).toBe(401);
    expect(biometrics.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('binds the auth URL to the verified user', async () => {
    auth.userId = 'alice';
    const bio = await get('/api/v1/integrations/biometrics/connect/oura?userId=mallory');
    expect(bio.status).toBe(200);
    expect(biometrics.getAuthorizationUrl).toHaveBeenCalledWith('oura', 'alice');
    const cal = await get('/api/v1/integrations/calendar/connect');
    expect(cal.body).toEqual({ authUrl: 'https://cal?u=alice' });
  });

  it('keeps provider callbacks public', async () => {
    auth.userId = null;
    const res = await get('/api/v1/integrations/calendar/callback?error=access_denied');
    expect(res.status).not.toBe(401);
  });
});
