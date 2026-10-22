/**
 * A coaching pick texted on a call goes through the guarded sender
 * (guarded-text.ts) for real: the number the account verified, a STOP or texts
 * turned off, the gap, the lock and the feature_checkins record. Firestore is
 * in memory; Firebase Auth (the verified phone) and Twilio are stubbed at the
 * SDK boundary. The card store, the pick log, the follow-up commitment and the
 * app inbox are stubbed: pick-delivery.test.ts covers them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../outreach/proactive-channels/__tests__/path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const authUsers = new Map<string, { phoneNumber?: string }>();
/** What reached Twilio through the guarded sender. */
const texts: Array<{ to: string; body: string }> = [];

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../identity/firebase-auth.js', () => ({
  getFirebaseUser: vi.fn(async (uid: string) => authUsers.get(uid) ?? null),
}));
vi.mock('../../outreach/delivery/sms-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isSMSDeliveryAvailable: () => true,
  sendSMS: vi.fn(async ({ to, body }: { to: string; body: string }) => {
    texts.push({ to, body });
    return { success: true, messageSid: 'SM1' };
  }),
}));
/** The raw Twilio sender this path used before: nothing may reach it. */
const directSMS = vi.fn(async (_to: string, _body: string) => 'SM-direct');
vi.mock('../../communication-service.js', () => ({ sendSMS: directSMS }));

const CARD = { id: 'c'.repeat(43), url: `https://app.example/a/${'c'.repeat(43)}` };
vi.mock('../../approvals/answer-cards.js', () => ({ createAnswerCard: async () => CARD }));
const saveInAppMessage = vi.fn(async () => ({ success: true, channel: 'in_app' }));
vi.mock('../../outreach/unified-delivery.js', () => ({ saveInAppMessage }));
const saveCommitment = vi.fn(async () => undefined);
vi.mock('../../trust-systems/commitment-tracking.js', () => ({ saveCommitment }));
vi.mock('../../user-preferences-store.js', () => ({ storeUserPreferences: vi.fn() }));
vi.mock('../pick-log.js', () => ({
  markSent: vi.fn(async () => undefined),
  recentPicks: vi.fn(async () => []),
}));
vi.mock('../quota.js', () => ({ takeDailyBudget: vi.fn(async () => true) }));

const { deliverPick, rememberPick, smsBody } = await import('../pick-delivery.js');
const { phoneHash } = await import('../../outreach/checkin-replies.js');

const USER = 'coachMediaGuardUser1';
const PHONE = '+14155550134';
const PICK = {
  topic: 'shin splint stretches',
  candidate: {
    kind: 'video' as const,
    title: 'Shin Splint Rehab',
    by: 'Physio Pat',
    url: 'https://www.youtube.com/watch?v=vid1',
    length: '8 minutes',
  },
  why: 'Eight gentle minutes, made for beginners.',
  pickId: 'pick-1',
};
const BODY = smsBody(PICK.candidate, PICK.candidate.url, CARD.url);
const records = () =>
  [...docs.entries()].filter(([p]) => p.startsWith('feature_checkins/')).map(([, d]) => d);

async function sendPick(): Promise<string> {
  const session = {};
  rememberPick(session, PICK);
  return deliverPick(session, USER, 'text', 'ferni');
}

beforeEach(() => {
  docs.clear();
  authUsers.clear();
  texts.length = 0;
  vi.clearAllMocks();
  vi.stubEnv('COACH_MEDIA', 'on');
  vi.stubEnv('APPROVALS_PAGE', 'on');
  vi.stubEnv('LOG_HASH_SECRET', 'test-hash-secret');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T16:00:00Z'));
  docs.set(`bogle_users/${USER}`, { name: 'Test Member' });
  authUsers.set(USER, { phoneNumber: PHONE });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('a coaching pick texted through the guarded sender', () => {
  it('an opted-in member gets the same text, recorded as a coach-media text', async () => {
    expect(records()).toHaveLength(0);

    expect(await sendPick()).toContain('Texted it');

    expect(texts).toEqual([{ to: PHONE, body: BODY }]);
    expect(directSMS).not.toHaveBeenCalled();
    expect(records()).toEqual([
      expect.objectContaining({
        kind: 'coach-media',
        refId: 'pick-1',
        status: 'sent',
        userId: USER,
      }),
    ]);
    expect(saveCommitment).toHaveBeenCalledTimes(1);
  });

  it('a number that replied STOP gets no text, and the model is told to offer the app', async () => {
    docs.set(`feature_checkin_optouts/${phoneHash(PHONE)}`, {
      at: '2026-10-20T12:00:00Z',
      via: 'reply',
    });

    const said = await sendPick();

    expect(said).toContain('STOP');
    expect(said).toContain('Offer the app');
    expect(texts).toHaveLength(0);
    expect(directSMS).not.toHaveBeenCalled();
    expect(records()).toHaveLength(0);
    // Nothing went, so no "did it help?" is scheduled for it.
    expect(saveCommitment).not.toHaveBeenCalled();
  });

  it('texts turned off in their settings mean no text either', async () => {
    docs.set(`bogle_users/${USER}`, { outreachPreferences: { enabled: false } });

    expect(await sendPick()).toContain('turned texts off');
    expect(texts).toHaveLength(0);
    expect(directSMS).not.toHaveBeenCalled();
  });
});
