/**
 * The report after a call that reached voicemail says "left a message" only
 * when Ferni spoke one. Prod 2026-10-24: endCall(voicemail_left) with no
 * message, and the owner was told "left a message". Runs the real path:
 * buildCallOutcome -> captureCallResult -> push + email, and the live
 * "while you were away" context built from the stored result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutgoingEmail } from '../../../types/email-sender.js';
import type { CallTranscriptTurn } from '../call-transcript-intelligence.js';

const stored = vi.hoisted(() => ({ docs: [] as Array<Record<string, unknown>> }));
const fakeDb = vi.hoisted(() => {
  const query = (): Record<string, unknown> => ({
    where: () => query(),
    orderBy: () => query(),
    limit: () => query(),
    get: async () => ({
      forEach: (fn: (doc: { id: string; data: () => unknown }) => void) =>
        stored.docs.forEach((d) => fn({ id: String(d.callId), data: () => d })),
    }),
  });
  const doc = (): Record<string, unknown> => ({
    get: async () => ({ exists: true, data: () => ({ email: 'sam.example@gmail.com' }) }),
    set: async (data: Record<string, unknown>) => {
      if (data && 'outcome' in data) stored.docs.push(data);
    },
    update: async () => {},
    collection: () => collection(),
  });
  const collection = (): Record<string, unknown> => ({
    ...query(),
    doc,
    add: async () => ({ id: 'n-1' }),
  });
  return { collection };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => fakeDb }));
const push = vi.hoisted(() => ({
  send: vi.fn(async (_n: { title: string; body: string }) => ({ success: true })),
}));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => true,
  sendPushNotification: push.send,
}));
vi.mock('../guarded-text.js', () => ({ sendGuardedText: vi.fn(async () => ({ sent: false })) }));
const port = vi.hoisted(() => ({
  send: vi.fn(async (_email: OutgoingEmail) => ({ ok: true, provider: 'gmail' as const })),
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
const { buildPendingCallResultsContext } =
  await import('../../../intelligence/context-builders/external/pending-call-results.js');

const greeting: CallTranscriptTurn[] = [
  { role: 'agent', content: "Hi, is this Sam's mom?" },
  { role: 'recipient', content: "You've reached Linda, leave a message after the tone." },
];
const message: CallTranscriptTurn = {
  role: 'agent',
  content: "Hi Linda, it's Ferni, Sam's AI friend. Sam wanted to check in. Thanks, bye!",
};

async function reportVoicemail(userId: string, turns: CallTranscriptTurn[]) {
  const call = buildOnBehalfDispatch({
    callId: `call-${userId}`,
    requester: { userId, name: 'Sam', timezone: 'America/New_York', originalSessionId: 'gone' },
    contact: { name: 'Mom', phone: '+15555550100', relationship: 'mother' },
    purpose: 'check in on her',
    objective: 'check_in',
    callType: 'personal',
  });
  const outcome = buildCallOutcome(call, turns, null, 'voicemail_left', 30);
  await captureCallResult(call.callId, outcome, toOnBehalfCallRequest(call));
  await vi.waitFor(() => expect(port.send).toHaveBeenCalled());
  await vi.waitFor(() => expect(push.send).toHaveBeenCalled());
  return {
    push: push.send.mock.calls[0][0],
    email: port.send.mock.calls[0][0],
    live: await buildPendingCallResultsContext(userId),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stored.docs = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 401 }))
  );
  vi.stubEnv('EMAIL_PROVIDER', 'gmail');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('report after endCall(voicemail_left)', () => {
  it('no message spoken: push, email and live context all say no message was left', async () => {
    const { push: p, email, live } = await reportVoicemail('u-none', greeting);
    expect(p.title).toBe("📞 Reached Mom's voicemail");
    expect(p.body).toBe('No message left.');
    expect(email.subject).toBe("📞 Reached Mom's voicemail");
    const text = JSON.stringify(email);
    expect(text).toContain("I didn't leave a message");
    expect(text).not.toMatch(/left (a|the) (voicemail|message)/i);
    expect(live).toContain('Voicemail, no message left');
    expect(live).not.toMatch(/Left voicemail/);
  });

  it('message spoken after the greeting: push, email and live context say it was left', async () => {
    const { push: p, email, live } = await reportVoicemail('u-left', [...greeting, message]);
    expect(p.title).toBe('📞 Left voicemail for Mom');
    expect(email.subject).toBe('📞 Left a message for Mom');
    expect(JSON.stringify(email)).toContain('I left a voicemail for Mom');
    expect(live).toContain('Left voicemail');
  });
});
