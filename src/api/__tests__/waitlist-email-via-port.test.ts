/**
 * Waitlist email goes through the email port (EMAIL_PROVIDER: SendGrid by
 * default, the ferni.ai Workspace under gmail), not a raw SendGrid fetch: the
 * admin signup notice, the newsletter welcome, the welcome email, and the
 * welcome-call notices. Driven through the real routes with a stubbed port.
 */
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailSender, EmailSendResult, OutgoingEmail } from '../../types/email-sender.js';

const { store, port, call, quota } = vi.hoisted(() => ({
  store: new Map<string, Map<string, Record<string, unknown>>>(),
  quota: { fail: false, chain: Promise.resolve() as Promise<unknown> },
  port: {
    sent: [] as OutgoingEmail[],
    configured: true,
    result: { ok: true, provider: 'gmail', messageId: 'm-1' } as EmailSendResult,
  },
  call: { success: true, message: '' },
}));
const coll = (name: string) => store.get(name) ?? store.set(name, new Map()).get(name)!;
type Ref = { get: () => Promise<unknown>; set: (d: Record<string, unknown>, o?: object) => Promise<void> }; // prettier-ignore
const fakeDb = {
  // The waitlist email quota counts in a transaction
  // (one at a time, as Firestore's retries make them look to each caller)
  runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    if (quota.fail) throw new Error('firestore unavailable');
    const run = quota.chain.then(() => fn({ get: (ref: Ref) => ref.get(), set: (ref: Ref, d: Record<string, unknown>, o?: object) => ref.set(d, o) })); // prettier-ignore
    quota.chain = run.catch(() => undefined);
    return run;
  },
  collection: (name: string) => ({
    doc: (id: string) => ({
      get: async () => ({ exists: coll(name).has(id), data: () => coll(name).get(id) }),
      create: async (data: Record<string, unknown>) => {
        if (coll(name).has(id)) throw Object.assign(new Error('exists'), { code: 6 });
        coll(name).set(id, data);
      },
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) =>
        void coll(name).set(id, opts?.merge ? { ...coll(name).get(id), ...data } : data),
      update: async (data: Record<string, unknown>) =>
        void coll(name).set(id, { ...coll(name).get(id), ...data }),
    }),
    where: () => ({
      limit: () => ({ get: async () => ({ empty: true, docs: [] }) }),
      get: async () => ({ docs: [] }),
    }),
  }),
};
vi.mock('firebase-admin', () => ({ default: { apps: [{}] } }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb, FieldValue: {} }));
vi.mock('../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => fakeDb,
}));
vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false, requireAdmin: () => true }));
vi.mock('../../services/voice/voice-call.js', () => ({
  callWithPersonaVoice: async () => ({ ...call, callSid: 'CA1', usedCartesiaVoice: true }),
}));
vi.mock('../../services/email-transport/index.js', async (orig) => ({
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

const { handleWaitlistRoutes } = await import('../waitlist-routes.js');

const fetchSpy = vi.fn(async () => new Response('{}', { status: 202 }));
const sendGridCalls = () =>
  fetchSpy.mock.calls.filter((args: unknown[]) => String(args[0]).includes('api.sendgrid.com'));
const docId = (e: string) => Buffer.from(e).toString('base64').replace(/[/+=]/g, '_');

async function post(url: string, body: Record<string, unknown>): Promise<number> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url,
    method: 'POST',
    headers: { host: 'localhost', 'content-type': 'application/json' },
    socket: { remoteAddress: `198.51.100.${Math.floor(Math.random() * 200)}` },
  });
  let status = 0;
  const res = { writeHead: (s: number) => void (status = s), setHeader: () => {}, end: () => {} };
  await handleWaitlistRoutes(req as never, res as never);
  return status;
}

beforeEach(() => {
  store.clear();
  port.sent.length = 0;
  port.configured = true;
  port.result = { ok: true, provider: 'gmail', messageId: 'm-1' };
  call.success = true;
  call.message = '';
  quota.fail = false;
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubEnv('SENDGRID_API_KEY', 'sg-key-that-must-not-be-used');
  vi.stubEnv('EMAIL_FROM', 'admin@ferni.ai');
});

describe('waitlist email through the port', () => {
  it('a landing signup sends the admin notice as transactional mail to the admin list', async () => {
    expect(await post('/api/waitlist', { email: 'new@example.com', source: 'landing' })).toBe(200);
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(port.sent[0]).toMatchObject({
      to: ['noreply@ferni.ai', 'admin@ferni.ai'],
      kind: 'transactional',
      fromName: 'Ferni Waitlist',
      subject: '🌿 New Waitlist Signup: new@example.com',
    });
    expect(port.sent[0]!.text).toContain('Source: landing');
    expect(sendGridCalls()).toHaveLength(0);
  });

  it('a newsletter signup also sends the welcome as bulk mail with an unsubscribe mailto', async () => {
    await post('/api/waitlist', { email: 'reader@example.com', source: 'newsletter' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(2));
    const welcome = port.sent.find((e) => e.to === 'reader@example.com');
    expect(welcome).toMatchObject({
      kind: 'bulk',
      unsubscribe: { mailto: 'admin@ferni.ai' },
      fromName: 'Ferni',
    });
    expect(welcome!.subject).toMatch(/^Welcome to Ferni/);
    expect(sendGridCalls()).toHaveLength(0);
  });

  it('approving someone with no phone sends the welcome email', async () => {
    coll('waitlist').set(docId('fresh@example.com'), { email: 'fresh@example.com', status: 'pending' }); // prettier-ignore
    expect(await post('/api/waitlist/approve', { email: 'fresh@example.com' })).toBe(200);
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(port.sent[0]).toMatchObject({
      to: 'fresh@example.com',
      kind: 'transactional',
      subject: "You're in! Welcome to Ferni 🌿",
    });
    expect(sendGridCalls()).toHaveLength(0);
  });

  it('a welcome call that went through notifies the admins', async () => {
    coll('waitlist').set(docId('caller@example.com'), { email: 'caller@example.com', status: 'pending', phone: '+15550001111' }); // prettier-ignore
    await post('/api/waitlist/approve', { email: 'caller@example.com' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(port.sent[0]).toMatchObject({
      to: ['noreply@ferni.ai', 'admin@ferni.ai'],
      kind: 'transactional',
      subject: '📞 ✅ Welcome Call Made: caller@example.com',
    });
    expect(sendGridCalls()).toHaveLength(0);
  });

  it('a failed welcome call notifies the admins of the failure', async () => {
    call.success = false;
    call.message = 'no answer';
    coll('waitlist').set(docId('miss@example.com'), { email: 'miss@example.com', status: 'pending', phone: '+15550002222' }); // prettier-ignore
    await post('/api/waitlist/approve', { email: 'miss@example.com' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(port.sent[0]).toMatchObject({
      kind: 'transactional',
      subject: '⚠️ Welcome Call Failed: miss@example.com',
    });
    expect(port.sent[0]!.html).toContain('Error: no answer');
  });

  it('with the port unconfigured nothing is sent, even with a SendGrid key set', async () => {
    port.configured = false;
    await post('/api/waitlist', { email: 'quiet@example.com', source: 'newsletter' });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(port.sent).toHaveLength(0);
    expect(sendGridCalls()).toHaveLength(0);
  });
});

describe('the daily caps on waitlist email, one bucket per sender', () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const counts = () => coll('ops_email_quota').get(today());
  const signedUp = (e: string) => coll('waitlist').get(docId(e));
  const pending = (e: string) => coll('waitlist').set(docId(e), { email: e, status: 'pending' });
  const settle = () =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
  /** GET the one-click approval link, as the admin email would. */
  async function clickApprovalLink(e: string): Promise<number> {
    const { generateApprovalToken } = await import('../waitlist-approval-token.js');
    const token = generateApprovalToken(e, 'x'.repeat(40));
    const req = { url: `/api/waitlist/approve/${token}?email=${encodeURIComponent(e)}`, method: 'GET', headers: { host: 'localhost' } }; // prettier-ignore
    let status = 0;
    const res = { writeHead: (s: number) => void (status = s), setHeader: () => {}, end: () => {} }; // prettier-ignore
    await handleWaitlistRoutes(req as never, res as never);
    return status;
  }
  beforeEach(() => vi.stubEnv('WAITLIST_APPROVAL_SECRET', 'x'.repeat(40)));

  it('counts each bucket separately, per recipient', async () => {
    await post('/api/waitlist', { email: 'counted@example.com', source: 'newsletter' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(2));
    pending('admin-ok@example.com');
    await post('/api/waitlist/approve', { email: 'admin-ok@example.com' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(3));
    pending('link-ok@example.com');
    expect(await clickApprovalLink('link-ok@example.com')).toBe(200);
    await vi.waitFor(() => expect(port.sent).toHaveLength(4));
    // admin notice (2 recipients) + link-approval welcome (1); newsletter (1); admin-API welcome (1)
    expect(counts()).toMatchObject({ adminNotice: 3, public: 1, approved: 1 });
  });

  it('a full public bucket stops the newsletter welcome but not admin notices or approvals', async () => {
    vi.stubEnv('WAITLIST_EMAIL_DAILY_LIMIT', '5');
    coll('ops_email_quota').set(today(), { public: 5 });
    expect(await post('/api/waitlist', { email: 'late@example.com', source: 'newsletter' })).toBe(200); // prettier-ignore
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(port.sent[0]!.subject).toContain('New Waitlist Signup');
    await settle();
    expect(port.sent).toHaveLength(1); // no newsletter welcome
    expect(signedUp('late@example.com')).toMatchObject({ status: 'pending' });

    pending('approved@example.com');
    await post('/api/waitlist/approve', { email: 'approved@example.com' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(2));
    expect(port.sent[1]).toMatchObject({ to: 'approved@example.com' });
    expect(counts()).toMatchObject({ public: 5, adminNotice: 2, approved: 1 });
  });

  it('a full adminNotice bucket stops admin notices and link approvals, not the newsletter or admin-API approvals', async () => {
    vi.stubEnv('WAITLIST_ADMIN_NOTICE_DAILY_LIMIT', '3');
    coll('ops_email_quota').set(today(), { adminNotice: 3 });
    expect(await post('/api/waitlist', { email: 'reader@example.com', source: 'newsletter' })).toBe(200); // prettier-ignore
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(port.sent[0]).toMatchObject({ to: 'reader@example.com', kind: 'bulk' });

    pending('link@example.com');
    expect(await clickApprovalLink('link@example.com')).toBe(200); // still approved
    await settle();
    expect(port.sent).toHaveLength(1);
    expect(signedUp('link@example.com')).toMatchObject({ status: 'approved' });

    pending('admin@example.com');
    await post('/api/waitlist/approve', { email: 'admin@example.com' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(2));
    expect(port.sent[1]).toMatchObject({ to: 'admin@example.com' });
  });

  it('a 2-recipient notice that would cross its cap is skipped', async () => {
    vi.stubEnv('WAITLIST_ADMIN_NOTICE_DAILY_LIMIT', '1');
    await post('/api/waitlist', { email: 'edge@example.com', source: 'newsletter' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(port.sent[0]!.to).toBe('edge@example.com');
    expect(counts()).toMatchObject({ public: 1 });
    expect(counts()?.adminNotice).toBeUndefined();
  });

  it('a counter error fails closed for the capped buckets; an admin-API approval still sends', async () => {
    quota.fail = true;
    expect(await post('/api/waitlist', { email: 'down@example.com', source: 'newsletter' })).toBe(200); // prettier-ignore
    pending('link-down@example.com');
    expect(await clickApprovalLink('link-down@example.com')).toBe(200);
    await settle();
    expect(port.sent).toHaveLength(0);
    expect(signedUp('down@example.com')).toMatchObject({ status: 'pending' });

    pending('admin-down@example.com');
    await post('/api/waitlist/approve', { email: 'admin-down@example.com' });
    await vi.waitFor(() => expect(port.sent).toHaveLength(1));
    expect(port.sent[0]).toMatchObject({ to: 'admin-down@example.com' });
  });
});
