/**
 * GET /api/outreach/preferences tells the web app whether WEB_PUSH_DELIVERY is
 * on for the signed-in person (the after-call card's push ask reads it). Read
 * per person from cohort flags, never from the server's own env.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const flagForUser = vi.fn(
  async (_userId: string, _flag: string) => undefined as string | undefined
);

vi.mock('../../services/outreach/outreach-consent.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/outreach-consent.js')>()),
  readOutreachConsent: vi.fn(async () => ({ enabled: true, channels: [] })),
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: vi.fn(() => false),
  requireAuth,
}));
vi.mock('../../services/platform/cohort-flags.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/platform/cohort-flags.js')>()),
  flagForUser,
}));
vi.mock('../../services/superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { handleOutreachRoutes } = await import('../outreach.routes.js');

let server: Server;
let base = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    void handleOutreachRoutes(req, res, url.pathname, url);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((r) => {
      server.close(() => r());
    })
);

beforeEach(() => {
  vi.clearAllMocks();
  flagForUser.mockReset().mockResolvedValue(undefined);
  requireAuth.mockResolvedValue({
    userId: 'u1',
    isAdmin: false,
    isDevMode: false,
    authMethod: 'firebase',
  });
});

const webPushDelivery = async (): Promise<unknown> =>
  (
    (await (await fetch(`${base}/api/outreach/preferences`)).json()) as {
      webPushDelivery?: unknown;
    }
  ).webPushDelivery;

describe('GET /api/outreach/preferences webPushDelivery', () => {
  it('false when the flag is not on for the person', async () => {
    expect(await webPushDelivery()).toBe(false);
    flagForUser.mockResolvedValueOnce('off');
    expect(await webPushDelivery()).toBe(false);
  });

  it("true when the signed-in person's own flags turn it on, read for them only", async () => {
    flagForUser.mockImplementation(async (userId, flag) =>
      userId === 'u1' && flag === 'WEB_PUSH_DELIVERY' ? 'on' : undefined
    );
    expect(await webPushDelivery()).toBe(true);
    expect(flagForUser).toHaveBeenCalledWith('u1', 'WEB_PUSH_DELIVERY', {});

    requireAuth.mockResolvedValue({
      userId: 'u2',
      isAdmin: false,
      isDevMode: false,
      authMethod: 'firebase',
    });
    expect(await webPushDelivery()).toBe(false);
  });

  it('ignores the server env: WEB_PUSH_DELIVERY=on there turns it on for nobody', async () => {
    vi.stubEnv('WEB_PUSH_DELIVERY', 'on');
    try {
      expect(await webPushDelivery()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
