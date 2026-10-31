/**
 * #3178 verify: an Auth failure is unknown, never "no Firebase owner". The real
 * firebase-auth module (getFirebaseUserByPhoneOrThrow) runs over a fake Admin SDK,
 * and the real Twilio inbound webhook decides; a phone: record holds the same
 * number, so a swallowed Auth error would route the text, and apply STOP, to it.
 * Order matters: the first test runs before the fake SDK reports an app, which
 * firebase-auth then caches. Synthetic 555-01xx numbers only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../proactive-channels/__tests__/path-firestore.js';

const PHONE = '+15555550123';
const docs = new Map<string, Record<string, unknown>>();

const sdk = vi.hoisted(() => ({
  apps: [] as unknown[],
  getUserByPhoneNumber: vi.fn(async (_e164: string): Promise<{ uid: string }> => {
    throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
  }),
}));
vi.mock('firebase-admin', () => {
  const admin = {
    get apps() {
      return sdk.apps;
    },
    initializeApp: () => {
      throw new Error('no credentials');
    },
    credential: { applicationDefault: () => ({}) },
    auth: () => ({ getUserByPhoneNumber: sdk.getUserByPhoneNumber }),
  };
  return { default: admin };
});
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({}) }));
vi.mock('../../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
const routed = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => ({
    routeDecision: { agentId: 'ferni' },
    shouldInitiateCall: false,
  }))
);
vi.mock('../../../conversation-thread/inbound-router.js', () => ({ handleInboundSMS: routed }));
vi.mock('../../proactive-channels/sms-replies.js', () => ({
  handleProactiveSmsReply: async () => null,
}));
vi.mock('../../../contacts/optimal-timing.js', () => ({
  findContactByPhone: async () => null,
  markContactResponded: vi.fn(),
}));
const engine = vi.hoisted(() => ({
  getUserState: vi.fn((_userId: string) => ({ allowedChannels: ['email', 'sms'] })),
  updateUserState: vi.fn(),
}));
vi.mock('../../decision-engine.js', () => ({ getOutreachDecisionEngine: () => engine }));

const { handleInboundSMSWebhook } = await import('../twilio-webhooks.js');

const text = (Body: string) =>
  handleInboundSMSWebhook({
    MessageSid: `SM${Math.random()}`,
    Body,
    From: PHONE,
    To: '+15555550100',
    NumMedia: '0',
    AccountSid: 'AC1',
  } as never);

/** A reply and a STOP from the number: where each landed. */
async function replyAndStop(): Promise<{ routedTo: unknown; stopped: unknown }> {
  await text('hey there');
  await text('STOP');
  return {
    routedTo: routed.mock.calls[0]?.[0] ?? null,
    stopped: engine.updateUserState.mock.calls[0]?.[0] ?? null,
  };
}

const NOTHING = { routedTo: null, stopped: null };

beforeEach(() => {
  docs.clear();
  docs.set(`bogle_users/phone:${PHONE}`, { name: 'called first' });
  vi.clearAllMocks();
  vi.stubEnv('SKIP_TWILIO_VALIDATION', 'true');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '');
  vi.stubEnv('FIREBASE_PROJECT_ID', '');
});

describe('inbound SMS when Firebase Auth cannot answer', () => {
  it('Admin SDK not initialized: unknown, nothing routed or written', async () => {
    expect(await replyAndStop()).toEqual(NOTHING);
    expect(sdk.getUserByPhoneNumber).not.toHaveBeenCalled();
  });

  it('an Auth error (auth/internal-error): unknown, nothing routed or written', async () => {
    sdk.apps = [{ name: '[DEFAULT]' }];
    sdk.getUserByPhoneNumber.mockRejectedValue(
      Object.assign(new Error('internal'), { code: 'auth/internal-error' })
    );
    expect(await replyAndStop()).toEqual(NOTHING);
    expect(sdk.getUserByPhoneNumber).toHaveBeenCalled();
  });

  it('Auth says no user has the number: the phone: record is the owner', async () => {
    sdk.getUserByPhoneNumber.mockRejectedValue(
      Object.assign(new Error('no user'), { code: 'auth/user-not-found' })
    );
    const owner = `phone:${PHONE}`;
    expect(await replyAndStop()).toEqual({ routedTo: owner, stopped: owner });
  });

  it('Auth names an owner: it wins over the phone: record', async () => {
    sdk.getUserByPhoneNumber.mockResolvedValue({ uid: 'firebase-uid' });
    expect(await replyAndStop()).toEqual({ routedTo: 'firebase-uid', stopped: 'firebase-uid' });
  });
});
