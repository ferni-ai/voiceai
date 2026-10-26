/**
 * SMS_CRISIS_SCREEN at the route that answers Twilio: what actually goes back
 * to the phone. A crisis text gets 988 in place of the handler's reply (even a
 * "call me" one), only once the Twilio signature passed, and STOP/consent
 * recording still runs. The pattern guard is real; the classifier's model call
 * is faked at the Gemini boundary.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handleInboundSMSWebhook = vi.hoisted(() => vi.fn());
vi.mock('../../services/outreach/webhooks/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/webhooks/index.js')>()),
  handleInboundSMSWebhook,
}));
const recordCheckinReply = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../services/outreach/checkin-replies.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/outreach/checkin-replies.js')>()),
  recordCheckinReply,
}));
const recordInboundSmsConsent = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../services/messaging/consent.js', () => ({ recordInboundSmsConsent }));
vi.mock('../../services/messaging/consent-grants.js', () => ({ recordContactYes: vi.fn() }));
vi.mock('../../services/messaging/holder-verification.js', () => ({
  recordHolderCode: vi.fn(async () => false),
}));
const modelSays = vi.hoisted(() => ({ risk: 'none' }));
const modelCalls = vi.hoisted(() => vi.fn());
vi.mock('../../services/safety/crisis-classifier.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/safety/crisis-classifier.js')>()),
  createGeminiCrisisGenerate: () => async () => {
    modelCalls();
    return `{"risk":"${modelSays.risk}"}`;
  },
}));

import { handleOutreachWebhookRoutes } from '../outreach-webhook-routes.js';
import { SMS_CRISIS_REPLY } from '../../services/outreach/sms-crisis-screen.js';

const PATH = '/api/outreach/webhooks/twilio/sms-inbound';
const CALL_ME_TWIML = '<?xml version="1.0"?><Response><Message>Open Ferni</Message></Response>';

async function text(body: string): Promise<string> {
  const params = { From: '+18015550177', Body: body, MessageSid: 'SM0123456789abcdef' };
  const req = Readable.from([new URLSearchParams(params).toString()]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: 'POST',
    url: PATH,
    headers: { host: 'app.ferni.example', 'content-type': 'application/x-www-form-urlencoded' },
  });
  const res = { writeHead: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  await handleOutreachWebhookRoutes(req, res as unknown as ServerResponse, PATH);
  return String(res.end.mock.calls[0]?.[0] ?? '');
}
const CRISIS_IN_TWIML = 'please call or text 988';

beforeEach(() => {
  modelSays.risk = 'none';
  handleInboundSMSWebhook.mockReset().mockResolvedValue({ success: true, twiml: CALL_ME_TWIML });
  recordInboundSmsConsent.mockClear();
  modelCalls.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST sms-inbound with SMS_CRISIS_SCREEN', () => {
  it('on: a crisis text gets 988 in place of the handler reply, and consent still records', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    const sent = await text('I want to kill myself, call me');
    expect(sent).toContain(CRISIS_IN_TWIML);
    expect(sent).not.toContain('Open Ferni</Message>');
    expect(SMS_CRISIS_REPLY).toContain('988');
    expect(recordInboundSmsConsent).toHaveBeenCalledTimes(1);
  });

  it('on: a classifier-only read (no pattern) still gets 988', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    modelSays.risk = 'imminent';
    expect(await text('the cabinet is open and I have counted them out')).toContain(
      CRISIS_IN_TWIML
    );
  });

  it('on: an ordinary text keeps the handler reply', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    expect(await text('running late, see you at 6')).toBe(CALL_ME_TWIML);
  });

  it('on: an unsigned (forged) text gets no crisis reply and never reaches the paid classifier', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    handleInboundSMSWebhook.mockResolvedValue({ success: false });
    expect(await text('I want to kill myself')).not.toContain('988');
    expect(modelCalls).not.toHaveBeenCalled();
  });

  it('on: a signed text is read by the classifier', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    await text('running late, see you at 6');
    expect(modelCalls).toHaveBeenCalledTimes(1);
  });

  it.each(['off', 'shadow'])('%s: the reply is unchanged', async (mode) => {
    vi.stubEnv('SMS_CRISIS_SCREEN', mode);
    expect(await text('I want to kill myself')).toBe(CALL_ME_TWIML);
  });
});
