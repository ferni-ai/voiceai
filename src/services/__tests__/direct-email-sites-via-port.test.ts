/**
 * The app's former raw-provider senders go through the email port, the ferni.ai
 * Workspace mailbox (the only transport): circuit-breaker alerts, trust check-ins,
 * concierge requests, unified outreach email and the Plaid bank-link email.
 *
 * Each case drives the site's real entry point with a stubbed port and checks
 * the email it hands over (recipient, kind, subject) and that no mail was sent
 * by a direct fetch to some provider.
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
/** Fetches other than Plaid's: a site mailing around the port would show up here. */
const directMailCalls = () =>
  fetchSpy.mock.calls.filter(([url]) => !String(url).includes('plaid.com'));

beforeEach(() => {
  port.sent.length = 0;
  port.configured = true;
  port.result = { ok: true, provider: 'gmail', messageId: 'm-1' };
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
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
    expect(directMailCalls()).toHaveLength(0);
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
    expect(directMailCalls()).toHaveLength(0);
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
    expect(directMailCalls()).toHaveLength(0);
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
    expect(directMailCalls()).toHaveLength(0);
  });

  it('follows the port for availability', async () => {
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
  const linkByEmail = async (verifiedCaller: boolean) => {
    vi.stubEnv('PLAID_CLIENT_ID', 'client');
    vi.stubEnv('PLAID_SECRET', 'secret');
    vi.stubEnv('PLAID_LINK_BASE_URL', 'https://app.ferni.ai/link');
    vi.resetModules(); // plaid.ts reads its credentials at import
    const { setCallUserPort } = await import('../../tools/domains/proactive/outreach/call-user-port.js'); // prettier-ignore
    // The account's verified address (the call-user port), never one from the model.
    setCallUserPort({
      verifiedPhone: async () => undefined,
      verifiedEmail: async (uid) => (uid === 'u-1' ? 'sam@example.com' : undefined),
      call: async () => ({ success: false }),
    });
    const { createPlaidTools } = await import('../../tools/domains/finance/plaid.js');
    const tool = createPlaidTools().linkBankAccount as unknown as {
      execute: (args: Record<string, string>, opts: unknown) => Promise<string>;
    };
    // The caller comes from the session (#2073), verified by the server, never from the arguments.
    const session = { ctx: { userData: { userId: 'u-1', verifiedCaller } } };
    return tool.execute({ deliveryMethod: 'email', contact: 'stranger@example.com' }, session);
  };

  it('sends the secure link through the port as a transactional email, to the verified address', async () => {
    const reply = await linkByEmail(true);

    expect(reply).toContain("I've sent a secure link to the email on your account");
    expect(port.sent).toHaveLength(1);
    expect(port.sent[0]).toMatchObject({
      to: 'sam@example.com',
      kind: 'transactional',
      subject: '🔐 Securely Link Your Bank Account',
    });
    expect(port.sent[0]!.html).toContain('https://app.ferni.ai/link?token=link-sandbox-1&user=u-1');
    expect(JSON.stringify(port.sent)).not.toContain('stranger@example.com');
    expect(directMailCalls()).toHaveLength(0);
  });

  it('a caller the server did not verify: no email at all', async () => {
    const reply = await linkByEmail(false);

    expect(reply).toContain('signed in to the Ferni app');
    expect(port.sent).toHaveLength(0);
    expect(directMailCalls()).toHaveLength(0);
  });
});
