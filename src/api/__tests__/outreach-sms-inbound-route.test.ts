import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleInboundSMSWebhook = vi.hoisted(() => vi.fn());
const recordCheckinReply = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../services/outreach/webhooks/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/webhooks/index.js')>()),
  handleInboundSMSWebhook,
}));
const recordInboundSmsConsent = vi.hoisted(() => vi.fn(async () => null));
// Partial: the route's imports (proactive opt-outs via guarded-text) read other exports at load.
vi.mock('../../services/outreach/checkin-replies.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/checkin-replies.js')>()),
  recordCheckinReply,
}));
vi.mock('../../services/messaging/consent.js', () => ({ recordInboundSmsConsent }));
const recordContactYes = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../services/messaging/consent-grants.js', () => ({ recordContactYes }));

import { handleOutreachWebhookRoutes } from '../outreach-webhook-routes.js';

const PATH = '/api/outreach/webhooks/twilio/sms-inbound';
const params = { From: '+18015550177', Body: 'STOP', MessageSid: 'SM0123456789abcdef' };

function post() {
  const req = Readable.from([new URLSearchParams(params).toString()]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: PATH,
    headers: { host: 'app.ferni.example', 'content-type': 'application/x-www-form-urlencoded' },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  return { req, res: res as unknown as ServerResponse & typeof res };
}

describe('POST /api/outreach/webhooks/twilio/sms-inbound', () => {
  beforeEach(() => {
    handleInboundSMSWebhook.mockReset();
    recordCheckinReply.mockClear();
    recordInboundSmsConsent.mockClear();
  });

  it('records a check-in reply only after the Twilio signature check passes', async () => {
    handleInboundSMSWebhook.mockResolvedValue({ success: true });
    const { req, res } = post();
    await expect(handleOutreachWebhookRoutes(req, res, PATH)).resolves.toBe(true);
    expect(recordCheckinReply).toHaveBeenCalledWith(params.From, params.Body, params.MessageSid);
  });

  it('hands every signed inbound text (whichever handler answered it) to the consent record', async () => {
    // The proactive, legacy STOP, thread and check-in handlers all sit behind this one route.
    handleInboundSMSWebhook.mockResolvedValue({ success: true, twiml: '<Response/>' });
    const { req, res } = post();
    await handleOutreachWebhookRoutes(req, res, PATH);
    expect(recordInboundSmsConsent).toHaveBeenCalledWith(params.From, params.Body);
    expect(recordContactYes).toHaveBeenCalledWith(params.From, params.Body, params.MessageSid);
  });

  it('never records anything (no opt-out, no reply) for an unsigned or forged message', async () => {
    // handleInboundSMSWebhook returns success: false only when the signature fails.
    handleInboundSMSWebhook.mockResolvedValue({ success: false, error: 'Invalid signature' });
    const { req, res } = post();
    await handleOutreachWebhookRoutes(req, res, PATH);
    expect(recordCheckinReply).not.toHaveBeenCalled();
    expect(recordInboundSmsConsent).not.toHaveBeenCalled();
  });
});
