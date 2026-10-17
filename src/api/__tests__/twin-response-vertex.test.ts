/**
 * POST /api/journal/twin-response answers through callLLM (Vertex first), so a
 * twin replies on prod, which has no OPENAI_API_KEY. A request without a
 * profile from someone with no twin is a 400, not a 500 from a crash.
 *
 * Drives the real route as a signed-in caller; the model, token checks and rate
 * limiting are mocked.
 */
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callLLM = vi.hoisted(() =>
  vi.fn<(prompt: string, opts?: unknown) => Promise<string | null>>()
);
vi.mock('../../services/llm-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callLLM,
}));
vi.mock('../../services/custom-agent/memory-capture-service.js', () => ({
  transcribeAudioBuffer: vi.fn(),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token === 'tok-sam' ? { uid: 'uid-sam', claims: {} } : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  listCustomAgents: vi.fn(async () => []), // no twin
  getCustomAgent: vi.fn(async () => null),
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));

const { handleJournalRoutes } = await import('../journal-routes.js');
const { hasTwinProfile } = await import('../../services/custom-agent/twin-reply.js');

async function post(body: Record<string, unknown>) {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/journal/twin-response';
  req.headers = { host: 'localhost', authorization: 'Bearer tok-sam' };
  (req as { socket?: unknown }).socket = { remoteAddress: '127.0.0.1' };
  stream.end(JSON.stringify(body));
  const writeHead = vi.fn();
  const end = vi.fn();
  const res = { setHeader: vi.fn(), writeHead, end } as unknown as ServerResponse;
  await handleJournalRoutes(req, res, '/api/journal/twin-response');
  const status =
    (writeHead.mock.calls[0]?.[0] as number | undefined) ??
    (res as { statusCode?: number }).statusCode;
  return {
    status,
    body: JSON.parse(String(end.mock.calls[0]?.[0] ?? '{}')) as Record<string, unknown>,
  };
}

const profile = {
  name: 'Sam',
  mannerisms: ['honestly,'],
  values: ['honesty'],
  communicationStyle: 'direct',
  philosophy: 'keep going',
  passions: ['walking'],
};
const request = {
  userMessage: 'I feel stuck, do you remember last spring?',
  profile,
  relevantJournals: [
    { content: 'Spring was rough but we kept walking every morning', date: '2026-04-01' },
  ],
  keyThemes: ['resilience'],
};

describe('twin replies through callLLM', () => {
  beforeEach(() => callLLM.mockReset());

  it('answers 200 with the model reply, from a prompt built on their profile and journals', async () => {
    callLLM.mockResolvedValue('  We walked through it every morning, remember?  ');
    const { status, body } = await post(request);
    expect(status).toBe(200);
    expect(body.response).toBe('We walked through it every morning, remember?');
    const prompt = callLLM.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain("You are Sam's past self");
    expect(prompt).toContain('Spring was rough but we kept walking every morning');
    expect(prompt).toContain('I feel stuck, do you remember last spring?');
  });

  it('answers 503 with no reply when no model answers', async () => {
    callLLM.mockResolvedValue(null);
    const { status, body } = await post(request);
    expect(status).toBe(503);
    expect(body).not.toHaveProperty('response');
  });

  it('an empty model reply is no reply', async () => {
    callLLM.mockResolvedValue('   ');
    expect((await post(request)).status).toBe(503);
  });

  it('a request without a profile from someone with no twin is a 400 and calls no model', async () => {
    const { status, body } = await post({ userMessage: 'hello', agentId: null });
    expect(status).toBe(400);
    expect(body.error).toBe('Missing profile');
    expect(callLLM).not.toHaveBeenCalled();
  });
});

describe('hasTwinProfile', () => {
  it('needs a name and the three lists the prompt reads', () => {
    expect(hasTwinProfile(profile)).toBe(true);
    expect(hasTwinProfile(undefined)).toBe(false);
    expect(hasTwinProfile({ ...profile, name: ' ' })).toBe(false);
    expect(hasTwinProfile({ ...profile, values: undefined })).toBe(false);
    expect(hasTwinProfile({ name: 'Sam' })).toBe(false);
  });
});
