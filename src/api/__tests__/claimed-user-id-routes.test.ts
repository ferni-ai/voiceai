/**
 * Routes that read the user from getUserId act only on the verified caller.
 *
 * getUserId (api/helpers.ts) used to return ?userId= to anyone, and the
 * voice-auth and marketplace helpers returned a raw x-user-id. They were safe
 * only because the door (servers/api/request-identity.ts) rewrites those
 * claims in production; in development it takes them as given. So these tests
 * run the real door in development, the case where nothing else stands
 * between a claim and the data, and check each route family:
 * - anonymous, naming B (query, x-user-id and a forged x-firebase-uid) → 401
 * - caller A naming B → A's data, never B's
 * - a verified admin naming B → B, where the route supported that before
 *
 * Only token verification and each route's data service are mocked.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const data = vi.hoisted(() => ({
  calendarConfigured: vi.fn(async () => false),
  teamBriefing: vi.fn(async () => ({ incomingInsights: [], proactiveDiscoveries: [] })),
  emotionalHistory: vi.fn(async () => undefined),
  voiceMemory: vi.fn(async () => null),
  installations: vi.fn(() => []),
  conversations: vi.fn(async (_uid: unknown) => true),
}));

// "tok-admin" is an admin's token; "tok-<name>" verifies as uid-<name>.
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) => {
    if (token === 'tok-admin') return { uid: 'admin-uid', claims: { admin: true } };
    return token.startsWith('tok-') ? { uid: `uid-${token.slice(4)}`, claims: {} } : null;
  }),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
}));

vi.mock('../../services/identity/google-calendar-oauth.js', () => ({
  isCalendarConfigured: data.calendarConfigured,
  deleteUserTokens: vi.fn(),
}));
vi.mock('../../services/calendar/providers/apple-provider.js', () => ({
  appleCalendarProvider: { isConnected: vi.fn(async () => false) },
}));
vi.mock('../../services/calendar/providers/outlook-provider.js', () => ({
  outlookCalendarProvider: { isConnected: vi.fn(async () => false), isConfigured: () => false },
}));
vi.mock('../../services/cross-persona-insights.js', () => ({
  buildInsightBriefingForHandoff: data.teamBriefing,
  generateTeamStatus: vi.fn(async () => ({})),
  acknowledgeInsight: vi.fn(),
  scanForCrossPersonaInsights: vi.fn(),
}));
vi.mock('../../intelligence/context-builders/superhuman/superhuman-integration.js', () => ({
  getPerformanceStats: vi.fn(),
  clearPerformanceLog: vi.fn(),
  clearAllSuperhumanCache: vi.fn(),
}));
vi.mock('../../tools/semantic-router/advanced/better-than-human.js', () => ({
  loadEmotionalHistory: data.emotionalHistory,
  analyzeEmotionalArc: vi.fn(() => ({ dataPoints: [] })),
  getEmotionalArcSummary: vi.fn(() => ''),
}));
vi.mock('../../services/memory/realtime-memory.js', () => ({
  getUserMemoryForAPI: data.voiceMemory,
  getConversationContextForAPI: vi.fn(),
  getConversationsWithTurnsForAPI: vi.fn(),
}));
vi.mock('../../marketplace/index.js', () => ({
  listInstallations: data.installations,
  getAgent: vi.fn(),
  getInstallation: vi.fn(),
  getTool: vi.fn(),
  installItem: vi.fn(),
  uninstallItem: vi.fn(),
}));
// Engagement's own gate is under test; the handler behind it reports who it got.
vi.mock('../routes/conversations.js', () => ({
  handleConversationsRoutes: vi.fn(async (req: IncomingMessage) =>
    data.conversations(req.headers['x-firebase-uid'])
  ),
}));

const { bindVerifiedIdentity } = await import('../../servers/api/request-identity.js');
const { handleCalendarRoutes } = await import('../calendar-routes/index.js');
const { handleEngagementRoutes } = await import('../engagement-routes.js');
const { handleTeamInsightsRoutes } = await import('../routes/team-insights.js');
const { handleIntelligenceRoutes } = await import('../routes/intelligence-routes.js');
const { handleMemoryRoutes } = await import('../voice-auth/memory-routes.js');
const { handleInstallRoutes } = await import('../marketplace/install-routes.js');

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<unknown>;

interface Family {
  name: string;
  path: string;
  handler: Handler;
  /** The data call that shows whose data was read (first argument). */
  spy: Mock;
  /** Whether a verified admin may name the user (true before this change too). */
  adminMayName: boolean;
}

const FAMILIES: Family[] = [
  {
    name: 'calendar',
    path: '/api/calendar/providers/status',
    handler: (req, res, url) => handleCalendarRoutes(req, res, url.pathname, url),
    spy: data.calendarConfigured,
    adminMayName: true,
  },
  {
    name: 'engagement',
    path: '/api/conversations',
    handler: (req, res, url) => handleEngagementRoutes(req, res, url.pathname, url),
    spy: data.conversations,
    adminMayName: false, // the gate has always preferred the verified caller
  },
  {
    name: 'team insights',
    path: '/api/team-insights',
    handler: (req, res, url) => handleTeamInsightsRoutes(req, res, url.pathname, url),
    spy: data.teamBriefing,
    adminMayName: true,
  },
  {
    name: 'intelligence',
    path: '/api/intelligence/emotional-arc',
    handler: (req, res, url) => handleIntelligenceRoutes(req, res, url.pathname, url),
    spy: data.emotionalHistory,
    adminMayName: true,
  },
  {
    name: 'voice memory',
    path: '/api/voice/memory',
    handler: (req, res) => handleMemoryRoutes(req, res, '/memory'),
    spy: data.voiceMemory,
    adminMayName: true,
  },
  {
    name: 'marketplace installs',
    path: '/api/marketplace/install/list',
    handler: (req, res, url) => handleInstallRoutes(req, res, url.pathname, 'GET'),
    spy: data.installations,
    adminMayName: true,
  },
];

/** Send a GET naming victim-b every way a client can, through the real door. */
async function call(family: Family, token: string | null): Promise<number> {
  const headers: Record<string, string> = {
    'x-user-id': 'victim-b',
    'x-firebase-uid': 'victim-b', // forged; the door must drop it
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const req = {
    method: 'GET',
    url: `${family.path}?userId=victim-b`,
    headers,
    socket: { remoteAddress: '203.0.113.9' },
  } as unknown as IncomingMessage;
  await bindVerifiedIdentity(req, { NODE_ENV: 'development' });

  let status = 200;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  await family.handler(req, res, new URL(`http://x${req.url}`));
  return status;
}

const readFor = (spy: Mock) => spy.mock.calls.map((args) => args[0]);

describe.each(FAMILIES)('$name routes take the user from verified credentials', (family) => {
  beforeEach(() => vi.clearAllMocks());

  it('refuse an anonymous caller who names a user', async () => {
    expect(await call(family, null)).toBe(401);
    expect(family.spy).not.toHaveBeenCalled();
  });

  it('give a signed-in caller who names someone else their own data', async () => {
    await call(family, 'tok-a');
    expect(readFor(family.spy)).toEqual(['uid-a']);
  });

  it.runIf(family.adminMayName)('let a verified admin act for the user they name', async () => {
    await call(family, 'tok-admin');
    expect(readFor(family.spy)).toEqual(['victim-b']);
  });
});
