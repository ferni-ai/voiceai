/**
 * Email is Gmail Workspace only (Seth, 2026-10-27, #2947): email-delivery hands
 * every send to the app's one transport, getEmailSender(), and reports what the
 * transport answered. There is no other provider and no init.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EmailSendResult,
  EmailSender,
  OutgoingEmail,
} from '../../../../types/email-sender.js';
import { setEmailSenderForTests } from '../../../email-transport/index.js';

const { sendEmail, isEmailDeliveryAvailable, getDeliveryRecord } =
  await import('../email-delivery.js');

const send = vi.fn(async (_email: OutgoingEmail): Promise<EmailSendResult> => ({
  ok: true,
  provider: 'gmail',
  messageId: 'gm-abc',
}));
const isConfigured = vi.fn(() => true);
const fakeGmail: EmailSender = { provider: 'gmail', isConfigured, send };
const fetchMock = vi.fn(async () => new Response('', { status: 599 }));

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
  send.mockReset();
  send.mockResolvedValue({ ok: true, provider: 'gmail', messageId: 'gm-abc' });
  isConfigured.mockReturnValue(true);
  setEmailSenderForTests(fakeGmail);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  setEmailSenderForTests(null);
  vi.unstubAllGlobals();
});

describe('email-delivery: Gmail Workspace only', () => {
  it('is available exactly when the transport is configured, with no init', () => {
    expect(isEmailDeliveryAvailable()).toBe(true);
    isConfigured.mockReturnValue(false);
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it('sends through the transport and records it as sent only on its success', async () => {
    const result = await sendEmail(message);

    expect(result).toMatchObject({ success: true, messageId: 'gm-abc', status: 'sent' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled(); // no other provider is ever called
    const sent = send.mock.calls[0][0];
    expect(sent).toMatchObject({
      to: 'pat.example@gmail.com',
      toName: 'Pat',
      subject: 'How the call went',
      kind: 'transactional',
      fromName: 'Ferni from Ferni',
      metadata: { userId: 'u-1', outreachId: 'call-1', personaId: 'ferni' },
    });
    expect(sent.text).toContain('Mom says hi.');
    expect(getDeliveryRecord('gm-abc')).toMatchObject({ userId: 'u-1', status: 'sent' });
  });

  it("returns the transport's failure and records nothing as sent", async () => {
    send.mockResolvedValueOnce({
      ok: false,
      provider: 'gmail',
      status: 403,
      error: 'gmail 403: denied',
    });
    const result = await sendEmail({ ...message, outreachId: 'call-2' });
    expect(result).toMatchObject({ success: false, status: '403', error: 'gmail 403: denied' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the transport is not configured', async () => {
    isConfigured.mockReturnValue(false);
    expect(await sendEmail(message)).toMatchObject({ success: false });
    expect(send).not.toHaveBeenCalled();
  });
});
