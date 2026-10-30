/**
 * GOOGLE_LINK_HONEST: a Gmail 403 is "not permitted", never an empty inbox.
 * The link carries the calendar scope only, so Gmail always answers 403.
 * Real Gmail service and real tool definitions; only fetch and the token are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../identity/google-calendar-oauth.js', () => ({
  getValidAccessToken: vi.fn(async () => 'ya29.calendar-only'),
  isCalendarConfigured: vi.fn(async () => true),
}));
vi.mock('../../../utils/circuit-breaker.js', () => ({
  getCircuitBreaker: () => ({ execute: <T>(fn: () => Promise<T>) => fn() }),
}));

const { getGmailToolDefinitions } =
  await import('../../../tools/domains/communication/gmail-tools.js');
const { definitions: emailIntelligenceDefs } =
  await import('../../../tools/domains/email-intelligence/index.js');
const { GmailNotPermittedError } = await import('../gmail-honesty.js');
const { getUnreadMessages } = await import('../gmail-service.js');
const { toolAvailable } = await import('../../../tools/registry/tool-availability.js');

const FORBIDDEN = {
  error: {
    code: 403,
    status: 'PERMISSION_DENIED',
    message: 'Request had insufficient authentication scopes.',
  },
};

function run(id: string, args: unknown = {}) {
  const def = getGmailToolDefinitions().find((d) => d.id === id)!;
  const tool = def.create({ userId: 'u1' } as never);
  return tool.execute(args, {});
}

describe('GOOGLE_LINK_HONEST gmail reads', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify(FORBIDDEN), { status: 403 })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GOOGLE_LINK_HONEST;
  });

  it('on: a 403 is an unavailable result, never an empty inbox', async () => {
    process.env.GOOGLE_LINK_HONEST = 'on';
    await expect(getUnreadMessages('u1')).rejects.toBeInstanceOf(GmailNotPermittedError);
    for (const [id, args] of [
      ['getUnreadEmails', {}],
      ['searchInbox', { query: 'is:unread' }],
      ['checkEmailFrom', { sender: 'jo' }],
      ['getInboxSummary', {}],
      ['triageInbox', {}],
      ['getEmailThread', { threadId: 't1' }],
    ] as const) {
      const out = await run(id, args);
      expect(out, id).toEqual({
        unavailable: 'gmail_not_permitted',
        say: "I can't read your Gmail. I'm only connected to your calendar.",
      });
    }
  });

  it('on: no Gmail read tool is offered', () => {
    process.env.GOOGLE_LINK_HONEST = 'on';
    const gmail = getGmailToolDefinitions();
    expect(gmail).toHaveLength(6);
    expect(gmail.filter((d) => toolAvailable(d))).toEqual([]);
    const intel = emailIntelligenceDefs.filter((d) =>
      ['analyzeInboxPriority', 'summarizeThread'].includes(d.id)
    );
    expect(intel).toHaveLength(2);
    expect(intel.filter((d) => toolAvailable(d))).toEqual([]);
    expect(toolAvailable(emailIntelligenceDefs.find((d) => d.id === 'markVipSender')!)).toBe(true);
  });

  it('off: unchanged from main (the 403 still reads as an empty inbox, tools offered)', async () => {
    await expect(getUnreadMessages('u1')).resolves.toEqual([]);
    expect(await run('getUnreadEmails')).toBe('Great news - you have no unread emails.');
    expect(getGmailToolDefinitions().every((d) => toolAvailable(d))).toBe(true);
  });
});
