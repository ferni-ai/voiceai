/**
 * FinOps settings are saved for real (#4069 W7). Through the real routes, service and
 * Firestore adapter, with only the Firestore boundary (getFirestoreDb) and Firebase's
 * token check faked:
 * - a PUT writes finops_settings/current, stamped with the admin uid, and a later GET reads
 *   it back (snapshot, thresholds, ltv-cac);
 * - a bad body answers 400 and writes nothing; a store that is down answers 503 with the
 *   reason, never a success;
 * - a second API instance (a fresh module graph) reads what the first one saved;
 * - Sync from Stripe saves the MRR it summed through the same store (Stripe's client faked).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { docs, fs } = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  fs: { down: false, writes: 0 },
}));
const fakeDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      async get() {
        if (fs.down) throw new Error('14 UNAVAILABLE: firestore unreachable');
        const data = docs.get(`${name}/${id}`);
        return { exists: data !== undefined, data: () => structuredClone(data) };
      },
      async set(data: Record<string, unknown>, opts?: { merge?: boolean }) {
        if (fs.down) throw new Error('14 UNAVAILABLE: firestore unreachable');
        fs.writes += 1;
        const prev = (opts?.merge && docs.get(`${name}/${id}`)) || {};
        const merged: Record<string, unknown> = { ...prev, ...data };
        // set({merge: true}) merges nested maps key by key, as Firestore does
        for (const [k, v] of Object.entries(data)) {
          const old = prev[k];
          if (opts?.merge && v && typeof v === 'object' && old && typeof old === 'object') {
            merged[k] = { ...old, ...v };
          }
        }
        docs.set(`${name}/${id}`, structuredClone(merged));
      },
    }),
  }),
};
vi.mock('../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => fakeDb,
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: async () => ({
    uid: 'uid-admin',
    emailVerified: true,
    isAnonymous: false,
    claims: { admin: true },
  }),
  claimsFirebaseIssuer: () => true,
}));
vi.mock('stripe', () => ({
  default: class {
    subscriptions = {
      // One active plan at $12/month and one at $120/year ($10/month); no trials
      list: async function* (q: { status: string }) {
        if (q.status !== 'active') return;
        for (const [amount, interval] of [
          [1200, 'month'],
          [12000, 'year'],
        ] as const) {
          yield { items: { data: [{ price: { unit_amount: amount, recurring: { interval } } }] } };
        }
      },
    };
  },
}));
vi.mock('../../services/security-events.js', () => ({
  detectAnomalies: () => [],
  isLockedOut: () => ({ locked: false }),
  recordSecurityEvent: async () => undefined,
  recordSuccessfulAuth: async () => undefined,
  trackFailedAuth: async () => undefined,
}));

let ip = 0;
/** One API instance: a fresh module graph, so nothing is shared but the fake Firestore. */
async function instance() {
  vi.resetModules();
  return (await import('../finops-routes.js')).handleFinOpsRoutes;
}
type Handler = Awaited<ReturnType<typeof instance>>;

async function call(handle: Handler, method: string, path: string, body?: unknown) {
  // A readable stream holds the body until the route reads it, after the auth check
  const raw = body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)];
  ip += 1;
  const req = Object.assign(Readable.from(raw.map((b) => Buffer.from(b))), {
    method,
    url: path,
    headers: { authorization: 'Bearer t', 'x-forwarded-for': `203.0.113.${ip % 250}` },
    socket: { remoteAddress: `198.51.100.${ip % 250}` },
  }) as unknown as IncomingMessage;
  const got = { status: 0, body: undefined as unknown as Record<string, unknown> };
  const res = {
    headersSent: false,
    setHeader: () => undefined,
    writeHead(status: number) {
      got.status = status;
      return this;
    },
    end(chunk?: string) {
      got.body = chunk ? (JSON.parse(chunk) as Record<string, unknown>) : {};
    },
  } as unknown as ServerResponse;
  expect(await handle(req, res, path, new URL(`http://x${path}`))).toBe(true);
  return got;
}

const saved = () => docs.get('finops_settings/current');

beforeEach(() => {
  docs.clear();
  fs.down = false;
  fs.writes = 0;
});

describe('FinOps settings persist through the routes', () => {
  it('a saved MRR and cash reserve are in finops_settings/current and in the next snapshot', async () => {
    const api = await instance();
    expect((await call(api, 'GET', '/api/finops/snapshot')).body.monthlyRecurringRevenue).toBe(0);

    const mrr = await call(api, 'PUT', '/api/finops/revenue', { mrr: 4200 });
    expect(mrr).toMatchObject({ status: 200, body: { success: true, mrr: 4200, updatedBy: 'uid-admin' } }); // prettier-ignore
    expect((await call(api, 'PUT', '/api/finops/cash', { amount: 0 })).body.amount).toBe(0);

    expect(saved()).toMatchObject({ monthlyRevenue: 4200, cashReserve: 0, updatedBy: 'uid-admin' });
    expect(typeof saved()?.updatedAt).toBe('string');
    const snap = await call(api, 'GET', '/api/finops/snapshot');
    expect(snap.body.monthlyRecurringRevenue).toBe(4200);
  });

  it('LTV:CAC inputs and one threshold save without touching the others', async () => {
    const api = await instance();
    const ltv = await call(api, 'PUT', '/api/finops/ltv-cac', { cac: 80 });
    expect(ltv.body.inputs).toEqual({ cac: 80, lifetimeMonths: 12, churnRate: 0.05 });
    await call(api, 'PUT', '/api/finops/ltv-cac', { churnRate: 0.02 });
    await call(api, 'PUT', '/api/finops/thresholds', { maxMonthlyBurn: 900 });

    const inputs = await call(api, 'GET', '/api/finops/ltv-cac');
    expect(inputs.body.inputs).toEqual({ cac: 80, lifetimeMonths: 12, churnRate: 0.02 });
    const thresholds = await call(api, 'GET', '/api/finops/thresholds');
    expect(thresholds.body).toMatchObject({ maxMonthlyBurn: 900, minGrossMargin: 0.3 });
  });

  // The UI shows `error` as the reason, so each one says what to fix in words
  it.each([
    ['/api/finops/revenue', {}, 'MRR must be a number of 0 or more'],
    ['/api/finops/revenue', { mrr: -5 }, 'MRR must be a number of 0 or more'],
    ['/api/finops/revenue', 'null', 'Send a JSON object'],
    ['/api/finops/cash', { amount: 'lots' }, 'Cash reserve must be a number of 0 or more'],
    ['/api/finops/ltv-cac', {}, 'Enter CAC or churn'],
    ['/api/finops/ltv-cac', { churnRate: 3 }, 'Churn must be 1 or less (0.05 is 5%)'],
    ['/api/finops/ltv-cac', { lifetimeMonths: 0 }, 'Customer lifetime must be a number of months above 0'], // prettier-ignore
    ['/api/finops/thresholds', { notAThreshold: 1 }, 'Not a threshold: notAThreshold'],
    // .strict(): a known key does not carry an unknown one in with it
    ['/api/finops/thresholds', { maxMonthlyBurn: 5, bogus: 1 }, 'Not a threshold: bogus'],
    ['/api/finops/thresholds', { maxMonthlyBurn: -1 }, 'maxMonthlyBurn must be a number of 0 or more'], // prettier-ignore
    ['/api/finops/revenue', '{not json', 'Send a JSON body'],
  ])('400 and nothing written: PUT %s %j', async (path, body, error) => {
    const got = await call(await instance(), 'PUT', path, body);
    expect(got).toMatchObject({ status: 400, body: { error } });
    expect(fs.writes).toBe(0);
    expect(saved()).toBeUndefined();
  });

  it('503 with the reason when the store is down, for a save and for a read', async () => {
    const api = await instance();
    fs.down = true;
    const put = await call(api, 'PUT', '/api/finops/revenue', { mrr: 10 });
    expect(put).toMatchObject({ status: 503, body: { reason: '14 UNAVAILABLE: firestore unreachable' } }); // prettier-ignore
    expect(put.body.success).toBeUndefined();
    expect((await call(api, 'GET', '/api/finops/snapshot')).status).toBe(503);
  });
});

describe('FinOps settings are shared across API instances', () => {
  it('a second instance reads the MRR and thresholds the first saved', async () => {
    const first = await instance();
    await call(first, 'PUT', '/api/finops/revenue', { mrr: 777 });
    await call(first, 'PUT', '/api/finops/thresholds', { minGrossMargin: 0.5 });

    const second = await instance();
    expect((await call(second, 'GET', '/api/finops/snapshot')).body.monthlyRecurringRevenue).toBe(777); // prettier-ignore
    expect((await call(second, 'GET', '/api/finops/thresholds')).body.minGrossMargin).toBe(0.5);
  });
});

describe('Sync from Stripe saves through the settings store', () => {
  it('the synced MRR is in finops_settings/current, by stripe-sync, and in another instance', async () => {
    for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_FRIEND']) {
      vi.stubEnv(k, 'test');
    }
    const sync = await call(await instance(), 'POST', '/api/finops/sync-mrr');
    expect(sync.body).toMatchObject({ success: true, mrr: 22, subscriptionCount: 2 });
    expect(saved()).toMatchObject({ monthlyRevenue: 22, updatedBy: 'stripe-sync' });

    const other = await instance();
    expect((await call(other, 'GET', '/api/finops/snapshot')).body.monthlyRecurringRevenue).toBe(22); // prettier-ignore
    vi.unstubAllEnvs();
  });

  it('without Stripe configured: 503 with the reason and nothing saved, never an MRR of 0', async () => {
    for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) vi.stubEnv(k, '');
    const api = await instance();
    await call(api, 'PUT', '/api/finops/revenue', { mrr: 500 });
    const writes = fs.writes;
    const sync = await call(api, 'POST', '/api/finops/sync-mrr');
    expect(sync).toMatchObject({ status: 503, body: { reason: 'Stripe is not configured' } });
    expect(sync.body.success).toBe(false);
    expect(fs.writes).toBe(writes);
    expect(saved()?.monthlyRevenue).toBe(500);
    vi.unstubAllEnvs();
  });
});
