/**
 * communication-service's email functions go through the email port, so the
 * one transport (the ferni.ai Workspace mailbox) reaches reminders by email and every other caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailSender, OutgoingEmail } from '../../types/email-sender.js';

const sent: OutgoingEmail[] = [];
const sender = {
  provider: 'gmail' as const,
  configured: true,
  result: { ok: true, provider: 'gmail' as const, messageId: 'm1' } as Awaited<
    ReturnType<EmailSender['send']>
  >,
};

vi.mock('../email-transport/index.js', () => ({
  getEmailSender: (): EmailSender => ({
    provider: sender.provider,
    isConfigured: () => sender.configured,
    send: async (email) => {
      sent.push(email);
      return sender.result;
    },
  }),
}));

const { sendEmail, sendAppEmail, isEmailConfigured } = await import('../communication-service.js');

describe('communication-service email via the transport port', () => {
  beforeEach(() => {
    sent.length = 0;
    sender.configured = true;
    sender.result = { ok: true, provider: 'gmail', messageId: 'm1' };
  });

  it('sends plain text as a transactional email from Ferni', async () => {
    const out = await sendEmail('sam@example.com', 'Reminder: call mom', 'Call mom at 5');
    expect(out).toBe('Email sent to sa***@example.com: "Reminder: call mom"');
    expect(sent).toEqual([
      {
        to: 'sam@example.com',
        subject: 'Reminder: call mom',
        text: 'Call mom at 5',
        fromName: 'Ferni',
        kind: 'transactional',
      },
    ]);
  });

  it('sends html in the html part', async () => {
    await sendEmail('sam@example.com', 'Hi', '<p>Hi</p>', true);
    expect(sent[0]).toMatchObject({ html: '<p>Hi</p>' });
    expect(sent[0]?.text).toBeUndefined();
  });

  it('throws with the provider error when the send fails', async () => {
    sender.result = {
      ok: false,
      provider: 'gmail',
      error: 'token exchange failed: 401 unauthorized_client',
    };
    await expect(sendEmail('sam@example.com', 'Hi', 'x')).rejects.toThrow(
      'Email send failed (gmail): token exchange failed: 401 unauthorized_client'
    );
  });

  it('refuses an invalid address before calling the transport', async () => {
    await expect(sendEmail('nope', 'Hi', 'x')).rejects.toThrow(/Invalid email address/);
    expect(sent).toHaveLength(0);
  });

  it('does not send when the transport is unconfigured (dev returns a note, prod throws)', async () => {
    sender.configured = false;
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      expect(await sendEmail('sam@example.com', 'Hi', 'x')).toMatch(
        /^\[DEV MODE\] Would send email/
      );
      process.env.NODE_ENV = 'production';
      await expect(sendEmail('sam@example.com', 'Hi', 'x')).rejects.toThrow(
        /the gmail transport is not configured/
      );
      expect(sent).toHaveLength(0);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('exposes the transport to L3 callers', async () => {
    expect(isEmailConfigured()).toBe(true);
    sender.configured = false;
    expect(isEmailConfigured()).toBe(false);
    const res = await sendAppEmail({
      to: 'a@b.co',
      subject: 's',
      text: 't',
      kind: 'transactional',
    });
    expect(res).toEqual({ ok: true, provider: 'gmail', messageId: 'm1' });
    expect(sent).toHaveLength(1);
  });
});
