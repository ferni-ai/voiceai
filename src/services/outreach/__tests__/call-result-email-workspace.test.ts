/**
 * The report-back email after a call made on someone's behalf. It used to go
 * through SendGrid, whose key 401s in prod, so nobody got it. With
 * EMAIL_PROVIDER=gmail the real report path (captureCallResult ->
 * sendCallResultEmail -> email-delivery sendEmail) reaches the Workspace port,
 * with no SendGrid key and no email init.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutgoingEmail } from '../../../types/email-sender.js';

const OWNER = 'sam.example@gmail.com'; // made up
const fakeDb = vi.hoisted(() => {
  const doc = (): Record<string, unknown> => ({
    get: async () => ({ exists: true, data: () => ({ email: 'sam.example@gmail.com' }) }),
    set: async () => {},
    update: async () => {},
    collection: () => collection(),
  });
  const collection = (): Record<string, unknown> => ({
    doc,
    add: async () => ({ id: 'n-1' }),
  });
  return { collection };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fakeDb }));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => false,
  sendPushNotification: vi.fn(),
}));
vi.mock('../guarded-text.js', () => ({ sendGuardedText: vi.fn(async () => ({ sent: false })) }));

const port = vi.hoisted(() => ({
  send: vi.fn(async (_email: OutgoingEmail) => ({
    ok: true,
    provider: 'gmail' as const,
    messageId: 'gm-report',
  })),
  isConfigured: vi.fn(() => true),
}));
vi.mock('../../email-transport/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../email-transport/index.js')>()),
  getEmailSender: () => ({ provider: 'gmail', ...port }),
}));

const { buildCallOutcome, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { captureCallResult } = await import('../call-result-capture.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');

const fetchMock = vi.fn(async () => new Response('', { status: 401 }));

async function report(userId: string): Promise<void> {
  const call = buildOnBehalfDispatch({
    callId: `call-${userId}`,
    requester: { userId, name: 'Sam', timezone: 'America/New_York', originalSessionId: 'gone' },
    contact: { name: 'Mom', phone: '+15555550100', relationship: 'mother' },
    purpose: 'check in on her',
    objective: 'check_in',
    callType: 'personal',
  });
  const outcome = buildCallOutcome(
    call,
    [
      { role: 'agent', content: "Hi, it's Ferni, calling for Sam." },
      { role: 'recipient', content: 'Oh hi! Tell him I said hello. Bye now!' },
    ],
    null,
    'completed',
    40
  );
  await captureCallResult(call.callId, outcome, toOnBehalfCallRequest(call));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('SENDGRID_API_KEY', '');
  vi.stubEnv('RESEND_API_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('call report-back email', () => {
  it('is skipped while no transport is configured (EMAIL_PROVIDER unset, no key)', async () => {
    vi.stubEnv('EMAIL_PROVIDER', '');
    await report('u-unset');
    expect(port.send).not.toHaveBeenCalled();
  });

  it('reaches the Workspace port with EMAIL_PROVIDER=gmail and no SendGrid key', async () => {
    vi.stubEnv('EMAIL_PROVIDER', 'gmail');
    await report('u-gmail');
    expect(port.send).toHaveBeenCalledTimes(1);
    const sent = port.send.mock.calls[0][0];
    expect(sent.to).toBe(OWNER);
    expect(sent.kind).toBe('transactional');
    expect(sent.subject).toMatch(/Mom/);
    expect(sent.metadata).toMatchObject({ userId: 'u-gmail', outreachId: 'call-u-gmail' });
    expect(fetchMock.mock.calls.map((c) => String((c as unknown[])[0]))).not.toContain(
      'https://api.sendgrid.com/v3/mail/send'
    );
  });
});
