/**
 * SMS sends retry by HTTP status, not by message text.
 *
 * withRetry skipped a retry only when the error message contained one of a few
 * keywords. A provider 401 body saying "not authorized" matched none, so it was
 * retried on every send (prod logs, 2026-10-18). Email has one transport, the
 * Workspace mailbox, which retries itself; communication-service sends to it once
 * and surfaces its answer. These tests drive the real sendEmail / sendSMS.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest');
vi.stubEnv('TWILIO_AUTH_TOKEN', 'token');
vi.stubEnv('TWILIO_PHONE_NUMBER', '+15005550006');
vi.stubEnv('MAX_RETRIES', '3');
vi.stubEnv('RETRY_DELAY_MS', '1');
vi.stubEnv('RETRY_MAX_DELAY_MS', '5');

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

const { isRetryableSendError, ProviderHttpError, sendEmail, sendSMS } =
  await import('../communication-service.js');
const { setEmailSenderForTests } = await import('../email-transport/index.js');
const gmailSend = vi.fn();
setEmailSenderForTests({ provider: 'gmail', isConfigured: () => true, send: gmailSend });

afterAll(() => {
  setEmailSenderForTests(null);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  fetchMock.mockReset();
  gmailSend.mockReset();
});

const reply = (status: number, body = '{}'): Response => new Response(body, { status });

describe('send retry classification', () => {
  it.each([
    [400, false],
    [401, false],
    [403, false],
    [404, false],
    [422, false],
    [408, true],
    [429, true],
    [500, true],
    [502, true],
    [503, true],
  ])('HTTP %i → retryable %s', (status, retryable) => {
    expect(isRetryableSendError(new ProviderHttpError('x', status))).toBe(retryable);
  });

  it('retries a network or timeout error', () => {
    expect(isRetryableSendError(new TypeError('fetch failed'))).toBe(true);
    expect(
      isRetryableSendError(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    ).toBe(true);
  });

  it('hands an email to the Workspace transport once and surfaces its failure', async () => {
    gmailSend.mockResolvedValue({ ok: false, provider: 'gmail', status: 401, error: 'gmail 401: not authorized' }); // prettier-ignore
    await expect(sendEmail('a@example.com', 'hi', 'body')).rejects.toThrow(
      'Email send failed (gmail): gmail 401: not authorized'
    );
    expect(gmailSend).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes userId / trigger / sourceId to the transport as metadata', async () => {
    gmailSend.mockResolvedValue({ ok: true, provider: 'gmail', messageId: 'g1' });
    await expect(
      sendEmail('a@example.com', 'hi', 'body', false, {
        userId: 'u1',
        trigger: 'reminder',
        sourceId: 'r1',
      })
    ).resolves.toContain('Email sent');
    expect(gmailSend.mock.calls[0][0]).toMatchObject({
      text: 'body',
      kind: 'transactional',
      metadata: { userId: 'u1', trigger: 'reminder', sourceId: 'r1' },
    });
  });

  it('sends a Twilio 400 once', async () => {
    fetchMock.mockResolvedValue(reply(400, '{"code":21211}'));
    await expect(sendSMS('+14155550123', 'hi')).rejects.toThrow('Twilio error: 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
