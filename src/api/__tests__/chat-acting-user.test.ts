/**
 * The chat API runs tools as the verified caller, never as a user the body names.
 *
 * Before: both POST /api/chat/message and POST /api/chat/tool used
 * `body.userId || auth.userId`, so any signed-in user could run tools —
 * memory recall, calendar, email — against another user's data by naming them.
 *
 * Drives the real route. Mocked: the auth verifier, the tool executor (the data
 * side) and the Gemini SDK (an external LLM call).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const executeTool = vi.hoisted(() => vi.fn());
vi.mock('../../agents/shared/tool-dispatcher.js', () => ({ executeTool }));

// Native function call so /api/chat/message reaches the dispatcher.
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: async () => ({
          response: {
            text: () => 'Looking that up.',
            functionCalls: () => [{ name: 'recallMemory', args: { query: 'birthday' } }],
          },
        }),
      };
    }
  },
}));

// The verifier: "Bearer <uid>" is a verified token for <uid>; admin-uid is an admin.
vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    const userId = header.slice(7);
    return { userId, isAdmin: userId === 'admin-uid' };
  }),
}));

process.env.GOOGLE_API_KEY = 'test-key';
const { handleChatRoutes } = await import('../chat-routes.js');

async function post(path: string, body: Record<string, unknown>, caller: string): Promise<number> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = 'POST';
  req.url = path;
  req.headers = { authorization: `Bearer ${caller}` };
  stream.end(JSON.stringify(body));

  let status = 200;
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((s: number) => {
      status = s;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  await handleChatRoutes(req, res, path);
  return status;
}

const ROUTES = [
  { path: '/api/chat/tool', body: { fn: 'recallMemory', args: { query: 'birthday' } } },
  { path: '/api/chat/message', body: { message: 'when is my birthday?' } },
];

function ranAs(): unknown[] {
  return executeTool.mock.calls.map((args) => (args[1] as { userId: string }).userId);
}

describe('chat API tool identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeTool.mockResolvedValue({ success: true, result: 'ok' });
  });

  for (const route of ROUTES) {
    it(`${route.path}: signed-in alice naming bob gets 403 and no tool runs as bob`, async () => {
      const status = await post(route.path, { ...route.body, userId: 'bob' }, 'alice');

      expect(status).toBe(403);
      expect(executeTool).not.toHaveBeenCalled();
    });

    it(`${route.path}: alice naming herself (as the CLI does) runs tools as alice`, async () => {
      const status = await post(route.path, { ...route.body, userId: 'alice' }, 'alice');

      expect(status).toBe(200);
      expect(ranAs()).toEqual(['alice']);
    });

    it(`${route.path}: alice naming nobody runs tools as alice`, async () => {
      const status = await post(route.path, route.body, 'alice');

      expect(status).toBe(200);
      expect(ranAs()).toEqual(['alice']);
    });
  }

  it('a verified admin may run a tool for the user the body names', async () => {
    const status = await post('/api/chat/tool', { ...ROUTES[0].body, userId: 'bob' }, 'admin-uid');

    expect(status).toBe(200);
    expect(ranAs()).toEqual(['bob']);
  });
});
