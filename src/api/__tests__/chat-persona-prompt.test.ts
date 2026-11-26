/**
 * #3631: POST /api/chat/message picks the system prompt from a plain object keyed by the request's
 * personaId. A personaId naming an Object.prototype member used to read the prototype, so the
 * model was sent "[object Object]" or a function's source as the persona. It now gets Ferni, as
 * any unknown persona id does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const generateContent = vi.hoisted(() => vi.fn());
vi.mock('../../agents/shared/tool-dispatcher.js', () => ({ executeTool: vi.fn() }));
vi.mock('../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({ models: { generateContent } }),
}));
vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async () => ({ userId: 'riley-test-uid', isAdmin: false })),
}));
vi.mock('../chat-minor-care.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../chat-minor-care.js')>()),
  chatHold: vi.fn(async () => ({ held: false, note: '' })),
}));

const { handleChatRoutes } = await import('../chat-routes.js');

/** The system prompt the model was sent for one chat message from this personaId. */
async function systemPromptFor(personaId: string): Promise<string> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = '/api/chat/message';
  req.headers = { authorization: 'Bearer riley-test-uid' };
  stream.end(JSON.stringify({ message: 'what should I cook tonight', personaId }));
  let status = 200;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  await handleChatRoutes(req, res, '/api/chat/message');
  expect(status).toBe(200);
  expect(generateContent).toHaveBeenCalledTimes(1);
  const request = generateContent.mock.calls[0][0] as {
    contents: Array<{ parts: Array<{ text: string }> }>;
  };
  return request.contents[0].parts[0].text;
}

beforeEach(() => {
  vi.stubEnv('WEB_CHAT_MESSAGE', 'on');
  generateContent.mockResolvedValue({ text: 'Pasta.', functionCalls: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('chat: a prototype member name as personaId is an unknown persona (#3631)', () => {
  it('the control: a known persona gets its own prompt', async () => {
    expect(await systemPromptFor('maya')).toMatch(/^You are Maya, /);
  });

  it('the control: an unknown persona id gets Ferni', async () => {
    expect(await systemPromptFor('no-such-persona')).toMatch(/^You are Ferni, /);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    '%s gets Ferni, never a prototype value',
    async (personaId) => {
      const prompt = await systemPromptFor(personaId);
      expect(prompt).toMatch(/^You are Ferni, /);
      expect(prompt).not.toMatch(/\[object Object\]|\[native code\]/);
    }
  );
});
