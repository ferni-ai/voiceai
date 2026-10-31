/**
 * GMAIL_READ_TOOLS (lane G2): the Google link has no gmail.readonly, so every Gmail
 * read meets a 401/403. Off (default): the read tools are not offered. On: a 401/403,
 * a missing scope or a failed read is an honest "can't read", never "no emails"; a
 * real empty inbox still says so. GOOGLE_LINK_HONEST keeps the honest service path.
 * Real Gmail service, real tool definitions, real registry gate; only fetch and the token are faked.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const google = vi.hoisted(() => ({ token: 'ya29.calendar-only' as string | null, linked: true }));
vi.mock('../../identity/google-calendar-oauth.js', () => ({
  getValidAccessToken: vi.fn(async () => google.token),
  isCalendarConfigured: vi.fn(async () => google.linked),
}));
vi.mock('../../../utils/circuit-breaker.js', () => ({
  getCircuitBreaker: () => ({ execute: <T>(fn: () => Promise<T>) => fn() }),
}));

const { getGmailToolDefinitions } =
  await import('../../../tools/domains/communication/gmail-tools.js');
const { definitions: emailIntelligenceDefs } =
  await import('../../../tools/domains/email-intelligence/index.js');
const { GmailNotPermittedError, GMAIL_READ_NOT_CONNECTED } = await import('../gmail-honesty.js');
const { getUnreadMessages } = await import('../gmail-service.js');
const { ToolRegistry } = await import('../../../tools/registry/index.js');
const { getToolOwner } = await import('../../../tools/runtime-enforcement.js');

const NOT_CONNECTED = { unavailable: 'gmail_not_permitted', say: GMAIL_READ_NOT_CONNECTED };
const EMPTY_CLAIM = /no (unread |recent )?emails|inbox is clear|no emails found/i;
const READ_IDS = [
  'getInboxSummary',
  'getUnreadEmails',
  'searchInbox',
  'triageInbox',
  'getEmailThread',
  'checkEmailFrom',
  'analyzeInboxPriority',
  'summarizeThread',
];
const ARGS: Record<string, unknown> = {
  searchInbox: { query: 'is:unread' },
  checkEmailFrom: { sender: 'jo' },
  getEmailThread: { threadId: 't1' },
  summarizeThread: { query: 'lease' },
};

function allDefs() {
  return [...getGmailToolDefinitions(), ...emailIntelligenceDefs];
}

function run(id: string) {
  const def = allDefs().find((d) => d.id === id)!;
  return def.create({ userId: 'u1' } as never).execute(ARGS[id] ?? {}, {});
}

/** Tool ids the real registry accepts (tool-availability gate). */
function offered(): string[] {
  const registry = new ToolRegistry();
  for (const def of allDefs()) registry.register(def);
  return allDefs()
    .map((d) => d.id)
    .filter((id) => registry.has(id));
}

function gmailAnswers(status: number, body: unknown) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(JSON.stringify(body), { status })
  );
}

const FORBIDDEN = {
  error: {
    code: 403,
    status: 'PERMISSION_DENIED',
    message: 'Request had insufficient authentication scopes.',
  },
};

describe('GMAIL_READ_TOOLS', () => {
  beforeEach(() => {
    google.token = 'ya29.calendar-only';
    google.linked = true;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GMAIL_READ_TOOLS;
    delete process.env.GOOGLE_LINK_HONEST;
  });

  it('off (default): no Gmail read tool is offered; the other email tools still are', () => {
    const ids = offered();
    expect(READ_IDS.filter((id) => ids.includes(id))).toEqual([]);
    expect(ids).toContain('markVipSender');
    expect(ids).toContain('trackFollowUp');
  });

  it('on: all eight read tools are offered', () => {
    process.env.GMAIL_READ_TOOLS = 'on';
    expect(READ_IDS.filter((id) => offered().includes(id))).toEqual(READ_IDS);
  });

  it('Alex owns the Gmail read tools only while they are registered', () => {
    expect(getToolOwner('getUnreadEmails')).toBeNull();
    expect(getToolOwner('getCalendarToday')).toBe('alex-chen');
    process.env.GMAIL_READ_TOOLS = 'on';
    expect(getToolOwner('getUnreadEmails')).toBe('alex-chen');
    expect(getToolOwner('checkEmailFrom')).toBe('alex-chen');
  });

  it('on: a 403 is "can\'t read your inbox" from every read tool, never "no emails"', async () => {
    process.env.GMAIL_READ_TOOLS = 'on';
    gmailAnswers(403, FORBIDDEN);
    for (const id of READ_IDS) {
      const out = await run(id);
      expect(out, id).toEqual(NOT_CONNECTED);
      expect(JSON.stringify(out), id).not.toMatch(EMPTY_CLAIM);
    }
  });

  it('on: a 401 and a token that will not refresh read as not connected too', async () => {
    process.env.GMAIL_READ_TOOLS = 'on';
    gmailAnswers(401, { error: { code: 401, message: 'Invalid Credentials' } });
    expect(await run('getUnreadEmails')).toEqual(NOT_CONNECTED);
    google.token = null;
    expect(await run('checkEmailFrom')).toEqual(NOT_CONNECTED);
    expect(await run('getInboxSummary')).toEqual(NOT_CONNECTED);
  });

  it('on: no Google link gets the same line, with no connect offer', async () => {
    process.env.GMAIL_READ_TOOLS = 'on';
    google.linked = false;
    for (const id of READ_IDS) {
      const out = await run(id);
      expect(out, id).toEqual(NOT_CONNECTED);
      expect(JSON.stringify(out), id).not.toMatch(/connect your Google|would you like me to help/i);
    }
  });

  it.each([
    ['a 500', () => gmailAnswers(500, { error: { code: 500 } })],
    ['a 503', () => gmailAnswers(503, { error: { code: 503, status: 'UNAVAILABLE' } })],
    [
      'a network error',
      () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed')),
    ],
  ])(
    'on: %s is "couldn\'t reach" from every read tool, never empty or not found',
    async (_, fail) => {
      process.env.GMAIL_READ_TOOLS = 'on';
      fail();
      for (const id of READ_IDS) {
        const out = await run(id);
        expect(out, id).toEqual({ unavailable: 'gmail_unreachable', say: expect.any(String) });
        expect(JSON.stringify(out), id).not.toMatch(EMPTY_CLAIM);
        expect(JSON.stringify(out), id).not.toMatch(/could not find|couldn't find/i);
      }
    }
  );

  it('on: a real Gmail 404 on a thread still says not found', async () => {
    process.env.GMAIL_READ_TOOLS = 'on';
    gmailAnswers(404, { error: { code: 404, message: 'Requested entity was not found.' } });
    expect(await run('getEmailThread')).toBe('I could not find that email thread.');
  });

  it('on: a real empty inbox still says no emails', async () => {
    process.env.GMAIL_READ_TOOLS = 'on';
    gmailAnswers(200, { resultSizeEstimate: 0 });
    expect(await run('getUnreadEmails')).toBe('Great news - you have no unread emails.');
    expect(await run('searchInbox')).toBe('No emails found matching "is:unread".');
    expect(await run('checkEmailFrom')).toBe('No unread emails from jo.');
  });

  it('GOOGLE_LINK_HONEST alone: the service reports the 403; the tools stay hidden', async () => {
    process.env.GOOGLE_LINK_HONEST = 'on';
    gmailAnswers(403, FORBIDDEN);
    await expect(getUnreadMessages('u1')).rejects.toBeInstanceOf(GmailNotPermittedError);
    expect(READ_IDS.filter((id) => offered().includes(id))).toEqual([]);
  });

  it('both off: the service path is unchanged (a 403 still returns [])', async () => {
    gmailAnswers(403, FORBIDDEN);
    await expect(getUnreadMessages('u1')).resolves.toEqual([]);
  });
});

describe('no restricted Gmail scope is requested', () => {
  const SRC = resolve(__dirname, '../../..');
  const RESTRICTED =
    /googleapis\.com\/auth\/gmail\.(readonly|modify|metadata)\b|mail\.google\.com\//;

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (name === '__tests__' || name === 'node_modules') return [];
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx|js|json)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
    });
  }

  it('no file under src/ names gmail.readonly, gmail.modify or full mail access', () => {
    const files = sources(SRC);
    expect(files.length).toBeGreaterThan(1000);
    const hits = files.filter((f) => RESTRICTED.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});
