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
// The classifier read can be made to reject, to reach the screen's fallback path.
const readRejects = vi.hoisted(() => ({ on: false }));
vi.mock('../../services/safety/crisis-classifier.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/safety/crisis-classifier.js')>();
  return {
    ...real,
    classifyCrisis: async (...args: Parameters<typeof real.classifyCrisis>) => {
      if (readRejects.on) throw new Error('classifier down');
      return real.classifyCrisis(...args);
    },
    createGeminiCrisisGenerate: () => async () => {
      modelCalls();
      return `{"risk":"${modelSays.risk}"}`;
    },
  };
});

// The screen's own logger (every level) can be made to throw, to prove a
// failing logger never changes what goes back to the phone.
const screenLogThrows = vi.hoisted(() => ({ on: false }));
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) => {
      const logger = real.createLogger(...args);
      const isScreen = (args[0] as { module?: string } | undefined)?.module === 'SmsCrisisScreen';
      if (!isScreen) return logger;
      return new Proxy(logger, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver) as unknown;
          if (typeof value !== 'function') return value;
          return (...logArgs: unknown[]) => {
            if (screenLogThrows.on) throw new Error('logger down');
            return (value as (...a: unknown[]) => unknown).apply(target, logArgs);
          };
        },
      });
    },
  };
});

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
  // A fresh result per text, as in prod: the route writes the crisis reply into it.
  handleInboundSMSWebhook
    .mockReset()
    .mockImplementation(async () => ({ success: true, twiml: CALL_ME_TWIML }));
  recordInboundSmsConsent.mockClear();
  modelCalls.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  screenLogThrows.on = false;
  readRejects.on = false;
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

  it('a logger that throws on every screen line never changes the reply: shadow is byte-identical to off', async () => {
    const STOP_TWIML =
      '<?xml version="1.0"?><Response><Message>You are unsubscribed</Message></Response>';
    const texts = ['STOP', 'HELP', 'I want to kill myself', 'running late, see you at 6'];
    const replies = async (mode: string) => {
      vi.stubEnv('SMS_CRISIS_SCREEN', mode);
      const out: string[] = [];
      for (const body of texts) {
        handleInboundSMSWebhook.mockResolvedValueOnce({
          success: true,
          twiml: body === 'STOP' ? STOP_TWIML : CALL_ME_TWIML,
        });
        // One text at a time: the order of replies is the thing compared.
        // eslint-disable-next-line no-await-in-loop
        out.push(await text(body));
      }
      return out;
    };
    const off = await replies('off');
    screenLogThrows.on = true;
    modelSays.risk = 'imminent';
    const shadow = await replies('shadow');
    expect(shadow).toEqual(off);
    expect(off[0]).toBe(STOP_TWIML);
    // Let the shadow reads finish while the logger is still throwing.
    await vi.waitFor(() => expect(modelCalls).toHaveBeenCalledTimes(texts.length));
  });

  it('on: a rejected read plus a logger throwing on every level still sends 988, and STOP is confirmed and recorded once', async () => {
    const STOP_TWIML =
      '<?xml version="1.0"?><Response><Message>You are unsubscribed</Message></Response>';
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    screenLogThrows.on = true;
    readRejects.on = true;
    expect(await text('I want to kill myself')).toContain(CRISIS_IN_TWIML);
    recordInboundSmsConsent.mockClear();
    handleInboundSMSWebhook.mockResolvedValueOnce({ success: true, twiml: STOP_TWIML });
    expect(await text('STOP')).toBe(STOP_TWIML);
    expect(recordInboundSmsConsent).toHaveBeenCalledExactlyOnceWith('+18015550177', 'STOP');
  });

  it('shadow: a rejected read plus a logger throwing on every level changes no reply and leaves no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      vi.stubEnv('SMS_CRISIS_SCREEN', 'off');
      const off = await text('I want to kill myself');
      vi.stubEnv('SMS_CRISIS_SCREEN', 'shadow');
      screenLogThrows.on = true;
      readRejects.on = true;
      expect(await text('I want to kill myself')).toBe(off);
      await new Promise((r) => {
        setTimeout(r, 50);
      });
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('on: a logger that throws still sends 988 to a crisis text', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    screenLogThrows.on = true;
    expect(await text('I want to kill myself')).toContain(CRISIS_IN_TWIML);
    expect(await text('running late, see you at 6')).toBe(CALL_ME_TWIML);
  });
});
