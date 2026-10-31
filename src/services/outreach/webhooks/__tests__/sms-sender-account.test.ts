/**
 * #3169: an inbound text belongs to the account whose VERIFIED phone sent it
 * (sms-sender-account.ts), never to a profile whose unverified contactInfo.phone
 * matches, and never by scanning profiles. The real lookup runs over an
 * in-memory Firestore; the second block drives the real Twilio inbound webhook
 * (reply routing and STOP). Synthetic 555-01xx numbers only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../proactive-channels/__tests__/path-firestore.js';

const PHONE = '+15555550123';
const docs = new Map<string, Record<string, unknown>>();
const authOwners = new Map<string, string>();

const logged = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = (): Record<string, unknown> => ({
    ...logged,
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: () => logger(),
  });
  return { getLogger: logger, createLogger: logger, safeLog: logger };
});
vi.mock('../../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../../identity/firebase-auth.js', () => ({
  getFirebaseUserByPhoneOrThrow: vi.fn(async (e164: string) => {
    const uid = authOwners.get(e164);
    return uid ? { uid } : null;
  }),
}));
// The old lookup's source. Every profile here has the sender's number unverified,
// so a scan would match them; nothing should read it now.
const listProfiles = vi.hoisted(() => vi.fn());
vi.mock('../../../../memory/profile-store.js', () => ({
  getProfileStore: async () => ({ isInitialized: true, listProfiles }),
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

const { findAccountByVerifiedPhone, MAX_LINKED } = await import('../sms-sender-account.js');
const { handleInboundSMSWebhook } = await import('../twilio-webhooks.js');

const user = (id: string, data: Record<string, unknown>) => docs.set(`bogle_users/${id}`, data);
const unverified = (id: string) => user(id, { contactInfo: { phone: PHONE } });
const linked = (id: string, phone = PHONE) => user(id, { linkedIdentifiers: [`phone:${phone}`] });

beforeEach(() => {
  docs.clear();
  authOwners.clear();
  vi.clearAllMocks();
  listProfiles.mockResolvedValue([{ id: 'unverified-uid', contactInfo: { phone: PHONE } }]);
});

describe('findAccountByVerifiedPhone', () => {
  it('an unverified profile phone is not a match; the same number verified is', async () => {
    unverified('unverified-uid');
    expect(await findAccountByVerifiedPhone(PHONE)).toBeNull();
    linked('verified-uid');
    expect(await findAccountByVerifiedPhone(PHONE)).toBe('verified-uid');
  });

  it('matches each verified source: a phone: account, a linked phone, the Firebase phone', async () => {
    user(`phone:${PHONE}`, { name: 'phone first' });
    expect(await findAccountByVerifiedPhone('(555) 555-0123')).toBe(`phone:${PHONE}`);
    docs.clear();
    authOwners.set(PHONE, 'auth-uid');
    expect(await findAccountByVerifiedPhone(PHONE)).toBe('auth-uid');
  });

  it('finds an account past the first 1,000 profiles, with no profile scan', async () => {
    for (let i = 0; i < 1000; i++) unverified(`filler-${String(i).padStart(4, '0')}`);
    linked('zz-late-uid');
    expect(await findAccountByVerifiedPhone(PHONE)).toBe('zz-late-uid');
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it('a phone: account merged into a web account is one owner, the web account', async () => {
    user(`phone:${PHONE}`, { _migratedTo: 'web-uid' });
    linked('web-uid');
    authOwners.set(PHONE, 'web-uid');
    expect(await findAccountByVerifiedPhone(PHONE)).toBe('web-uid');
  });

  it('the Firebase owner wins over an unmerged phone: record, as for calls', async () => {
    user(`phone:${PHONE}`, { name: 'called first' });
    expect(await findAccountByVerifiedPhone(PHONE)).toBe(`phone:${PHONE}`);
    authOwners.set(PHONE, 'firebase-uid'); // then verified the number in Settings
    expect(await findAccountByVerifiedPhone(PHONE)).toBe('firebase-uid');
    expect(logged.error).not.toHaveBeenCalled();
  });

  it('the Firebase owner wins over a different linked owner', async () => {
    linked('linked-uid');
    authOwners.set(PHONE, 'firebase-uid');
    expect(await findAccountByVerifiedPhone(PHONE)).toBe('firebase-uid');
  });

  it.each([
    ['two linked accounts', () => (linked('a-uid'), linked('b-uid'))],
    ['a phone: account and a linked one', () => (user(`phone:${PHONE}`, {}), linked('b-uid'))],
    [
      `${MAX_LINKED} linked records`,
      () => Array.from({ length: MAX_LINKED }, (_, i) => linked(`l${i}`)),
    ],
  ])(
    'more than one owner (%s): unknown, and an error log with no phone in it',
    async (_n, arrange) => {
      arrange();
      expect(logged.error).not.toHaveBeenCalled();
      expect(await findAccountByVerifiedPhone(PHONE)).toBeNull();
      expect(logged.error).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(logged.error.mock.calls)).not.toMatch(/555\D?0123|5550123/);
    }
  );

  it.each([
    ['Auth', 'authAccount'],
    ['Firestore', 'linkedAccounts'],
  ] as const)('a failed %s read is unknown, never a guess', async (_n, failing) => {
    const fail = async (): Promise<never> => {
      throw new Error('unavailable');
    };
    const index = {
      phoneAccount: async () => ({ id: `phone:${PHONE}`, data: {} }),
      linkedAccounts: async () => [],
      authAccount: async () => null,
      [failing]: fail,
    };
    expect(await findAccountByVerifiedPhone(PHONE, index)).toBeNull();
    expect(logged.error).toHaveBeenCalledTimes(1);
  });
});

describe('Twilio inbound webhook', () => {
  beforeEach(() => {
    vi.stubEnv('SKIP_TWILIO_VALIDATION', 'true');
    vi.stubEnv('NODE_ENV', 'test');
  });
  const text = (Body: string) =>
    handleInboundSMSWebhook({
      MessageSid: `SM${Math.random()}`,
      Body,
      From: PHONE,
      To: '+15555550100',
      NumMedia: '0',
      AccountSid: 'AC1',
    } as never);

  it('a reply from an unverified-only number is not routed to that account', async () => {
    unverified('unverified-uid');
    await text('hey there');
    expect(routed).not.toHaveBeenCalled();
    linked('verified-uid'); // the same reply from a verified number is routed
    await text('hey there');
    expect(routed).toHaveBeenCalledTimes(1);
    expect(routed.mock.calls[0]).toEqual(
      expect.arrayContaining(['verified-uid', PHONE, 'hey there'])
    );
  });

  it('STOP from an unverified-only number changes no account; from a verified one it does', async () => {
    unverified('unverified-uid');
    expect(engine.updateUserState).not.toHaveBeenCalled();
    await text('STOP');
    expect(engine.updateUserState).not.toHaveBeenCalled();
    linked('verified-uid');
    await text('STOP');
    expect(engine.updateUserState).toHaveBeenCalledWith('verified-uid', {
      allowedChannels: ['email'],
    });
  });

  it('no inbound log line carries the sender number', async () => {
    linked('verified-uid');
    await text('hey there');
    const lines = JSON.stringify([logged.info.mock.calls, logged.warn.mock.calls]);
    expect(lines).toContain('0123'); // phoneLast4 is there
    expect(lines).not.toMatch(/555\D?0123|5550123/);
  });
});
