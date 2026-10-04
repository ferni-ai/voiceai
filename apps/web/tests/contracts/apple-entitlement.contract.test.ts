/**
 * An App Store purchase shows up on the web, with no web change.
 *
 * Sender: the API server's real POST /api/apple/verify (Apple's real
 * SignedDataVerifier on a signed transaction, real ownership claim, real
 * entitlement write) and the real GET /api/subscription/status reading the
 * profile it wrote. Only Firestore, the profile store and the Firebase token
 * check are in memory; the trusted root is a test chain shaped like Apple's.
 * Receiver: the web's real status loader (which unlocks teammates from the
 * tier) and the real manage-subscription modal, fed the route's actual body.
 *
 * Before: verify recorded ownership but never wrote the profile, so the web
 * read `free`, offered Stripe checkout (paying twice) and kept teammates locked.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/services/billing/apple-root-certs.js', async () => ({
  APPLE_ROOT_CERTIFICATES: [
    (await import('../../../../src/services/billing/__tests__/app-store-test-chain.fixtures.js'))
      .TEST_APP_STORE_ROOT,
  ],
}));
vi.mock('../../../../src/services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: async (token: string) =>
    token === 'tok-alice' ? { uid: 'alice', claims: {}, isAnonymous: false } : null,
}));

const profiles = vi.hoisted(() => new Map<string, Record<string, unknown> & { id: string }>());
vi.mock('../../../../src/memory/store-factory.js', () => ({
  getStore: async () => ({
    getProfile: async (id: string) => profiles.get(id) ?? null,
    getOrCreateProfile: async (id: string) => {
      if (!profiles.has(id)) profiles.set(id, { id });
      return profiles.get(id);
    },
    saveProfile: async (p: { id: string }) => void profiles.set(p.id, p),
    listProfiles: async () => [...profiles.values()],
  }),
}));
const owners = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../../../src/utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: (id: string) => ({
        create: async (data: Record<string, unknown>) => {
          if (owners.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
          owners.set(id, data);
        },
        set: async (data: Record<string, unknown>) => void owners.set(id, data),
        get: async () => ({ data: () => owners.get(id) }),
      }),
    }),
  }),
}));
vi.mock('../../../../src/services/subscription-metrics.js', () => ({
  initializeSubscriptionMetrics: async () => undefined,
  trackStripeEvent: async () => undefined,
  getMetricsForApi: () => ({}),
}));

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn() }));
vi.mock('../../src/utils/billing.js', () => ({ openBillingPortal: vi.fn() }));

vi.stubEnv('APPLE_ISSUER_ID', 'issuer');
vi.stubEnv('APPLE_KEY_ID', 'key');
vi.stubEnv('APPLE_PRIVATE_KEY', 'unused-for-signed-transactions');
vi.stubEnv('APPLE_ENVIRONMENT', 'Sandbox');
vi.stubEnv('APPLE_BUNDLE_ID', ''); // the default: the iOS app's bundle id
vi.stubEnv('APPLE_ONLINE_CHECKS', 'false');

const { handleAppleRoutes } = await import('../../../../src/api/apple-iap-routes.js');
const { handleSubscriptionRequest } = await import('../../../../src/api/subscription-routes.js');
const { appStoreTransaction } =
  await import('../../../../src/services/billing/__tests__/app-store-test-chain.fixtures.js');
const { setLocale } = await import('../../src/i18n/index.js');
const { loadStatus } = await import('../../src/ui/subscription.ui.js');
const { teamUnlockService, _resetForTesting } =
  await import('../../src/services/team-unlock.service.js');
const { appState } = await import('../../src/state/app.state.js');

/** The iOS app's POST /api/apple/verify, through the real route. */
async function verifyFromApp(receiptData: string): Promise<number> {
  const req = Readable.from([JSON.stringify({ receiptData })]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: '/api/apple/verify',
    headers: { authorization: 'Bearer tok-alice', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  const res = {
    writeHead: (code: number) => ((status = code), res),
    setHeader: () => res,
    end: () => undefined,
  } as unknown as ServerResponse;
  await handleAppleRoutes(req, res);
  return status;
}

/** The web's GET goes to the real status route as the verified caller. */
async function serveFromRealRoute(path: string): Promise<unknown> {
  const url = new URL(path, 'http://localhost');
  const res = await handleSubscriptionRequest({
    method: 'GET',
    pathname: url.pathname.startsWith('/api') ? url.pathname : `/api${url.pathname}`,
    query: Object.fromEntries(url.searchParams),
    headers: {},
    authUserId: url.searchParams.get('userId') ?? undefined,
  });
  return { ok: res.status === 200, status: res.status, data: res.body };
}

beforeAll(async () => {
  await setLocale('en-US');
});

beforeEach(() => {
  profiles.clear();
  owners.clear();
  document.body.innerHTML = '';
  _resetForTesting();
  appState.set('deviceId', 'alice');
  apiGet.mockImplementation(serveFromRealRoute);
});

describe('App Store subscriber on the web', () => {
  it('reads their paid tier, unlocks the team, and gets App Store guidance', async () => {
    expect(teamUnlockService.isFullTeamUnlocked()).toBe(false);

    expect(await verifyFromApp(await appStoreTransaction())).toBe(200);
    const status = await loadStatus();

    expect(status).toMatchObject({
      tier: 'partner',
      billingSource: 'app_store',
      canUpgrade: false,
    });
    expect(teamUnlockService.isFullTeamUnlocked()).toBe(true);

    const { manageSubscriptionUI } = await import('../../src/ui/manage-subscription.ui.js');
    await manageSubscriptionUI.open('alice');
    const modal = document.querySelector<HTMLElement>('.manage-sub');
    expect(modal?.textContent).toContain('You subscribed through the App Store.');
    expect(modal?.querySelector('[data-action="billing-portal"]')).toBeNull();
    expect(modal?.querySelector('[data-action="upgrade"]')).toBeNull();
  });
});
