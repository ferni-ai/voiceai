/**
 * The report-back email after a call made on someone's behalf goes through the
 * app's one transport, the ferni.ai Workspace mailbox (Seth, 2026-10-27, #2947),
 * and every caller reports what the transport answered: a failed send is logged
 * as a failure with a code only (never the address or body), never as "sent".
 * Real paths: captureCallResult -> sendCallResultEmail -> email-delivery, and
 * captureBackgroundResult (unified-result-capture) -> email-delivery, with a fake
 * Gmail transport behind setEmailSenderForTests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailSendResult, EmailSender, OutgoingEmail } from '../../../types/email-sender.js';

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

/** Every log line, from every logger, as { level, fields, msg }. */
const logs = vi.hoisted(
  () => [] as Array<{ level: string; fields: Record<string, unknown>; msg: string }>
);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const fake = (): Record<string, unknown> => {
    const at = (level: string) => (fields: unknown, msg?: string) => {
      logs.push({ level, fields: typeof fields === 'object' && fields ? (fields as Record<string, unknown>) : {}, msg: msg ?? String(fields) }); // prettier-ignore
    };
    return { info: at('info'), warn: at('warn'), error: at('error'), debug: at('debug'), child: fake }; // prettier-ignore
  };
  return {
    ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
    getLogger: fake,
    createLogger: fake,
  };
});

const send = vi.fn(async (_email: OutgoingEmail): Promise<EmailSendResult> => ({ ok: true, provider: 'gmail', messageId: 'gm-report' })); // prettier-ignore
const fakeGmail: EmailSender = { provider: 'gmail', isConfigured: () => true, send };

const { setEmailSenderForTests } = await import('../../email-transport/index.js');
const { buildCallOutcome, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { captureCallResult } = await import('../call-result-capture.js');
const { completedAtFor, contactForOwner } = await import('../call-result-words.js');
const { captureBackgroundResult } =
  await import('../../background-agents/unified-result-capture.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');

const fetchMock = vi.fn(async () => new Response('', { status: 599 }));
const FAILED: EmailSendResult = { ok: false, provider: 'gmail', status: 401, error: 'gmail 401: not authorized' }; // prettier-ignore

function callFor(userId: string) {
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
  return { call, outcome, request: toOnBehalfCallRequest(call) };
}

const said = (msg: string) => logs.filter((l) => l.msg === msg);
const summary = () => said('Call result captured')[0]?.fields;

beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  send.mockReset();
  send.mockResolvedValue({ ok: true, provider: 'gmail', messageId: 'gm-report' });
  setEmailSenderForTests(fakeGmail);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  setEmailSenderForTests(null);
  vi.unstubAllGlobals();
});

describe('call report-back email (captureCallResult)', () => {
  it('goes through the Workspace transport and is logged as sent only when it was', async () => {
    const { call, outcome, request } = callFor('u-ok');
    await captureCallResult(call.callId, outcome, request);
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0][0];
    expect(sent.to).toBe(OWNER);
    expect(sent.subject).toMatch(/Mom/);
    expect(sent.metadata).toMatchObject({ userId: 'u-ok', outreachId: 'call-u-ok' });
    expect(fetchMock).not.toHaveBeenCalled(); // no other provider exists
    expect(said('Email notification sent for call result')).toHaveLength(1);
    expect(summary()).toMatchObject({ mailStatus: 'sent' });
  });

  it('a transport failure is logged as a failure with a code, never as sent', async () => {
    send.mockResolvedValue(FAILED);
    const { call, outcome, request } = callFor('u-fail');
    await captureCallResult(call.callId, outcome, request);
    expect(send).toHaveBeenCalledTimes(1);
    expect(said('Email notification sent for call result')).toHaveLength(0);
    const failed = said('Email notification NOT sent');
    expect(failed).toHaveLength(1);
    expect(failed[0].fields).toMatchObject({ code: '401' });
    expect(JSON.stringify(failed)).not.toContain(OWNER);
    expect(summary()).toMatchObject({ mailStatus: 'failed' });
  });

  it('says "your mom" when the contact was never resolved, never "my mom"', async () => {
    const { call, outcome, request } = callFor('u-mom');
    await captureCallResult(call.callId, outcome, { ...request, resolvedContact: undefined, contactQuery: 'my mom' }); // prettier-ignore
    const { subject, text } = send.mock.calls[0][0];
    expect(`${subject}\n${text}`).toContain('your mom');
    expect(`${subject}\n${text}`).not.toMatch(/\bmy mom\b/i);
  });
});

describe('call-result wording helpers', () => {
  it('turns the owner\'s "my X" into "your X" and leaves names alone', () => {
    expect(contactForOwner('my mom')).toBe('your mom');
    expect(contactForOwner('My Doctor')).toBe('your Doctor');
    expect(contactForOwner('Mom')).toBe('Mom');
    expect(contactForOwner('Myra')).toBe('Myra');
  });

  it("formats Completed in the owner's timezone, and omits it when unknown", () => {
    const at = new Date('2026-10-27T03:30:00Z');
    expect(completedAtFor('America/Los_Angeles', at)).toMatch(/Monday, October 26.*8:30\sPM/);
    expect(completedAtFor('Asia/Tokyo', at)).toMatch(/Tuesday, October 27.*12:30\sPM/);
    expect(completedAtFor(undefined, at)).toBe('');
    expect(completedAtFor('Not/AZone', at)).toBe('');
  });
});

describe('background result email (captureBackgroundResult)', () => {
  const params = {
    userId: 'u-bg',
    type: 'research_complete' as const,
    status: 'success' as const,
    summary: 'Found three options',
    priority: 'high' as const,
    initiatedBy: 'peter',
  };

  it('logs the email as sent when the transport sent it', async () => {
    await captureBackgroundResult(params);
    expect(send).toHaveBeenCalledTimes(1);
    expect(said('Email notification sent')).toHaveLength(1);
    expect(said('Background result captured')[0]?.fields).toMatchObject({ email: 'sent' });
  });

  it('logs a transport failure as a failure, not "Email notification sent"', async () => {
    send.mockResolvedValue(FAILED);
    await captureBackgroundResult(params);
    expect(send).toHaveBeenCalledTimes(1);
    expect(said('Email notification sent')).toHaveLength(0);
    expect(said('Email notification NOT sent')[0]?.fields).toMatchObject({ code: '401' });
    expect(JSON.stringify(logs.filter((l) => l.level !== 'info'))).not.toContain(OWNER);
    expect(said('Background result captured')[0]?.fields).toMatchObject({ email: 'failed' });
  });
});
