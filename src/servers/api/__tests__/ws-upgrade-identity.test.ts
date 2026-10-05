/**
 * WebSocket upgrades never reach the HTTP request listener, so the identity
 * binding in request-identity.ts did not cover them: with no credentials a
 * client could subscribe to, or trigger a scan of, any user it named in a
 * message or in ?userId=. These tests drive the real upgrade handlers over a
 * real socket (http server on port 0 + the `ws` client). Only the Firebase
 * verifier, the logger (spied) and the data services behind each socket are
 * mocked. The token travels only as a `bearer.<token>` subprotocol.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

const TOK_A = 'jwtA-7f3c9e.payloadA.sigA';
const TOK_B = 'jwtB-1d2e3f.payloadB.sigB';
const TOK_D = 'jwtD-9a8b7c.payloadD.sigD';
const TOKENS: Record<string, string> = { [TOK_A]: 'user-A', [TOK_B]: 'user-B', [TOK_D]: 'dir-1' };
const verifyFirebaseToken = vi.fn(async (token: string) => {
  if (token === 'tok-expired') return { expired: true as const };
  const uid = TOKENS[token];
  return uid ? { uid, claims: {} } : null;
});
vi.mock('../../../services/identity/firebase-auth.js', () => ({ verifyFirebaseToken }));
vi.mock('../../../utils/interval-manager.js', () => ({
  registerInterval: vi.fn(),
  clearNamedInterval: vi.fn(),
}));

// Every log call from the code under test lands here, so we can prove no
// token is ever logged.
const logCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const record = (...args: unknown[]): number => logCalls.push(args);
  const levels = ['debug', 'info', 'warn', 'error', 'trace', 'fatal'];
  const logger = (): Record<string, unknown> => ({
    ...Object.fromEntries(levels.map((level) => [level, record])),
    child: logger,
  });
  return { ...real, createLogger: logger, getLogger: logger };
});

const snapshotFor = (uid: string) => {
  const overallLoadScore = uid === 'user-A' ? 11 : 99;
  return { overallLoadScore, stressIndicators: [], patterns: [], createdAt: new Date(0) };
};
const lifeContext = {
  lifeContextBroadcast: {
    subscribe: vi.fn(() => () => undefined),
    triggerScan: vi.fn(async (uid: string) => snapshotFor(uid)),
    shutdown: vi.fn(),
  },
  startLifeContextMonitoring: vi.fn(),
  stopLifeContextMonitoring: vi.fn(),
  getLifeContextSnapshot: vi.fn(() => undefined),
};
vi.mock('../../../services/communication/life-context-broadcast.js', () => lifeContext);
vi.mock('../../../intelligence/triggers/index.js', () => ({ generateSynthesisTriggers: () => [] }));

const insights = {
  insightsBroadcast: {
    subscribe: vi.fn(() => () => undefined),
    triggerScan: vi.fn(async (uid: string) => [{ id: `insight-of-${uid}` }]),
    shutdown: vi.fn(),
  },
  startInsightMonitoring: vi.fn(),
  stopInsightMonitoring: vi.fn(),
};
const teamStatus = {
  getProactiveInsights: vi.fn((uid: string) => [{ id: `insight-of-${uid}` }]),
  generateTeamStatus: vi.fn(async (uid: string) => ({ owner: uid })),
};
vi.mock('../../../services/communication/insights-broadcast.js', () => insights);
vi.mock('../../../services/cross-persona-insights.js', () => teamStatus);

type Broadcast = (userId: string, eventType: string, data: unknown) => void;
let userEventBroadcast: Broadcast | null = null;
vi.mock('../../../services/user-events/index.js', () => ({
  registerUserEventBroadcast: (fn: Broadcast) => {
    userEventBroadcast = fn;
    return () => undefined;
  },
}));

const lifeWs = await import('../../../services/communication/life-context-websocket.js');
const insightsWs = await import('../../../services/communication/insights-websocket.js');
const userEventsWs = await import('../../../services/communication/user-events-websocket.js');
const director = await import('../../../api/director-routes.js');

type Msg = Record<string, unknown>;
interface Outcome {
  status: number;
  ws?: WebSocket;
  messages: Msg[];
}

let server: Server | null = null;
let base = '';
const sockets: WebSocket[] = [];
const upgradeUrls: string[] = [];

async function start(init: (s: Server) => void): Promise<void> {
  const s = createServer();
  server = s;
  s.on('upgrade', (req) => upgradeUrls.push(req.url ?? ''));
  init(s);
  await new Promise<void>((resolve) => {
    s.listen(0, '127.0.0.1', resolve);
  });
  base = `ws://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

/** What a browser client sends: ['ferni.v1', 'bearer.<token>'], or nothing. */
const offer = (token?: string): string[] | undefined =>
  token ? ['ferni.v1', `bearer.${token}`] : undefined;

function connect(path: string, protocols?: string[]): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base}${path}`, protocols);
    const messages: Msg[] = [];
    ws.on('message', (d) => messages.push(JSON.parse(d.toString()) as Msg));
    ws.on('open', () => {
      sockets.push(ws);
      resolve({ status: 101, ws, messages });
    });
    ws.on('unexpected-response', (req, res) => {
      req.destroy();
      resolve({ status: res.statusCode ?? 0, messages });
    });
    ws.on('error', reject);
  });
}

/** Connect with a token and require the upgrade to succeed on ferni.v1. */
async function open(path: string, token: string): Promise<{ ws: WebSocket; messages: Msg[] }> {
  const { status, ws, messages } = await connect(path, offer(token));
  if (status !== 101 || !ws) throw new Error(`upgrade refused with ${status}`);
  expect(ws.protocol).toBe('ferni.v1');
  return { ws, messages };
}

function waitFor(messages: Msg[], pred: (m: Msg) => boolean): Promise<Msg> {
  return vi.waitFor(
    () => {
      const hit = messages.find(pred);
      if (!hit) throw new Error(`not yet; got ${JSON.stringify(messages)}`);
      return hit;
    },
    { timeout: 2000, interval: 10 }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  logCalls.length = 0;
  upgradeUrls.length = 0;
});
afterEach(async () => {
  // No token may ever reach a URL or a log line, on any path.
  const logged = JSON.stringify(logCalls, (_k, v: unknown) => (v instanceof Error ? String(v) : v));
  for (const token of [TOK_A, TOK_B, TOK_D]) {
    expect(logged).not.toContain(token);
    expect(upgradeUrls.join(' ')).not.toContain(token);
  }
  sockets.splice(0).forEach((ws) => ws.terminate());
  lifeWs.shutdownLifeContextWebSocket();
  insightsWs.shutdownInsightsWebSocket();
  userEventsWs.shutdownUserEventsWebSocket();
  director.shutdownDirectorWebSocket();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
  server = null;
});

describe('/ws/life-context', () => {
  beforeEach(() => start((s) => lifeWs.initLifeContextWebSocket(s)));

  it.each([
    ['no token', undefined],
    ['an expired token', offer('tok-expired')],
    ['a forged token', offer('forged')],
    ['a token in ?token= only', undefined],
  ])('refuses the upgrade with 401 for %s and reads no data', async (label, protocols) => {
    const query = label.includes('?token=') ? `?token=${TOK_A}` : '';
    const out = await connect(`/ws/life-context${query}`, protocols);
    expect(out.status).toBe(401);
    expect(lifeContext.lifeContextBroadcast.triggerScan).not.toHaveBeenCalled();
    upgradeUrls.length = 0; // this case put the token in the URL on purpose
  });

  it('acts on the verified user, never the userId a message names', async () => {
    const { ws, messages } = await open('/ws/life-context?userId=user-B', TOK_A);
    ws.send(JSON.stringify({ type: 'refresh', userId: 'user-B' }));
    const result = await waitFor(messages, (m) => m.type === 'refresh_result');
    ws.send(JSON.stringify({ type: 'subscribe', userId: 'user-B' }));
    await waitFor(messages, (m) => m.type === 'initial_state');

    expect(result).toMatchObject({ userId: 'user-A', success: true });
    expect((result.snapshot as Msg).overallLoadScore).toBe(11);
    const scanned = lifeContext.lifeContextBroadcast.triggerScan.mock.calls.map((c) => c[0]);
    expect(scanned).toEqual(['user-A', 'user-A']);
    expect(lifeContext.startLifeContextMonitoring.mock.calls).toEqual([['user-A']]);
  });

  it('never selects, so never echoes, the bearer subprotocol', async () => {
    await expect(connect('/ws/life-context', [`bearer.${TOK_A}`])).rejects.toThrow(/subprotocol/i);
  });
});

describe('/ws/insights', () => {
  beforeEach(() => start((s) => insightsWs.initInsightsWebSocket(s)));

  it('refuses the upgrade with 401 without a token', async () => {
    expect((await connect('/ws/insights?userId=user-B')).status).toBe(401);
    expect(insights.insightsBroadcast.triggerScan).not.toHaveBeenCalled();
  });

  it('scans and subscribes the verified user only', async () => {
    const { ws, messages } = await open('/ws/insights', TOK_A);
    ws.send(JSON.stringify({ type: 'scan', userId: 'user-B' }));
    ws.send(JSON.stringify({ type: 'subscribe', userId: 'user-B' }));
    await waitFor(messages, (m) => m.type === 'scan_result');
    await waitFor(messages, (m) => m.type === 'initial_state');

    expect(insights.insightsBroadcast.triggerScan.mock.calls).toEqual([['user-A']]);
    expect(teamStatus.generateTeamStatus.mock.calls.map((c) => c[0])).toEqual(['user-A', 'user-A']);
    expect(insights.startInsightMonitoring.mock.calls).toEqual([['user-A']]);
  });
});

describe('/ws/user-events', () => {
  beforeEach(() => start((s) => userEventsWs.initUserEventsWebSocket(s)));

  it('refuses the upgrade with 401 for a bare ?userId=', async () => {
    expect((await connect('/ws/user-events?userId=user-B')).status).toBe(401);
  });

  it('binds the socket to the verified uid, not ?userId= or a subscribe message', async () => {
    const { ws, messages } = await open('/ws/user-events?userId=user-B', TOK_A);
    const welcome = await waitFor(messages, (m) => m.type === 'welcome');
    ws.send(JSON.stringify({ type: 'subscribe', userId: 'user-B' }));
    const subscribed = await waitFor(messages, (m) => m.type === 'subscribed');

    if (!userEventBroadcast) throw new Error('broadcast not registered');
    userEventBroadcast('user-B', 'theme', { secret: 'B' });
    userEventBroadcast('user-A', 'theme', { secret: 'A' });
    await waitFor(messages, (m) => m.type === 'theme');

    expect(welcome.userId).toBe('user-A');
    expect(subscribed.userId).toBe('user-A');
    expect(messages.filter((m) => m.type === 'theme').map((m) => m.data)).toEqual([
      { secret: 'A' },
    ]);
  });
});

describe('/ws/director', () => {
  const engine = {
    getStateSnapshot: vi.fn(() => ({ lead: 'ferni' })),
    on: vi.fn(),
    off: vi.fn(),
  };
  beforeEach(async () => {
    director.registerDirectorEngine('s1', engine as never);
    await start((s) => director.initDirectorWebSocket(s, { authorizedDirectorIds: ['dir-1'] }));
  });
  afterEach(() => director.unregisterDirectorEngine('s1'));

  it('refuses a claimed ?userId= of an authorized director with no token', async () => {
    expect((await connect('/ws/director?sessionId=s1&userId=dir-1')).status).toBe(401);
    expect(engine.getStateSnapshot).not.toHaveBeenCalled();
  });

  it('authorizes the verified uid, not the claimed ?userId=', async () => {
    const { ws, messages } = await open('/ws/director?sessionId=s1&userId=dir-1', TOK_B);
    const closed = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    expect(closed).toBe(4001);
    expect(messages.some((m) => m.type === 'state')).toBe(false);
    expect(engine.getStateSnapshot).not.toHaveBeenCalled();
  });

  it('sends state to a verified authorized director', async () => {
    const { messages } = await open('/ws/director?sessionId=s1', TOK_D);
    const state = await waitFor(messages, (m) => m.type === 'state');
    expect(state.snapshot).toEqual({ lead: 'ferni' });
  });

  it('logs nothing containing the token when the verifier fails', async () => {
    verifyFirebaseToken.mockRejectedValueOnce(new Error(`bad token ${TOK_D.length}`));
    expect((await connect('/ws/director?sessionId=s1', offer(TOK_D))).status).toBe(401);
    expect(logCalls.length).toBeGreaterThan(0); // the failure was logged, without the token
  });
});
