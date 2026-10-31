/**
 * The strict requireAuth sites (#3220: deletion, export, the record-creating profile read,
 * bank linking, consent) look the account up now, so during an Auth outage they answer
 * 503 with Retry-After even when this instance holds a recent account state that the lax
 * check still accepts (#3228). Adapted from the #3220 verifier's probe. Every route below
 * goes red if requireAuth stops passing `strict` on (auth-middleware.ts).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const mode = vi.hoisted(() => ({ auth: 'up' as 'up' | 'down' }));
const auth = vi.hoisted(() => ({
  verifyIdToken: vi.fn(async (token: string) => ({
    uid: token,
    auth_time: Math.floor(Date.now() / 1000) - 60,
    exp: 4102444800,
    email: `${token}@example.com`,
    firebase: { sign_in_provider: 'password' },
  })),
  getUser: vi.fn(async (uid: string) => {
    if (mode.auth === 'down') {
      throw Object.assign(new Error('internal'), { code: 'auth/internal-error' });
    }
    return { uid, disabled: false, providerData: [{ providerId: 'password' }] };
  }),
}));
const store = vi.hoisted(() => ({
  getProfile: vi.fn(async () => null),
  getOrCreateProfile: vi.fn(async (id: string) => ({ id, name: 'Test User' })),
}));
vi.mock('firebase-admin', () => ({ default: { apps: [{}], auth: () => auth } }));
vi.mock('../../memory/store-factory.js', () => ({ getStore: async () => store }));
vi.mock('../../services/security-events.js', () => ({
  isLockedOut: () => ({ locked: false }),
  trackFailedAuth: async () => {},
  recordSecurityEvent: async () => {},
  recordSuccessfulAuth: async () => {},
  detectAnomalies: async () => {},
}));

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  url: URL
) => Promise<boolean>;
let server: Server;
let base: string;

beforeAll(async () => {
  const { requireAuth } = await import('../auth-middleware.js');
  const handlers: Handler[] = [
    async (req, res, path) => {
      if (path !== '/lax') return false; // a lax requireAuth site
      if (await requireAuth(req, res)) res.writeHead(200).end('ok');
      return true;
    },
    (await import('../user-routes.js')).handleUserRoutes as Handler,
    (await import('../gdpr-routes.js')).handleGDPRRoutes as Handler,
    (await import('../account-routes.js')).handleAccountRoutes as Handler,
    (await import('../../servers/api/routes/plaid.js')).handlePlaidRoutes as Handler,
    (await import('../sponsored-identity-routes.js')).handleSponsoredIdentityRoutes as Handler,
  ];
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void (async () => {
      for (const handle of handlers) if (await handle(req, res, url.pathname, url)) return;
      res.writeHead(404).end();
    })().catch(() => res.headersSent || res.writeHead(599).end());
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
afterEach(() => vi.useRealTimers());

const hit = (path: string, uid: string) =>
  fetch(`${base}${path}`, { headers: { authorization: `Bearer ${uid}` } });

const STRICT_SITES = [
  '/api/user/profile',
  '/api/gdpr/export',
  '/api/account',
  '/plaid/status',
  '/api/sponsored-identities',
];

describe('strict requireAuth sites during an Auth outage, with a recent account state cached', () => {
  for (const path of STRICT_SITES) {
    it(`GET ${path} answers 503 with Retry-After while the lax check passes`, async () => {
      const uid = `uid${path.replace(/\W/g, '')}xxxxxxxxxxxxxxxx`.slice(0, 28);
      mode.auth = 'up';
      const now = Date.now();
      vi.useFakeTimers({ toFake: ['Date'], now });
      expect((await hit('/lax', uid)).status).toBe(200); // caches the account's state
      vi.setSystemTime(now + 2 * 60_000); // past the fresh minute, well inside the stale hour
      mode.auth = 'down';
      expect((await hit('/lax', uid)).status).toBe(200); // the lax check uses the stale state
      store.getOrCreateProfile.mockClear();

      const res = await hit(path, uid);

      expect(res.status).toBe(503);
      expect(res.headers.get('retry-after')).toBe('5');
      expect(store.getOrCreateProfile).not.toHaveBeenCalled();
    });
  }
});
