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
// What the mocked model calls on /api/chat/message, and the tools it was offered.
const llm = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  offered: [] as string[],
}));
vi.mock('../../agents/shared/tool-dispatcher.js', () => ({ executeTool }));

// Native function call so /api/chat/message reaches the dispatcher.
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(opts: { tools?: Array<{ functionDeclarations: Array<{ name: string }> }> }) {
      llm.offered = (opts.tools?.[0]?.functionDeclarations ?? []).map((d) => d.name);
      return {
        generateContent: async () => ({
          response: {
            text: () => 'Looking that up.',
            functionCalls: () => llm.calls,
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

let lastBody: unknown;

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
    end: vi.fn((chunk?: string) => {
      lastBody = chunk ? JSON.parse(chunk) : undefined;
    }),
  } as unknown as ServerResponse;
  await handleChatRoutes(req, res, path);
  return status;
}

const ROUTES = [
  { path: '/api/chat/tool', body: { fn: 'recallFromMemory', args: { query: 'birthday' } } },
  { path: '/api/chat/message', body: { message: 'when is my birthday?' } },
];

function ranAs(): unknown[] {
  return executeTool.mock.calls.map((args) => (args[1] as { userId: string }).userId);
}

describe('chat API tool identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeTool.mockResolvedValue({ success: true, result: 'ok' });
    llm.calls = [{ name: 'recallFromMemory', args: { query: 'birthday' } }];
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

describe('chat API tool access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeTool.mockResolvedValue({ success: true, result: 'ok' });
  });

  function ranTools(): unknown[] {
    return executeTool.mock.calls.map((args) => (args[0] as { name: string }).name);
  }

  // Before: any signed-in user could text or call any number through /api/chat/tool.
  it('a signed-in user calling reachOut directly gets 403 and nothing runs', async () => {
    const body = { fn: 'reachOut', args: { phone: '+15555550100', message: 'hi' } };

    expect(await post('/api/chat/tool', body, 'alice')).toBe(403);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('a signed-in user cannot reach reachOut through the executeTool meta-tool', async () => {
    const body = {
      fn: 'executeTool',
      args: { toolName: 'reachOut', args: { phone: '+15555550100' } },
    };

    expect(await post('/api/chat/tool', body, 'alice')).toBe(403);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('a signed-in user calling a tool that is not on the list gets 403', async () => {
    expect(await post('/api/chat/tool', { fn: 'someToolNobodyListed', args: {} }, 'alice')).toBe(
      403
    );
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('a signed-in user may run a listed read tool directly', async () => {
    expect(await post('/api/chat/tool', { fn: 'getCalendarEvents', args: {} }, 'alice')).toBe(200);
    expect(ranTools()).toEqual(['getCalendarEvents']);
  });

  // An admin's unoffered tools need an explicit grant (chat-tool-grant.test.ts).
  it("an admin may run any tool directly with grant: 'admin'", async () => {
    const body = { fn: 'reachOut', args: { phone: '+15555550100', message: 'hi' }, grant: 'admin' };

    expect(await post('/api/chat/tool', body, 'admin-uid')).toBe(200);
    expect(ranTools()).toEqual(['reachOut']);
  });

  it('/api/chat/message: a model steered into sendEmail does not send for a signed-in user', async () => {
    llm.calls = [{ name: 'sendEmail', args: { to: 'someone@example.com', body: 'hi' } }];

    expect(await post('/api/chat/message', { message: 'email them' }, 'alice')).toBe(200);
    expect(executeTool).not.toHaveBeenCalled();
    expect(lastBody).toMatchObject({ toolCalls: [{ fn: 'sendEmail', success: false }] });
  });

  it('/api/chat/message: a signed-in user is offered only the listed tools', async () => {
    llm.calls = [];
    await post('/api/chat/message', { message: 'hi' }, 'alice');

    expect(llm.offered).toContain('recallFromMemory');
    expect(llm.offered).not.toContain('sendEmail');
    expect(llm.offered).not.toContain('scheduleCall');
  });

  it('/api/chat/message: an admin is offered the side-effecting tools and they run', async () => {
    llm.calls = [{ name: 'sendEmail', args: { to: 'someone@example.com', body: 'hi' } }];

    expect(await post('/api/chat/message', { message: 'email them' }, 'admin-uid')).toBe(200);
    expect(llm.offered).toContain('sendEmail');
    expect(ranTools()).toEqual(['sendEmail']);
  });
});
