/**
 * Routes that named their subject with ?userId= now report on the verified caller only.
 *
 * Each was safe in production only because the request-identity door rewrites
 * ?userId=; on a developer machine (or behind any future change to the door)
 * a request with no token, or with alice's token naming bob, got bob's data.
 * The real auth middleware runs; token verification, rate limiting and each
 * route's data services are faked.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// "tok-<name>" verifies as uid-<name>; "tok-admin" is an admin
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    if (!token.startsWith('tok-')) return null;
    const name = token.slice(4);
    return { uid: `uid-${name}`, claims: { admin: name === 'admin' } };
  }),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));
vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { getTemporalContext } = vi.hoisted(() => ({
  getTemporalContext: vi.fn(async (_uid: string) => ({ timeOfDay: 'evening' })),
}));
vi.mock('../../services/superhuman/semantic-intelligence/temporal-patterns.js', () => ({
  getTemporalContext,
}));
vi.mock('../../services/superhuman/semantic-intelligence/index.js', () => ({
  getTemporalContext,
}));
for (const m of [
  'behavioral-intelligence',
  'coaching-intelligence',
  'ferni-commitments',
  'insight-broker',
  'open-loops',
  'relationship-graph',
  'self-awareness',
]) {
  vi.doMock(`../../services/superhuman/semantic-intelligence/${m}.js`, () => ({}));
}
vi.mock('../../services/cross-persona/team-huddle.js', () => ({}));
vi.mock('../../intelligence/predictive/llm-deep-analysis.js', () => ({}));

const { getContributorImpact } = vi.hoisted(() => ({
  getContributorImpact: vi.fn((_uid: string) => ({ total: 0 })),
}));
vi.mock('../../services/monetization/ferni-fund.js', () => ({
  ferniFund: { getContributorImpact, getUserContributions: () => [] },
}));

const { handleSuperhumanMetricsRoutes } = await import('../superhuman-metrics-routes.js');
const serverSemantic = await import('../../servers/api/routes/semantic-intelligence.js');
const apiSemantic = await import('../semantic-intelligence-routes.js');
const { integrityReportFor } = await import('../health/data-integrity.js');
const { handleMonetizationRequest } = await import('../monetization-routes.js');
const { verifyFirebaseToken } = await import('../../services/identity/firebase-auth.js');
const { handleEngagementRoutes } = await import('../engagement-routes.js');

function fakeReq(url: string, token?: string): IncomingMessage {
  return {
    method: 'GET',
    url,
    headers: { host: 'localhost', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}
function fakeRes(): { res: ServerResponse; status: () => number } {
  let status = 200;
  const res = {
    writableEnded: false,
    headersSent: false,
    statusCode: 200,
    setHeader: () => {},
    writeHead(code: number) {
      status = code;
      return this;
    },
    end: () => {},
  };
  return { res: res as unknown as ServerResponse, status: () => status };
}

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<unknown>;
const ROUTES: Array<[string, string, Handler]> = [
  [
    'superhuman metrics',
    '/api/superhuman/metrics',
    (req, res) =>
      handleSuperhumanMetricsRoutes(
        req,
        res,
        '/api/superhuman/metrics',
        new URL(req.url ?? '/', 'http://x')
      ),
  ],
  [
    'semantic intelligence (servers/api/routes)',
    '/api/semantic-intelligence/temporal',
    (req, res) =>
      serverSemantic.handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/temporal'
      ),
  ],
  [
    'semantic intelligence (api)',
    '/api/semantic-intelligence/temporal',
    (req, res) =>
      apiSemantic.handleSemanticIntelligenceRoutes(req, res, '/api/semantic-intelligence/temporal'),
  ],
];

async function call(handler: Handler, url: string, token?: string): Promise<number> {
  const { res, status } = fakeRes();
  await handler(fakeReq(url, token), res);
  return status();
}

describe.each(ROUTES)('%s', (_name, path, handler) => {
  beforeEach(() => getTemporalContext.mockClear());

  it('refuses a request with no token naming a user', async () => {
    expect(await call(handler, `${path}?userId=uid-bob`)).toBe(401);
    expect(getTemporalContext).not.toHaveBeenCalledWith('uid-bob');
  });

  it("refuses alice's token naming bob", async () => {
    expect(await call(handler, `${path}?userId=uid-bob`, 'tok-alice')).toBe(403);
    expect(getTemporalContext).not.toHaveBeenCalledWith('uid-bob');
  });

  it('serves the caller their own data', async () => {
    expect(await call(handler, `${path}?userId=uid-alice`, 'tok-alice')).toBe(200);
    expect(await call(handler, path, 'tok-alice')).toBe(200);
  });
});

describe('semantic intelligence reads the caller, not the query', () => {
  it('asks the service for the token uid', async () => {
    getTemporalContext.mockClear();
    const { res } = fakeRes();
    await serverSemantic.handleSemanticIntelligenceRoutes(
      fakeReq('/api/semantic-intelligence/temporal', 'tok-alice'),
      res,
      '/api/semantic-intelligence/temporal'
    );
    expect(getTemporalContext).toHaveBeenCalledWith('uid-alice');
  });
});

describe('data integrity health', () => {
  it('gives anyone the global report', async () => {
    const { res } = fakeRes();
    expect(await integrityReportFor(fakeReq('/api/health/data-integrity'), res)).not.toBeNull();
  });

  it('refuses a per-user report without a token, or to a non-admin', async () => {
    const anon = fakeRes();
    expect(
      await integrityReportFor(fakeReq('/api/health/data-integrity?userId=uid-bob'), anon.res)
    ).toBeNull();
    expect(anon.status()).toBe(401);
    const alice = fakeRes();
    const url = '/api/health/data-integrity?userId=uid-bob';
    expect(await integrityReportFor(fakeReq(url, 'tok-alice'), alice.res)).toBeNull();
    expect(alice.status()).toBe(403);
  });

  it('gives an admin a per-user report', async () => {
    const { res } = fakeRes();
    const url = '/api/health/data-integrity?userId=uid-bob';
    expect(await integrityReportFor(fakeReq(url, 'tok-admin'), res)).not.toBeNull();
  });
});

describe('monetization', () => {
  it('never reads the contributor named by ?userId= without a verified caller', async () => {
    getContributorImpact.mockClear();
    const response = await handleMonetizationRequest({
      method: 'GET',
      pathname: '/api/monetization/fund/impact',
      query: { userId: 'uid-bob' },
      body: undefined,
      headers: {},
      authUserId: undefined,
      isAdmin: false,
    });
    expect(response.status).toBe(401);
    expect(getContributorImpact).not.toHaveBeenCalled();
  });

  it("reads the verified caller's own impact", async () => {
    getContributorImpact.mockClear();
    const response = await handleMonetizationRequest({
      method: 'GET',
      pathname: '/api/monetization/fund/impact',
      query: { userId: 'uid-bob' },
      body: undefined,
      headers: {},
      authUserId: 'uid-alice',
      isAdmin: false,
    });
    expect(response.status).toBe(200);
    expect(getContributorImpact).toHaveBeenCalledWith('uid-alice');
  });
});

describe('semantic intelligence verifies the token once per request', () => {
  // The real server order: engagement routes (optional auth, then the api/
  // semantic handler), and if nobody answered, servers/api/routes
  async function routeLikeServer(path: string): Promise<void> {
    const req = fakeReq(path, 'tok-alice');
    const { res } = fakeRes();
    if (await handleEngagementRoutes(req, res, path, new URL(path, 'http://x'))) return;
    await serverSemantic.handleSemanticIntelligenceRoutes(req, res, path);
  }

  it.each([
    '/api/semantic-intelligence/summary',
    '/api/semantic-intelligence/context',
    '/api/semantic-intelligence/team-observations',
    '/api/semantic-intelligence/insights/i1/dismiss',
    '/api/semantic-intelligence/open-loops/l1/resolve',
    '/api/semantic-intelligence/commitments/c1/fulfill',
    '/api/semantic-intelligence/temporal',
  ])('%s', async (path) => {
    vi.mocked(verifyFirebaseToken).mockClear();
    await routeLikeServer(path);
    expect(verifyFirebaseToken).toHaveBeenCalledTimes(1);
  });
});

describe('the api/ semantic handler', () => {
  it('leaves paths it does not serve, auth included, to servers/api/routes', async () => {
    const { res, status } = fakeRes();
    const path = '/api/semantic-intelligence/summary';
    expect(await apiSemantic.handleSemanticIntelligenceRoutes(fakeReq(path), res, path)).toBe(
      false
    );
    expect(status()).toBe(200);
  });
});
