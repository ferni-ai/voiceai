/**
 * WEB_CHAT_MESSAGE: POST /api/chat/message and POST /api/chat/tool are off by
 * default (no crisis read runs on the text either takes; #3549). Off, both return
 * 404 before auth: no model call, no tool run, no write. On, they answer as
 * before. GET /api/chat/tools ignores the flag.
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
): Promise<{ status: number; body: unknown; handled: boolean }> {
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
  // As the server routes it (servers/api/index.ts): the pathname, without its query string.
  const handled = await handleChatRoutes(req, res, new URL(path, 'http://localhost').pathname);
  return { status, body: sent, handled };
}

const MESSAGE = { message: 'remind me to call Priya at 6', personaId: 'ferni' };
const TOOL = { fn: 'recallFromMemory', args: { query: 'Priya' } };
const OFF_ROUTES = [
  ['/api/chat/message', MESSAGE],
  ['/api/chat/tool', TOOL],
] as const;

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
  describe.each(OFF_ROUTES)('%s', (path, body) => {
    it.each([undefined, '', 'off', 'false', '0', 'OFF', 'shadow', 'maybe', ' no '])(
      'flag %s: 404, and no auth read, no storage read, no model call, no tool run',
      async (value) => {
        if (value !== undefined) vi.stubEnv('WEB_CHAT_MESSAGE', value);
        const { status, handled } = await call('POST', path, body);
        expect(handled).toBe(true);
        expect(status).toBe(404);
        expect(requireAuth).not.toHaveBeenCalled();
        expect(rateLimit).not.toHaveBeenCalled();
        expect(chatHold).not.toHaveBeenCalled();
        expect(generateContent).not.toHaveBeenCalled();
        expect(executeTool).not.toHaveBeenCalled();
      }
    );
  });

  it.each(['/api/chat/message?x=1', '/api/chat/tool?fn=recallFromMemory'])(
    'flag off: %s is 404 too, with no model call and no tool run',
    async (url) => {
      const { status, handled } = await call('POST', url, MESSAGE);
      expect(handled).toBe(true);
      expect(status).toBe(404);
      expect(requireAuth).not.toHaveBeenCalled();
      expect(generateContent).not.toHaveBeenCalled();
      expect(executeTool).not.toHaveBeenCalled();
    }
  );

  it('flag off: a crisis message is not sent to the model either', async () => {
    const { status } = await call('POST', '/api/chat/message', { message: 'I want to die' });
    expect(status).toBe(404);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([
    '/api/chat/message/',
    '/API/CHAT/MESSAGE',
    '/api/chat//message',
    '/api/chat/message.json',
    '/api/chat/tool/',
    '/API/CHAT/TOOL',
    // Not this route: unhandled here (the server's 404) or another chat route's answer.
  ])('flag off: %s reaches no model and no tool either', async (path) => {
    await call('POST', path, MESSAGE);
    expect(generateContent).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it.each(['on', 'ON', ' on ', 'true', '1', 'live'])(
    'flag %j: the model is called and its tool runs',
    async (value) => {
      vi.stubEnv('WEB_CHAT_MESSAGE', value);
      expect((await call('POST', '/api/chat/message', MESSAGE)).status).toBe(200);
      expect(generateContent).toHaveBeenCalledTimes(1);
      expect(executeTool).toHaveBeenCalledTimes(1);
    }
  );

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

  it.each(['on', 'ON', ' on ', 'true', '1', 'live'])(
    'flag %j: a direct tool call runs as before',
    async (value) => {
      vi.stubEnv('WEB_CHAT_MESSAGE', value);
      const { status, body } = await call('POST', '/api/chat/tool', TOOL);
      expect(status).toBe(200);
      expect(requireAuth).toHaveBeenCalledTimes(1);
      expect(executeTool).toHaveBeenCalledTimes(1);
      expect(generateContent).not.toHaveBeenCalled();
      expect(body).toMatchObject({ success: true, result: 'ok' });
    }
  );

  it('flag off: the tool list is unchanged', async () => {
    const { status } = await call('GET', '/api/chat/tools');
    expect(status).toBe(200);
    expect(requireAuth).toHaveBeenCalledTimes(1);
  });
});
