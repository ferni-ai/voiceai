/**
 * Superhuman experiments are shared by every user, but create, update,
 * graduate, pause and resume only checked that the caller was signed in, so
 * any user could change or end an experiment everyone is enrolled in. These
 * tests drive the real handler over a real HTTP server, behind the real
 * identity layer. Only the Firebase verifier and the experiments service
 * are mocked.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const TOKENS: Record<string, { uid: string; admin?: boolean }> = {
  'tok-user': { uid: 'user-A' },
  'tok-admin': { uid: 'admin-1', admin: true },
};
vi.mock('../../../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const who = TOKENS[token];
    return who ? { uid: who.uid, claims: { admin: who.admin === true } } : null;
  }),
}));

const service = vi.hoisted(() => {
  const experiment = {
    id: 'exp-1',
    name: 'E',
    variants: [{}, {}],
    metadata: { status: 'running' },
  };
  return {
    createSimpleABTest: vi.fn(async () => experiment),
    createMultiVariantTest: vi.fn(async () => experiment),
    updateExperimentMetadata: vi.fn(async () => undefined),
    graduateExperiment: vi.fn(async () => undefined),
    pauseExperiment: vi.fn(async () => undefined),
    resumeExperiment: vi.fn(async () => undefined),
    getExperiment: vi.fn(async () => null),
    listExperiments: vi.fn(async () => []),
    getExperimentStats: vi.fn(async () => null),
    enrollUser: vi.fn(async () => null),
    recordUserConversion: vi.fn(async () => null),
    findExperimentsByTags: vi.fn(async () => ({ selectedExperiments: [] })),
    findExperimentsByIntent: vi.fn(async () => ({ selectedExperiments: [] })),
  };
});
vi.mock('../../../../services/experiments/superhuman-experiments.js', () => service);

const { bindVerifiedIdentity } = await import('../../../../servers/api/request-identity.js');
const { handleSuperhumanExperimentsRoutes } = await import('../superhuman-experiments.js');

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      // As src/servers/api/index.ts → api/v1/index.ts, with production identity rules.
      await bindVerifiedIdentity(req, { NODE_ENV: 'production' });
      const url = new URL(req.url || '/', 'http://local');
      await handleSuperhumanExperimentsRoutes(req, res, url.pathname, url);
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
beforeEach(() => vi.clearAllMocks());

const BASE = '/api/v1/public/superhuman/experiments';
const variant = { name: 'v', config: {} };
const created = { id: 'exp-1', name: 'E', type: 'simple', variantA: variant, variantB: variant };
/** [name, method, path, body, status an admin gets] */
const ROUTES: Array<[string, string, string, Record<string, unknown>, number]> = [
  ['create', 'POST', BASE, created, 201],
  ['update', 'PATCH', `${BASE}/exp-1`, { status: 'stopped' }, 200],
  ['graduate', 'POST', `${BASE}/exp-1/graduate`, { winnerId: 'v-b' }, 200],
  ['pause', 'POST', `${BASE}/exp-1/pause`, {}, 200],
  ['resume', 'POST', `${BASE}/exp-1/resume`, {}, 200],
];

/** Every write the experiments service was asked to make. */
const writes = (): number =>
  [
    service.createSimpleABTest,
    service.createMultiVariantTest,
    service.updateExperimentMetadata,
    service.graduateExperiment,
    service.pauseExperiment,
    service.resumeExperiment,
  ].reduce((n, fn) => n + fn.mock.calls.length, 0);

async function call(method: string, path: string, body: unknown, token?: string): Promise<number> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: JSON.stringify(body) });
  await res.text();
  return res.status;
}

describe('superhuman experiment admin routes require a verified admin', () => {
  it.each(ROUTES)('%s: a signed-in non-admin gets 403 and nothing is written', async (...r) => {
    const [, method, path, body] = r;
    expect(await call(method, path, body, 'tok-user')).toBe(403);
    expect(writes()).toBe(0);
  });

  it.each(ROUTES)('%s: no credentials gets 401 and nothing is written', async (...r) => {
    const [, method, path, body] = r;
    expect(await call(method, path, body)).toBe(401);
    expect(writes()).toBe(0);
  });

  it.each(ROUTES)('%s: a verified admin succeeds', async (...r) => {
    const [, method, path, body, ok] = r;
    expect(await call(method, path, body, 'tok-admin')).toBe(ok);
    expect(writes()).toBe(1);
  });
});
