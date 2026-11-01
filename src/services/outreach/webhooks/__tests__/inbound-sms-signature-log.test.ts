/**
 * An inbound SMS whose Twilio signature fails is refused with an empty reply,
 * so a rotated auth token or a wrong APP_URL silently drops every STOP, YES and
 * HELP. That used to log at warn, below what anyone alerts on. It logs at
 * error now, with the message id only: never the text or the phone number.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Call = { level: string; fields: unknown; msg: unknown };
const calls = vi.hoisted(() => [] as Call[]);

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = (): Record<string, unknown> => {
    const at =
      (level: string) =>
      (fields: unknown, msg?: unknown): void => {
        calls.push({ level, fields, msg });
      };
    return {
      trace: at('trace'),
      debug: at('debug'),
      info: at('info'),
      warn: at('warn'),
      error: at('error'),
      fatal: at('fatal'),
      child: () => logger(),
    };
  };
  return {
    getLogger: () => logger(),
    safeLog: () => logger(),
    createLogger: () => logger(),
    serializeError: (error: unknown) => error,
    isFullLoggingEnabled: () => false,
    setErrorLogSink: () => undefined,
    truncateForLog: (value: unknown) => value,
  };
});

const { handleInboundSMSWebhook } = await import('../twilio-webhooks.js');

const PHONE = '+12135550100';
const TEXT = 'STOP texting me';
const payload = {
  MessageSid: 'SM_sig_1',
  AccountSid: 'AC1',
  From: PHONE,
  To: '+13105550199',
  Body: TEXT,
  NumMedia: '0',
} as never;

const signatureLines = () => calls.filter((c) => /signature/i.test(String(c.msg)));

describe('inbound SMS signature failure', () => {
  afterEach(() => {
    calls.length = 0;
    vi.unstubAllEnvs();
  });

  it('logs an invalid signature at error with the message id only', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'real-token');

    const result = await handleInboundSMSWebhook(
      payload,
      'forged',
      'https://api.ferni.ai/x/sms-inbound'
    );

    expect(result.success).toBe(false);
    const lines = signatureLines().filter((c) => /invalid/i.test(String(c.msg)));
    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe('error');
    expect(lines[0].fields).toEqual({ messageSid: 'SM_sig_1' });
    expect(JSON.stringify(calls)).not.toContain(PHONE);
    expect(JSON.stringify(calls)).not.toContain(TEXT);
  });

  it('logs a missing signature at error with the message id only', async () => {
    const result = await handleInboundSMSWebhook(payload, undefined, undefined);

    expect(result.success).toBe(false);
    const lines = signatureLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe('error');
    expect(lines[0].fields).toEqual({ messageSid: 'SM_sig_1' });
    expect(JSON.stringify(calls)).not.toContain(PHONE);
    expect(JSON.stringify(calls)).not.toContain(TEXT);
  });
});
