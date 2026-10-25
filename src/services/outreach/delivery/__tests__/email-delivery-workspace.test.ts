/**
 * Owner decision 2026-10-25: all email goes through the Workspace port. With
 * EMAIL_PROVIDER=gmail, email-delivery hands every send to getEmailSender() and
 * never calls SendGrid (whose key 401s in prod). Unset, the SendGrid path is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutgoingEmail } from '../../../../types/email-sender.js';

const port = vi.hoisted(() => ({
  send: vi.fn(async (_email: OutgoingEmail) => ({
    ok: true,
    provider: 'gmail' as const,
    messageId: 'gm-abc',
  })),
  isConfigured: vi.fn(() => true),
}));
vi.mock('../../../email-transport/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../email-transport/index.js')>()),
  getEmailSender: () => ({ provider: 'gmail', ...port }),
}));

const { sendEmail, isEmailDeliveryAvailable, initializeEmailDelivery, getDeliveryRecord } =
  await import('../email-delivery.js');

const fetchMock = vi.fn(
  async (_url: string, _init?: unknown) =>
    new Response('', { status: 202, headers: { 'x-message-id': 'sg-123' } })
);

const message = {
  to: 'pat.example@gmail.com', // made up
  toName: 'Pat',
  subject: 'How the call went',
  body: 'Mom says hi.',
  personaId: 'ferni',
  userId: 'u-1',
  outreachId: 'call-1',
  tags: ['on-behalf-call'],
};

beforeEach(() => {
  vi.clearAllMocks();
  port.send.mockReset(); // drops any unconsumed mockResolvedValueOnce; keeps the vi.fn() default
  port.isConfigured.mockReturnValue(true);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('SENDGRID_API_KEY', '');
  vi.stubEnv('RESEND_API_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Order matters: the SendGrid config is module state and these first tests need it unset.
describe('email-delivery with EMAIL_PROVIDER=gmail', () => {
  it('is available with no SendGrid key and no init, following the port', () => {
    vi.stubEnv('EMAIL_PROVIDER', '');
    expect(isEmailDeliveryAvailable()).toBe(false); // pre: nothing configured
    vi.stubEnv('EMAIL_PROVIDER', 'gmail');
    expect(isEmailDeliveryAvailable()).toBe(true);
    port.isConfigured.mockReturnValue(false);
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it('sends through the port, never SendGrid, without initializeEmailDelivery', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'gmail');
    const result = await sendEmail(message);

    expect(result).toMatchObject({ success: true, messageId: 'gm-abc', status: 'sent' });
    expect(port.send).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const sent = port.send.mock.calls[0][0];
    expect(sent).toMatchObject({
      to: 'pat.example@gmail.com',
      toName: 'Pat',
      subject: 'How the call went',
      kind: 'transactional',
      fromName: 'Ferni from Ferni',
      tags: ['on-behalf-call'],
      metadata: { userId: 'u-1', outreachId: 'call-1', personaId: 'ferni' },
    });
    expect(sent.text).toContain('Mom says hi.');
    expect(sent.html).toContain('Mom says hi.');
    expect(getDeliveryRecord('gm-abc')).toMatchObject({ userId: 'u-1', status: 'sent' });
  });

  it("returns the port's error instead of succeeding", async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'gmail');
    port.send.mockResolvedValueOnce({
      ok: false,
      provider: 'gmail',
      status: 403,
      error: 'gmail 403: delegation denied for [redacted]',
    } as never);
    const result = await sendEmail(message);
    expect(result).toMatchObject({
      success: false,
      status: '403',
      error: 'gmail 403: delegation denied for [redacted]',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still uses the port when a SendGrid config was initialized', async () => {
    initializeEmailDelivery({
      provider: 'sendgrid',
      apiKey: 'SG.dead',
      fromEmail: 'hello@ferni.ai',
      fromName: 'Ferni',
    });
    vi.stubEnv('EMAIL_PROVIDER', 'gmail');
    const result = await sendEmail(message);
    expect(result.success).toBe(true);
    expect(port.send).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('email-delivery with EMAIL_PROVIDER unset', () => {
  it('keeps the SendGrid path (config initialized above)', async () => {
    vi.stubEnv('EMAIL_PROVIDER', '');
    expect(isEmailDeliveryAvailable()).toBe(true);
    const result = await sendEmail(message);
    expect(result).toMatchObject({ success: true, messageId: 'sg-123' });
    expect(port.send).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sendgrid.com/v3/mail/send');
  });
});
