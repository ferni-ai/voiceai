/**
 * Email and SMS sends retry by HTTP status, not by message text.
 *
 * withRetry skipped a retry only when the error message contained one of a few
 * keywords. SendGrid's 401 body says "not authorized", which matched none, so a
 * key without Mail Send was retried on every email (prod logs, 2026-10-18).
 * These tests drive the real sendEmail / sendSMS against a stubbed fetch and
 * count the requests.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('SENDGRID_API_KEY', 'SG.test-key');
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

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => fetchMock.mockReset());

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

  it('sends a SendGrid 401 "not authorized" once and surfaces it', async () => {
    fetchMock.mockResolvedValue(
      reply(401, '{"errors":[{"message":"The provided authorization grant is not authorized"}]}')
    );
    await expect(sendEmail('a@example.com', 'hi', 'body')).rejects.toThrow(
      'Email send failed (sendgrid): SendGrid 401'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a SendGrid 503 until it succeeds', async () => {
    fetchMock.mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(202));
    await expect(sendEmail('a@example.com', 'hi', 'body')).resolves.toContain('Email sent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a SendGrid 429 up to the limit', async () => {
    fetchMock.mockImplementation(async () => reply(429));
    await expect(sendEmail('a@example.com', 'hi', 'body')).rejects.toThrow(
      'Email send failed (sendgrid): SendGrid 429'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a SendGrid 408 like main did', async () => {
    fetchMock.mockResolvedValueOnce(reply(408)).mockResolvedValueOnce(reply(202));
    await expect(sendEmail('a@example.com', 'hi', 'body')).resolves.toContain('Email sent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a SendGrid network error', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(reply(202));
    await expect(sendEmail('a@example.com', 'hi', 'body')).resolves.toContain('Email sent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends a Twilio 400 once', async () => {
    fetchMock.mockResolvedValue(reply(400, '{"code":21211}'));
    await expect(sendSMS('+14155550123', 'hi')).rejects.toThrow('Twilio error: 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
