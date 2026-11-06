/**
 * WEB_CHAT_MESSAGE: POST /api/chat/message is off by default (no crisis read runs
 * before its LLM; #3549). Off, it returns 404 before auth: no model call, no tool
 * run, no write. On, it answers as before. The other chat routes ignore the flag.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const executeTool = vi.hoisted(() => vi.fn());
const generateContent = vi.hoisted(() => vi.fn());
const requireAuth = vi.hoisted(() => vi.fn());
const rateLimit = vi.hoisted(() => vi.fn(() => false));
vi.mock('../../agents/shared/tool-dispatcher.js', () => ({ executeTool }));
vi.mock('../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({ models: { generateContent } }),
}));
vi.mock('../auth-middleware.js', () => ({ rateLimit, requireAuth }));
// The hold record is the route's first storage read; off, it is never reached.
const chatHold = vi.hoisted(() => vi.fn(async () => ({ held: false, note: '' })));
vi.mock('../chat-minor-care.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../chat-minor-care.js')>()),
  chatHold,
}));

const { handleChatRoutes } = await import('../chat-routes.js');

async function call(
  method: 'GET' | 'POST',
  path: string,
  body?: object
): Promise<{ status: number; body: unknown }> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = { authorization: 'Bearer riley-test-uid' };
  stream.end(body ? JSON.stringify(body) : undefined);
  let status = 200;
  let sent: unknown;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn((chunk?: string) => {
      sent = chunk ? JSON.parse(chunk) : undefined;
    }),
  } as unknown as ServerResponse;
  expect(await handleChatRoutes(req, res, path)).toBe(true);
  return { status, body: sent };
}

const MESSAGE = { message: 'remind me to call Priya at 6', personaId: 'ferni' };

beforeEach(() => {
  requireAuth.mockResolvedValue({ userId: 'riley-test-uid', isAdmin: false });
  generateContent.mockResolvedValue({
    text: 'Sure.',
    functionCalls: [{ name: 'recallFromMemory', args: { query: 'Priya' } }],
  });
  executeTool.mockResolvedValue({ success: true, result: 'ok' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('WEB_CHAT_MESSAGE', () => {
  it.each([undefined, 'off', 'false'])(
    'flag %s: 404, and no auth read, no storage read, no model call, no tool run',
    async (value) => {
      if (value !== undefined) vi.stubEnv('WEB_CHAT_MESSAGE', value);
      const { status } = await call('POST', '/api/chat/message', MESSAGE);
      expect(status).toBe(404);
      expect(requireAuth).not.toHaveBeenCalled();
      expect(rateLimit).not.toHaveBeenCalled();
      expect(chatHold).not.toHaveBeenCalled();
      expect(generateContent).not.toHaveBeenCalled();
      expect(executeTool).not.toHaveBeenCalled();
    }
  );

  it('flag off: a crisis message is not sent to the model either', async () => {
    const { status } = await call('POST', '/api/chat/message', { message: 'I want to die' });
    expect(status).toBe(404);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('flag on: the model is called, its tool runs, and the reply is a 200 as before', async () => {
    vi.stubEnv('WEB_CHAT_MESSAGE', 'on');
    const { status, body } = await call('POST', '/api/chat/message', MESSAGE);
    expect(status).toBe(200);
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(chatHold).toHaveBeenCalledWith('riley-test-uid');
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(executeTool.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual([
      'recallFromMemory',
    ]);
    expect(body).toMatchObject({ success: true });
  });

  it('flag off: the other chat routes are unchanged', async () => {
    const { status } = await call('GET', '/api/chat/tools');
    expect(status).toBe(200);
    expect(requireAuth).toHaveBeenCalledTimes(1);
  });
});
