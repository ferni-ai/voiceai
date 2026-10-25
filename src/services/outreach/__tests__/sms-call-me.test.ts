/**
 * A "call me" text (sms-call-me.ts): until 2026-10-25 every one got "Let me
 * call you now..." and no call was placed. Now the reply says only what was
 * done, and with SMS_CALL_ME=on the call goes through callUserAdapter.call to
 * the account's own verified phone, and to no other number.
 *
 * The second block drives the real Twilio inbound webhook, so the reply that
 * reaches the phone is the one asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../proactive-channels/__tests__/path-firestore.js';

const SETH = 'seth-uid';
const PHONE = '+15555550123';
const docs = new Map<string, Record<string, unknown>>();

const adapter = vi.hoisted(() => ({
  verifiedPhone: vi.fn(async (_userId: string): Promise<string | undefined> => undefined),
  call: vi.fn(
    async (_req: unknown): Promise<{ success: boolean; status?: string; error?: string }> => ({
      success: true,
      status: 'initiated',
    })
  ),
}));
vi.mock('../call-user-adapter.js', () => ({ callUserAdapter: adapter }));

vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../identity/firebase-auth.js', () => ({
  getFirebaseUserByPhone: vi.fn(async (e164: string) => (e164 === PHONE ? { uid: SETH } : null)),
}));
// The webhook finds the account by the profile's phone (findUserByPhone).
vi.mock('../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({
    isInitialized: true,
    listProfiles: async () => [{ id: 'seth-uid', contactInfo: { phone: '+15555550123' } }],
  }),
}));
const routed = vi.hoisted(() =>
  vi.fn(async () => ({
    routeDecision: { agentId: 'ferni' },
    shouldInitiateCall: true,
    callNow: true,
  }))
);
vi.mock('../../conversation-thread/inbound-router.js', () => ({ handleInboundSMS: routed }));
vi.mock('../../contacts/optimal-timing.js', () => ({
  findContactByPhone: vi.fn(async () => null),
  markContactResponded: vi.fn(),
}));

const { answerCallMe, CALLING, CALL_SCHEDULED, NO_CALL } = await import('../sms-call-me.js');
const { handleInboundSMSWebhook } = await import('../webhooks/twilio-webhooks.js');

beforeEach(() => {
  vi.stubEnv('CALL_HOURS_GUARD', 'on'); // prod's setting; SMS_CALL_ME acts only with it
  adapter.verifiedPhone.mockReset().mockResolvedValue(PHONE);
  adapter.call.mockReset().mockResolvedValue({ success: true, status: 'initiated' });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('answerCallMe', () => {
  it('flag off: places no call and does not claim one', async () => {
    vi.stubEnv('SMS_CALL_ME', 'off');
    const reply = await answerCallMe(SETH, PHONE, 'ferni', adapter);
    expect(reply).toBe(NO_CALL);
    expect(reply).not.toMatch(/call(ing)? you/i);
    expect(adapter.call).not.toHaveBeenCalled();
  });

  it('flag on, from the verified phone: rings that phone as the routed persona', async () => {
    vi.stubEnv('SMS_CALL_ME', 'on');
    expect(await answerCallMe(SETH, '(555) 555-0123', 'maya', adapter)).toBe(CALLING);
    expect(adapter.call).toHaveBeenCalledTimes(1);
    expect(adapter.call.mock.calls[0]?.[0]).toMatchObject({
      userId: SETH,
      phoneNumber: PHONE,
      personaId: 'maya',
    });
  });

  it('flag on without CALL_HOURS_GUARD: no call (a quiet-hours call would never be dialled)', async () => {
    vi.stubEnv('SMS_CALL_ME', 'on');
    vi.stubEnv('CALL_HOURS_GUARD', 'off');
    expect(await answerCallMe(SETH, PHONE, 'ferni', adapter)).toBe(NO_CALL);
    expect(adapter.call).not.toHaveBeenCalled();
  });

  it('flag on, deferred by calling hours: says when, not now', async () => {
    vi.stubEnv('SMS_CALL_ME', 'on');
    adapter.call.mockResolvedValue({ success: true, status: 'scheduled' });
    expect(await answerCallMe(SETH, PHONE, 'ferni', adapter)).toBe(CALL_SCHEDULED);
  });

  it.each([
    ['a different number', async () => adapter.verifiedPhone.mockResolvedValue('+15555559999')],
    ['no verified phone', async () => adapter.verifiedPhone.mockResolvedValue(undefined)],
  ])('flag on, %s: no call', async (_name, arrange) => {
    vi.stubEnv('SMS_CALL_ME', 'on');
    await arrange();
    expect(await answerCallMe(SETH, PHONE, 'ferni', adapter)).toBe(NO_CALL);
    expect(adapter.call).not.toHaveBeenCalled();
  });

  it('flag on, the call is refused or throws: says no call was placed', async () => {
    vi.stubEnv('SMS_CALL_ME', 'on');
    adapter.call.mockResolvedValueOnce({ success: false, error: 'Not calling: held' });
    expect(await answerCallMe(SETH, PHONE, 'ferni', adapter)).toBe(NO_CALL);
    adapter.call.mockRejectedValueOnce(new Error('sip down'));
    expect(await answerCallMe(SETH, PHONE, 'ferni', adapter)).toBe(NO_CALL);
  });
});

describe('Twilio inbound webhook, a "call me" text', () => {
  beforeEach(() => {
    docs.clear();
    vi.stubEnv('SKIP_TWILIO_VALIDATION', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('LOG_HASH_SECRET', 'test-hash-secret');
    routed.mockClear();
  });
  const inbound = () =>
    handleInboundSMSWebhook({
      MessageSid: `SM${Math.random()}`,
      Body: 'call me',
      From: PHONE,
      To: '+15555550000',
      NumMedia: '0',
      AccountSid: 'AC1',
    } as never);

  it('flag off: the reply no longer says "Let me call you now"', async () => {
    vi.stubEnv('SMS_CALL_ME', 'off');
    const res = await inbound();
    expect(routed).toHaveBeenCalledTimes(1);
    expect(res.twiml).toContain('Open Ferni whenever'); // TwiML escapes the apostrophe
    expect(res.twiml).not.toMatch(/call you now/i);
    expect(adapter.call).not.toHaveBeenCalled();
  });

  it('flag on, an ask to talk that is not a whole-text call ask: honest reply, no call', async () => {
    vi.stubEnv('SMS_CALL_ME', 'on');
    routed.mockResolvedValueOnce({
      routeDecision: { agentId: 'ferni' },
      shouldInitiateCall: true,
      callNow: false,
    });
    const res = await inbound();
    expect(res.twiml).toContain('Open Ferni whenever');
    expect(adapter.call).not.toHaveBeenCalled();
  });

  it('flag on: the call is placed and the reply says so', async () => {
    vi.stubEnv('SMS_CALL_ME', 'on');
    const res = await inbound();
    expect(adapter.call).toHaveBeenCalledTimes(1);
    expect(res.twiml).toContain(CALLING);
  });
});
