/**
 * Talk to past self in the Chronicle posts only `{ userMessage, agentId }`. The
 * route used to have no profile and answered 500 (journal audit 2026-10-13);
 * now it builds the profile from the caller's own twin and finds the journal
 * entries the message is about. talk-to-twin's own profile is left alone.
 *
 * Drives the real route as a signed-in caller; the model, token checks, the
 * caller's agents and their journal are mocked.
 */
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  callLLM: vi.fn<(prompt: string, opts?: unknown) => Promise<string | null>>(),
  listCustomAgents: vi.fn<(uid: string) => Promise<unknown[]>>(),
  getCustomAgent: vi.fn<(uid: string, id: string) => Promise<unknown>>(),
  getAllEntries: vi.fn<(uid: string, options?: unknown) => Promise<unknown[]>>(),
}));
vi.mock('../../services/llm-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callLLM: m.callLLM,
}));
vi.mock('../../services/custom-agent/custom-agent-persistence-service.js', () => ({
  listCustomAgents: m.listCustomAgents,
  getCustomAgent: m.getCustomAgent,
}));
vi.mock('../../services/journal/index.js', () => ({
  getJournalService: () => ({ getAllEntries: m.getAllEntries }),
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
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));

const { handleJournalRoutes } = await import('../journal-routes.js');

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
  return {
    status: writeHead.mock.calls[0]?.[0] as number | undefined,
    body: JSON.parse(String(end.mock.calls[0]?.[0] ?? '{}')) as Record<string, unknown>,
  };
}

const twin = {
  id: 'twin-sam',
  type: 'twin',
  name: 'sam',
  displayName: 'Sam Rivera',
  personality: { values: ['honesty'], passions: ['walking'], worldview: 'keep going' },
  behaviors: { catchphrases: ['honestly, friend'], greetings: ['hey you'] },
};
const coach = { ...twin, id: 'coach-1', type: 'custom', displayName: 'Coach' };
const entry = (content: string, themes: string[] = []) => ({
  content,
  themes,
  createdAt: new Date('2026-04-01'),
  mood: { label: 'Calm' },
});

const prompt = () => m.callLLM.mock.calls[0]?.[0] ?? '';

beforeEach(() => {
  m.callLLM.mockReset().mockResolvedValue('We kept walking by the lake, remember?');
  m.listCustomAgents.mockReset().mockResolvedValue([coach, twin]);
  m.getCustomAgent.mockReset().mockResolvedValue(null);
  m.getAllEntries
    .mockReset()
    .mockResolvedValue([
      entry('We walked by the lake every morning in April.', ['resilience']),
      entry('Taxes are due on Friday.', ['money']),
    ]);
});

describe("the Chronicle's talk to past self", () => {
  it("answers from the caller's twin and the journal entries the message is about", async () => {
    const { status, body } = await post({
      userMessage: 'Do you remember the lake?',
      agentId: null,
    });

    expect(status).toBe(200);
    expect(body.response).toBe('We kept walking by the lake, remember?');
    expect(prompt()).toContain("You are Sam Rivera's past self");
    expect(prompt()).toContain('"honestly, friend"');
    expect(prompt()).toContain('We walked by the lake every morning in April.');
    expect(prompt()).not.toContain('Taxes are due on Friday.');
    expect(prompt()).toContain('resilience');
  });

  it('an entry that shares only words like "the" and "you" is not relevant', async () => {
    m.getAllEntries.mockResolvedValue([
      entry('The day you called, I was at the office.'),
      entry('We walked by the lake every morning in April.'),
    ]);
    await post({ userMessage: 'Do you remember the lake?', agentId: null });

    expect(prompt()).toContain('We walked by the lake every morning in April.');
    expect(prompt()).not.toContain('The day you called, I was at the office.');
  });

  it('reads only the signed-in caller’s agents and journal', async () => {
    await post({ userMessage: 'Do you remember the lake?', agentId: null, userId: 'uid-other' });

    expect(m.listCustomAgents.mock.calls).toEqual([['uid-sam']]);
    expect(m.getAllEntries.mock.calls.map(([uid]) => uid)).toEqual(['uid-sam']);
  });

  it('an agentId that is not a twin gets no profile: 400 and no model call', async () => {
    m.getCustomAgent.mockResolvedValue(coach);
    const { status, body } = await post({ userMessage: 'hello', agentId: 'coach-1' });

    expect(status).toBe(400);
    expect(body.error).toBe('Missing profile');
    expect(m.callLLM).not.toHaveBeenCalled();
  });

  it("keeps the profile talk-to-twin sends and doesn't look the twin up", async () => {
    const sent = {
      name: 'Client Sam',
      mannerisms: [],
      values: [],
      communicationStyle: '',
      philosophy: '',
      passions: [],
    };
    await post({ userMessage: 'hello', profile: sent, relevantJournals: [], keyThemes: [] });

    expect(prompt()).toContain("You are Client Sam's past self");
    expect(m.listCustomAgents).not.toHaveBeenCalled();
  });
});
