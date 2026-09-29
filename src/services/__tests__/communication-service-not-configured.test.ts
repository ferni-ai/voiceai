/**
 * Unconfigured email/SMS must fail loudly (no "[DEV MODE] Would send..."
 * string that callers treated as sent), and the voice tools must say so.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('communication-service without provider credentials', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('SENDGRID_API_KEY', '');
    vi.stubEnv('TWILIO_ACCOUNT_SID', '');
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    vi.stubEnv('TWILIO_PHONE_NUMBER', '');
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sendEmail throws MessagingNotConfiguredError and sends nothing', async () => {
    const svc = await import('../communication-service.js');
    const err = await svc.sendEmail('friend@example.com', 'Hi', 'Hello').catch((e: unknown) => e);
    expect(svc.isMessagingNotConfigured(err)).toBe(true);
    expect((err as InstanceType<typeof svc.MessagingNotConfiguredError>).simulated).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendSMS throws MessagingNotConfiguredError and sends nothing', async () => {
    const svc = await import('../communication-service.js');
    const err = await svc.sendSMS('+15551234567', 'Hello').catch((e: unknown) => e);
    expect(svc.isMessagingNotConfigured(err)).toBe(true);
    expect(String(err)).toMatch(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendReminder propagates the failure', async () => {
    const svc = await import('../communication-service.js');
    await expect(svc.sendReminder('+15551234567', 'Water plants')).rejects.toBeInstanceOf(
      svc.MessagingNotConfiguredError
    );
  });
});

describe('communication tools respect unconfigured providers', () => {
  afterEach(() => {
    vi.doUnmock('../communication-service.js');
    vi.doUnmock('@livekit/agents');
    vi.resetModules();
  });

  it('sendTextMessage / sendApprovedEmail report that nothing went out', async () => {
    vi.resetModules();
    vi.doMock('@livekit/agents', () => ({
      llm: { tool: (config: { execute: unknown }) => config },
    }));
    vi.doMock('../communication-service.js', async () => {
      const actual =
        await vi.importActual<typeof import('../communication-service.js')>(
          '../communication-service.js'
        );
      return {
        ...actual,
        sendSMS: vi.fn(async () => {
          throw new actual.MessagingNotConfiguredError('sms');
        }),
        sendEmail: vi.fn(async () => {
          throw new actual.MessagingNotConfiguredError('email');
        }),
      };
    });
    const { createCommunicationTools } =
      await import('../../tools/domains/communication/communication-tools.js');
    const tools = createCommunicationTools() as unknown as Record<
      string,
      { execute: (args: Record<string, string>) => Promise<string> }
    >;

    const text = await tools.sendTextMessage.execute({ to: '+15551234567', message: 'hi' });
    expect(text).toMatch(/didn't go out/);

    const email = await tools.sendApprovedEmail.execute({
      to: 'friend@example.com',
      subject: 'Hi',
      body: 'Hello',
    });
    expect(email).toMatch(/didn't go out/);
  });
});
