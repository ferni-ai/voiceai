/**
 * One grant for chat: POST /api/chat/tool and POST /api/chat/message run only
 * the tools this caller was offered (the list GET /api/chat/tools returns).
 *
 * Before: the direct route checked a separate allowlist, so tools never
 * offered (musicInfo, suggestMusic) still ran for members, and an admin could
 * run any tool name at all (paybill, controllock, reachOut) with no record of
 * why. Now the only way past the offered list is an admin's explicit
 * `grant: 'admin'`, and every admin call is logged with the grant used.
 *
 * Drives the real route. Mocked: the auth verifier, the tool executor (the data
 * side), the Gemini SDK (an external LLM call) and the access module's logger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import type { IncomingMessage, ServerResponse } from 'http';

const executeTool = vi.hoisted(() => vi.fn());
const llm = vi.hoisted(() => ({ calls: [] as Array<{ name: string; args: object }> }));
const accessLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../agents/shared/tool-dispatcher.js', () => ({ executeTool }));
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'ChatToolAccess' ? accessLog : actual.createLogger(bindings),
  };
});
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: async () => ({
          response: { text: () => 'Done.', functionCalls: () => llm.calls },
        }),
      };
    }
  },
}));
// "Bearer <uid>" is a verified token for <uid>; admin-uid is an admin.
vi.mock('../auth-middleware.js', () => ({
  rateLimit: vi.fn(() => false),
  requireAuth: vi.fn(async (req: IncomingMessage) => {
    const userId = String(req.headers.authorization).slice(7);
    return { userId, isAdmin: userId === 'admin-uid' };
  }),
}));

process.env.GOOGLE_API_KEY = 'test-key';
const { handleChatRoutes } = await import('../chat-routes.js');

let lastBody: unknown;

async function call(
  method: 'GET' | 'POST',
  path: string,
  caller: string,
  body: Record<string, unknown> = {}
): Promise<number> {
  const stream = new PassThrough();
  const req = stream as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  req.headers = { authorization: `Bearer ${caller}` };
  stream.end(method === 'POST' ? JSON.stringify(body) : undefined);
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

const runTool = (caller: string, fn: string, extra: Record<string, unknown> = {}) =>
  call('POST', '/api/chat/tool', caller, { fn, args: {}, ...extra });

async function offeredTo(caller: string): Promise<string[]> {
  await call('GET', '/api/chat/tools', caller);
  return (lastBody as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
}

const ranTools = () => executeTool.mock.calls.map((args) => (args[0] as { name: string }).name);

beforeEach(() => {
  vi.clearAllMocks();
  executeTool.mockResolvedValue({ success: true, result: 'ok' });
  llm.calls = [];
});

describe('POST /api/chat/tool runs only offered tools', () => {
  it('a member calling a tool that was never offered gets 403 and nothing runs', async () => {
    const offered = await offeredTo('alice');
    for (const fn of ['musicInfo', 'suggestMusic', 'paybill']) {
      expect(offered).not.toContain(fn);
      expect(await runTool('alice', fn)).toBe(403);
    }
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('every tool offered to a member runs for that member', async () => {
    const offered = await offeredTo('alice');
    expect(offered.length).toBeGreaterThan(0);
    for (const fn of offered) expect(await runTool('alice', fn)).toBe(200);
    expect(ranTools()).toEqual(offered);
  });

  it("offers members the CLI's own-data email reads, so `ferni email` keeps working", async () => {
    const offered = await offeredTo('alice');
    for (const fn of ['getEmailFollowups', 'getImportantEmails', 'searchEmails']) {
      expect(offered).toContain(fn);
    }
  });

  it("a member's grant: 'admin' changes nothing", async () => {
    expect(await runTool('alice', 'reachOut', { grant: 'admin' })).toBe(403);
    expect(executeTool).not.toHaveBeenCalled();
  });
});

describe('admin calls need an explicit, logged grant', () => {
  it('an admin calling an unoffered tool without a grant gets 403 and nothing runs', async () => {
    expect(await offeredTo('admin-uid')).not.toContain('reachOut');
    expect(await runTool('admin-uid', 'reachOut')).toBe(403);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("an admin's explicit grant: 'admin' runs it, logged with caller, acting user and grant", async () => {
    const status = await runTool('admin-uid', 'reachOut', { grant: 'admin', userId: 'bob' });

    expect(status).toBe(200);
    expect(ranTools()).toEqual(['reachOut']);
    expect(accessLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        callerId: 'admin-uid',
        actingUserId: 'bob',
        tool: 'reachOut',
        grant: 'admin',
      }),
      expect.any(String)
    );
  });

  it('an admin running an offered tool is logged with the offered grant', async () => {
    expect(await runTool('admin-uid', 'sendEmail')).toBe(200);
    expect(accessLog.info).toHaveBeenCalledWith(
      expect.objectContaining({ callerId: 'admin-uid', tool: 'sendEmail', grant: 'offered' }),
      expect.any(String)
    );
  });
});

describe('the admin grant has limits', () => {
  it('no grant covers the executeTool meta-tool, which hides the tool that runs', async () => {
    const body = { grant: 'admin', args: { toolName: 'paybill', args: {} } };
    expect(await runTool('admin-uid', 'executeTool', body)).toBe(403);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('a non-string tool name is refused even under the grant', async () => {
    expect(await runTool('admin-uid', { name: 'paybill' } as never, { grant: 'admin' })).toBe(403);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('an admin running an offered tool for someone else is logged at warn', async () => {
    expect(await runTool('admin-uid', 'sendEmail', { userId: 'bob' })).toBe(200);
    expect(accessLog.warn).toHaveBeenCalledWith(
      expect.objectContaining({ actingUserId: 'bob', tool: 'sendEmail', grant: 'offered' }),
      expect.any(String)
    );
  });
});

describe('POST /api/chat/message runs only offered tools', () => {
  it('a model call to a tool it was not offered does not run, even for an admin', async () => {
    llm.calls = [{ name: 'paybill', args: {} }];

    expect(await call('POST', '/api/chat/message', 'admin-uid', { message: 'pay it' })).toBe(200);
    expect(executeTool).not.toHaveBeenCalled();
    expect(lastBody).toMatchObject({ toolCalls: [{ fn: 'paybill', success: false }] });
  });
});
