/**
 * SMS_REPLY_UNVERIFIED at the inbound route: the reply goes only for a stranger's signed text
 * that no crisis read, check-in, contact YES or holder code answered. The handler, records and
 * reply are fakes. Fictional numbers only.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handler: vi.fn(),
  checkin: vi.fn(async (): Promise<string | null> => null),
  yes: vi.fn(async (): Promise<string[] | null> => null),
  code: vi.fn(async () => false),
  screen: vi.fn(async (): Promise<string | null> => null),
  reply: vi.fn(async (): Promise<string | null> => 'Hi, this is Ferni.'),
}));
vi.mock('../../webhooks/index.js', async (orig) => ({
  ...(await orig<object>()),
  handleInboundSMSWebhook: h.handler,
  isSignedInboundSms: () => true,
}));
vi.mock('../../checkin-replies.js', async (orig) => ({
  ...(await orig<object>()),
  recordCheckinReply: h.checkin,
}));
vi.mock('../../../messaging/consent.js', () => ({ recordInboundSmsConsent: async () => null }));
vi.mock('../../../messaging/consent-grants.js', () => ({ recordContactYes: h.yes }));
vi.mock('../../../messaging/holder-verification.js', () => ({ recordHolderCode: h.code }));
vi.mock('../../sms-crisis-screen.js', async (orig) => ({
  ...(await orig<object>()),
  smsCrisisReply: h.screen,
}));
vi.mock('../sms-unverified.js', () => ({ smsUnverifiedReply: h.reply }));

const { handleOutreachWebhookRoutes } = await import('../../../../api/outreach-webhook-routes.js');

const PATH = '/api/outreach/webhooks/twilio/sms-inbound';
const params = { From: '+15555550188', Body: 'hey who is this', MessageSid: 'SM0123456789abcdef' };

async function post(): Promise<string> {
  const req = Readable.from([new URLSearchParams(params).toString()]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: PATH,
    headers: { host: 'app.ferni.example', 'content-type': 'application/x-www-form-urlencoded' },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  await handleOutreachWebhookRoutes(req, res as unknown as ServerResponse, PATH);
  return String(res.end.mock.calls[0]?.[0]);
}

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

beforeEach(() => {
  for (const f of Object.values(h)) f.mockClear();
  h.handler.mockResolvedValue({ success: true, unverified: true });
  h.checkin.mockResolvedValue(null);
  h.yes.mockResolvedValue(null);
  h.code.mockResolvedValue(false);
  h.screen.mockResolvedValue(null);
});

describe('a text from an unverified number at the route', () => {
  it('no record used it: the reply goes, after the records', async () => {
    expect(await post()).toContain('<Message>Hi, this is Ferni.</Message>');
    expect(h.reply).toHaveBeenCalledWith(params.From);
    expect(h.code.mock.invocationCallOrder[0]).toBeLessThan(h.reply.mock.invocationCallOrder[0]!);
  });

  it('a check-in reply, a contact YES (even one granting nothing) or a holder code: nothing', async () => {
    h.checkin.mockResolvedValueOnce('checkin-1');
    expect(await post()).toBe(EMPTY);
    h.yes.mockResolvedValueOnce([]);
    expect(await post()).toBe(EMPTY);
    h.code.mockResolvedValueOnce(true);
    expect(await post()).toBe(EMPTY);
    expect(h.reply).not.toHaveBeenCalled();
  });

  it('a record step that threw: nothing (it may have been one)', async () => {
    h.checkin.mockRejectedValueOnce(new Error('boom'));
    expect(await post()).toBe(EMPTY);
    expect(h.reply).not.toHaveBeenCalled();
  });

  it('the screen read a crisis: the crisis reply only', async () => {
    h.screen.mockResolvedValueOnce('Please call or text 988 now.');
    const twiml = await post();
    expect(twiml).toContain('988');
    expect(twiml).not.toContain('Hi, this is Ferni.');
    expect(h.reply).not.toHaveBeenCalled();
  });

  it("a member's text (no unverified mark), or the reply rejects: nothing", async () => {
    h.handler.mockResolvedValueOnce({ success: true });
    expect(await post()).toBe(EMPTY);
    expect(h.reply).not.toHaveBeenCalled();
    h.reply.mockRejectedValueOnce(new Error('Firestore unavailable'));
    expect(await post()).toBe(EMPTY);
  });
});
