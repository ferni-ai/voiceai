/**
 * The app's former raw-SendGrid senders go through the email port, so
 * EMAIL_PROVIDER (SendGrid by default, the ferni.ai Workspace under gmail)
 * reaches them too: circuit-breaker alerts, trust check-ins, concierge
 * requests, unified outreach email and the Plaid bank-link email.
 *
 * Each case drives the site's real entry point with a stubbed port and checks
 * the email it hands over (recipient, kind, subject) and that nothing was
 * fetched from api.sendgrid.com.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailSender, EmailSendResult, OutgoingEmail } from '../../types/email-sender.js';

const port = vi.hoisted(() => ({
  sent: [] as OutgoingEmail[],
  configured: true,
  result: { ok: true, provider: 'gmail', messageId: 'm-1' } as EmailSendResult,
}));

vi.mock('../email-transport/index.js', async (orig) => ({
  ...(await orig<object>()),
  getEmailSender: (): EmailSender => ({
    provider: 'gmail',
    isConfigured: () => port.configured,
    send: async (email) => {
      port.sent.push(email);
      return port.result;
    },
  }),
}));
// No Firestore: unified-delivery's delivery record is a no-op here.
vi.mock('../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const fetchSpy = vi.fn(async (url: string | URL) => {
  if (String(url).includes('plaid.com')) {
    return new Response(JSON.stringify({ link_token: 'link-sandbox-1' }), { status: 200 });
  }
  return new Response('{}', { status: 200 });
});
const sendGridCalls = () =>
  fetchSpy.mock.calls.filter(([url]) => String(url).includes('api.sendgrid.com'));

beforeEach(() => {
  port.sent.length = 0;
  port.configured = true;
  port.result = { ok: true, provider: 'gmail', messageId: 'm-1' };
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubEnv('SENDGRID_API_KEY', 'sg-key-that-must-not-be-used');
});

describe('circuit-breaker alert email', () => {
  it('a circuit opening emails the alert address through the port', async () => {
    const { configureAlerting, handleCircuitStateChange } =
      await import('../self-healing/circuit-alerting.js');
    configureAlerting({ alertEmail: 'oncall@example.com', slackWebhookUrl: '' });
    expect(port.sent).toHaveLength(0);

    await handleCircuitStateChange('gemini-llm', 'closed', 'open', { failures: 5 });
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));

    expect(port.sent[0]).toMatchObject({
      to: 'oncall@example.com',
      kind: 'transactional',
      fromName: 'Ferni Alerts',
      subject: '🚨 Circuit Breaker OPEN: gemini-llm',
    });
    expect(port.sent[0]!.text).toContain('Failure Count: 5');
    expect(sendGridCalls()).toHaveLength(0);
  });
});

describe('trust check-in email', () => {
  const item = {
    id: 'o-1',
    userId: 'u-1',
    type: 'thinking_of_you' as const,
    priority: 'medium' as const,
    message: 'Thinking of you before the interview.',
    ssml: '',
    scheduledFor: new Date(),
    personaId: 'ferni',
    metadata: {},
  };

  it('goes out as bulk mail with an unsubscribe mailto, and keeps reply-to', async () => {
    vi.stubEnv('EMAIL_FROM', 'admin@ferni.ai');
    const { deliverEmail } = await import('../trust-systems/notification-delivery.js');
    const res = await deliverEmail(item, 'sam@example.com', 'Sam');

    expect(res.success).toBe(true);
    expect(port.sent).toHaveLength(1);
    expect(port.sent[0]).toMatchObject({
      to: 'sam@example.com',
      kind: 'bulk',
      unsubscribe: { mailto: 'admin@ferni.ai' },
      replyTo: 'hello@ferni.ai',
      text: item.message,
    });
    expect(port.sent[0]!.subject).toContain('Sam');
    expect(sendGridCalls()).toHaveLength(0);
  });

  it('a port failure is a failed, retryable delivery', async () => {
    port.result = { ok: false, provider: 'gmail', status: 429, error: 'quota', retryable: true };
    const { deliverEmail } = await import('../trust-systems/notification-delivery.js');
    const res = await deliverEmail(item, 'sam@example.com', 'Sam');
    expect(res).toMatchObject({ success: false, retryable: true });
  });
});

describe('concierge email', () => {
  const target = {
    id: 't-1',
    requestId: 'r-1',
    name: 'Seaside Hotel',
    email: 'desk@seaside.example',
    source: 'manual' as const,
    status: 'pending',
    attempts: 0,
    priority: 1,
  };
  const request = {
    target: target as never,
    domain: 'hotel' as const,
    type: 'quote' as const,
    requirements: {},
  };

  it('sends the request through the port, with replies going to the user', async () => {
    const { EmailSender: ConciergeEmail } = await import('../concierge/outreach/email-sender.js');
    const sender = new ConciergeEmail({ userId: 'u-1', userName: 'Sam', userEmail: 'sam@example.com' }); // prettier-ignore
    const res = await sender.send(request);

    expect(res).toMatchObject({ success: true, messageId: 'm-1' });
    expect(port.sent).toEqual([
      expect.objectContaining({
        to: 'desk@seaside.example',
        kind: 'transactional',
        fromName: 'Ferni Concierge',
        replyTo: 'sam@example.com',
        subject: 'Quote Request for Sam',
      }),
    ]);
    expect(sendGridCalls()).toHaveLength(0);
  });

  it('with no transport it reports failure instead of a simulated success', async () => {
    port.configured = false;
    const { EmailSender: ConciergeEmail } = await import('../concierge/outreach/email-sender.js');
    const sender = new ConciergeEmail({ userId: 'u-1', userName: 'Sam', userEmail: 'sam@example.com' }); // prettier-ignore
    const res = await sender.send(request);
    expect(res).toEqual({ success: false, error: 'Email is not configured' });
    expect(port.sent).toHaveLength(0);
  });
});

describe('unified outreach email', () => {
  const content = (text: string, subject?: string) => ({ text, subject, ssml: '', personaId: 'ferni', reason: 'test', confidence: 1 }); // prettier-ignore
  it('goes out as bulk mail with the preferences page as List-Unsubscribe', async () => {
    const { deliver, getChannelStatus } = await import('../outreach/unified-delivery.js');
    expect((await getChannelStatus()).email.available).toBe(true);

    const res = await deliver({
      userId: 'u 1',
      channel: 'email',
      email: 'sam@example.com',
      outreachType: 'reengagement_warmth',
      content: content('Hope the week went well.', 'Checking in'),
    });

    expect(res).toMatchObject({ success: true, channel: 'email', messageId: 'm-1' });
    expect(port.sent).toEqual([
      expect.objectContaining({
        to: 'sam@example.com',
        kind: 'bulk',
        subject: 'Checking in',
        unsubscribe: { url: 'https://app.ferni.ai/preferences?user=u%201' },
        tags: ['reengagement_warmth', 'ferni-outreach'],
      }),
    ]);
    expect(sendGridCalls()).toHaveLength(0);
  });

  it('follows the port for availability, not a SendGrid key', async () => {
    port.configured = false;
    const { deliver, getChannelStatus } = await import('../outreach/unified-delivery.js');
    expect((await getChannelStatus()).email.available).toBe(false);
    const res = await deliver({
      userId: 'u-1',
      channel: 'email',
      email: 'sam@example.com',
      outreachType: 'reengagement_warmth',
      content: content('Hi'),
    });
    expect(res).toMatchObject({ success: false, error: 'Email transport not configured' });
    expect(port.sent).toHaveLength(0);
  });
});

describe('Plaid bank-link email', () => {
  it('sends the secure link through the port as a transactional email', async () => {
    vi.stubEnv('PLAID_CLIENT_ID', 'client');
    vi.stubEnv('PLAID_SECRET', 'secret');
    vi.stubEnv('PLAID_LINK_BASE_URL', 'https://app.ferni.ai/link');
    vi.resetModules(); // plaid.ts reads its credentials at import
    const { createPlaidTools } = await import('../../tools/domains/finance/plaid.js');
    const tool = createPlaidTools().linkBankAccount as unknown as {
      execute: (args: Record<string, string>, opts: unknown) => Promise<string>;
    };
    // The caller comes from the session (#2073), never from the model's arguments.
    const session = { ctx: { userData: { userId: 'u-1' } } };

    const reply = await tool.execute({ deliveryMethod: 'email', contact: 'sam@example.com' }, session); // prettier-ignore

    expect(reply).toContain("I've sent a secure link to sam@example.com");
    expect(port.sent).toHaveLength(1);
    expect(port.sent[0]).toMatchObject({
      to: 'sam@example.com',
      kind: 'transactional',
      subject: '🔐 Securely Link Your Bank Account',
    });
    expect(port.sent[0]!.html).toContain('https://app.ferni.ai/link?token=link-sandbox-1&user=u-1');
    expect(sendGridCalls()).toHaveLength(0);
  });
});
