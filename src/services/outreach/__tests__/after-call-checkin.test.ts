import { afterEach, describe, expect, it, vi } from 'vitest';
import { atomicLocks } from './atomic-locks.js';
import {
  CHECKIN_QUESTION,
  decideCheckin,
  lastSentAt,
  recordUserId,
  redactNumbers,
  resolveCheckinPhone,
  runAfterCallCheckin,
  smsTurnedOff,
  type CheckinDeps,
  type CheckinStore,
} from '../after-call-checkin.js';
import { phoneHash, type CheckinRecord, type StoredCheckin } from '../checkin-replies.js';
import type { AfterCallContext } from '../../session/after-call-tasks.js';

const NOW = new Date('2026-10-11T18:00:00Z');
const HOUR = 60 * 60 * 1000;
const ago = (h: number): string => new Date(NOW.getTime() - h * HOUR).toISOString();
const ENV = { COHORT_FLAGS: 'on', LOG_HASH_SECRET: 'test-secret' };
const HASH = phoneHash('+15551234567', ENV) ?? '';

function turns(userCount: number): AfterCallContext['turns'] {
  return Array.from({ length: userCount }, () => [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hey' },
  ]).flat();
}

function ctx(over: Partial<AfterCallContext> = {}): AfterCallContext {
  return { userId: 'uid-123', sessionId: 's1', turns: turns(5), startedAt: NOW, ...over };
}

function stored(over: Partial<StoredCheckin> = {}): StoredCheckin {
  return {
    id: 'c1',
    userId: 'uid-123',
    sessionId: 's0',
    sentAt: ago(1),
    question: CHECKIN_QUESTION,
    status: 'sent',
    phoneLast4: '4567',
    phoneHash: HASH,
    ...over,
  };
}

function deps(
  over: Partial<CheckinDeps> = {},
  existing: StoredCheckin[] = [],
  optedOut: string[] = []
) {
  const added: CheckinRecord[] = [];
  const store: CheckinStore = {
    forUser: vi.fn(async (userId: string) => existing.filter((r) => r.userId === userId)),
    forPhoneHash: vi.fn(async (h: string) => existing.filter((r) => r.phoneHash === h)),
    add: vi.fn(async (r: CheckinRecord) => {
      added.push(r);
      return `new${added.length}`;
    }),
    ...atomicLocks(),
    sponsoredPhone: vi.fn(async (): Promise<string | undefined> => '+15559990000'),
    isOptedOut: vi.fn(async (h: string) => optedOut.includes(h)),
    consentDoc: async () => undefined,
    userDoc: vi.fn(async (): Promise<Record<string, unknown> | undefined> => undefined),
    legacySmsChannels: vi.fn(async (): Promise<unknown> => undefined),
  };
  const d: CheckinDeps = {
    env: ENV,
    resolveFlags: vi.fn(async () => ({ POST_CALL_CHECKIN: 'on' })),
    store,
    authPhone: vi.fn(async (): Promise<string | undefined> => '+15551234567'),
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => NOW,
    ...over,
  };
  return { d, added };
}

afterEach(() => vi.unstubAllEnvs());

describe('decideCheckin', () => {
  const base = {
    userId: 'uid-123',
    userTurns: 5,
    lastSentAt: null,
    phone: '+15551234567',
    now: NOW,
  };

  it('sends to a member after a real call with a known phone', () => {
    expect(decideCheckin(base)).toEqual({ send: true, phone: '+15551234567' });
  });

  it.each(['', '  ', 'anonymous', 'onbehalf:abc', 'anon:xyz'])(
    'skips calls that are not the member’s own (%j)',
    (userId) => {
      expect(decideCheckin({ ...base, userId })).toEqual({
        send: false,
        reason: 'not-member-call',
      });
    }
  );

  it('skips a call with fewer than 4 user turns, and sends at exactly 4', () => {
    expect(decideCheckin({ ...base, userTurns: 3 })).toEqual({ send: false, reason: 'short-call' });
    expect(decideCheckin({ ...base, userTurns: 4 }).send).toBe(true);
  });

  it('skips when a check-in went out within 20 hours, and sends after', () => {
    const recent = new Date(NOW.getTime() - 19 * HOUR);
    const old = new Date(NOW.getTime() - 21 * HOUR);
    expect(decideCheckin({ ...base, lastSentAt: recent })).toEqual({
      send: false,
      reason: 'recently-sent',
    });
    expect(decideCheckin({ ...base, lastSentAt: old }).send).toBe(true);
  });

  it('skips when no phone number is known', () => {
    expect(decideCheckin({ ...base, phone: undefined })).toEqual({
      send: false,
      reason: 'no-verified-phone',
    });
  });
});

describe('lastSentAt (rate-limit input)', () => {
  it('takes the latest sent check-in and ignores failed ones', () => {
    const r = [
      stored({ sentAt: ago(30) }),
      stored({ sentAt: ago(2), status: 'failed' }),
      stored({ sentAt: ago(10) }),
    ];
    expect(lastSentAt(r)?.toISOString()).toBe(ago(10));
    expect(lastSentAt([stored({ status: 'failed' })])).toBeNull();
  });
});

describe('resolveCheckinPhone', () => {
  it('takes the number from a phone: userId without any lookup', async () => {
    const { d } = deps();
    expect(await resolveCheckinPhone('phone:+15550001111', undefined, d)).toBe('+15550001111');
    expect(d.authPhone).not.toHaveBeenCalled();
    expect(d.store.sponsoredPhone).not.toHaveBeenCalled();
  });

  it('never looks up a malformed phone: id as a Firebase uid', async () => {
    const { d } = deps();
    expect(await resolveCheckinPhone('phone:5550001111', undefined, d)).toBeUndefined();
    expect(d.authPhone).not.toHaveBeenCalled();
  });

  it('reads sponsored_identities for a sponsored_ userId, as E.164', async () => {
    const { d } = deps();
    d.store.sponsoredPhone = vi.fn(async () => '(555) 999-0000');
    expect(await resolveCheckinPhone('sponsored_42', undefined, d)).toBe('+15559990000');
    expect(d.store.sponsoredPhone).toHaveBeenCalledWith('sponsored_42');
    expect(d.authPhone).not.toHaveBeenCalled();
  });

  it('refuses a sponsored number that is not a usable phone', async () => {
    const { d } = deps();
    d.store.sponsoredPhone = vi.fn(async () => '442079460958');
    expect(await resolveCheckinPhone('sponsored_42', undefined, d)).toBeUndefined();
  });

  it('prefers a verified phone linked to the account', async () => {
    const { d } = deps();
    const doc = { linkedIdentifiers: ['email:a@b.c', 'phone:+15550002222'] };
    expect(await resolveCheckinPhone('uid-123', doc, d)).toBe('+15550002222');
    expect(d.authPhone).not.toHaveBeenCalled();
  });

  it('falls back to the Firebase Auth phone, never profile contact info', async () => {
    const { d } = deps({ authPhone: vi.fn(async () => undefined) });
    const doc = { contactInfo: { phone: '+15559998888' }, linkedIdentifiers: [] };
    expect(await resolveCheckinPhone('uid-123', doc, d)).toBeUndefined();
    expect(d.authPhone).toHaveBeenCalledWith('uid-123');
  });
});

describe('runAfterCallCheckin', () => {
  it('texts the question once and records it as sent', async () => {
    const { d, added } = deps();
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: true });
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+15551234567', body: CHECKIN_QUESTION, personaId: 'ferni' })
    );
    expect(added).toEqual([
      expect.objectContaining({
        userId: 'uid-123',
        sessionId: 's1',
        sentAt: NOW.toISOString(),
        question: CHECKIN_QUESTION,
        status: 'sent',
        phoneLast4: '4567',
      }),
    ]);
    expect(JSON.stringify(added)).not.toContain('5551234567');
  });

  it('texts the E.164 number and stores the hash a reply from Twilio will carry', async () => {
    const { d, added } = deps();
    d.store.sponsoredPhone = vi.fn(async () => '1 (555) 123-4567');
    expect(await runAfterCallCheckin(ctx({ userId: 'sponsored_42' }), d)).toEqual({ sent: true });
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ to: '+15551234567' }));
    // Twilio's From is always E.164.
    expect(added[0]?.phoneHash).toBe(phoneHash('+15551234567', ENV));
  });

  it('does nothing and reads nothing when COHORT_FLAGS is unset', async () => {
    const { d, added } = deps({ env: {} });
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'gate-off' });
    expect(d.resolveFlags).not.toHaveBeenCalled();
    expect(d.store.forUser).not.toHaveBeenCalled();
    expect(d.authPhone).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(added).toEqual([]);
  });

  it('never reads POST_CALL_CHECKIN from env: env on, store off → no text', async () => {
    const { d } = deps({
      env: { COHORT_FLAGS: 'on', POST_CALL_CHECKIN: 'on' },
      resolveFlags: vi.fn(async () => ({ POST_CALL_CHECKIN: 'off' })),
    });
    vi.stubEnv('POST_CALL_CHECKIN', 'on');
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'flag-off' });
    expect(d.resolveFlags).toHaveBeenCalledWith('uid-123');
    expect(d.send).not.toHaveBeenCalled();
  });

  it('skips when this person got a check-in 19 hours ago', async () => {
    const { d } = deps({}, [stored({ sentAt: ago(19) })]);
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'recently-sent' });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('does not let another person’s recent check-in block this one', async () => {
    const other = stored({ userId: 'someone-else', phoneHash: 'other-phone', sentAt: ago(1) });
    const { d } = deps({}, [other]);
    expect((await runAfterCallCheckin(ctx(), d)).sent).toBe(true);
  });

  it('rate-limits per phone too, when another account texted that number recently', async () => {
    const { d } = deps({}, [stored({ userId: 'someone-else', sentAt: ago(19) })]);
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'recently-sent' });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('skips with no-verified-phone when the account has none', async () => {
    const { d, added } = deps({ authPhone: vi.fn(async () => undefined) });
    d.store.userDoc = vi.fn(async () => ({ contactInfo: { phone: '+15559998888' } }));
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({
      sent: false,
      reason: 'no-verified-phone',
    });
    expect(d.send).not.toHaveBeenCalled();
    expect(added).toEqual([]);
  });

  it('skips with sms-off when the member turned texts off', async () => {
    const { d } = deps();
    d.store.userDoc = vi.fn(async () => ({ outreachPreferences: { channels: ['email'] } }));
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'sms-off' });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('skips third-party calls before reading anything', async () => {
    const { d } = deps();
    expect(await runAfterCallCheckin(ctx({ userId: 'onbehalf:abc' }), d)).toEqual({
      sent: false,
      reason: 'not-member-call',
    });
    expect(d.resolveFlags).not.toHaveBeenCalled();
  });

  it('never stores or sends the number of a phone: caller, and still rate-limits them', async () => {
    const { d, added } = deps();
    expect(await runAfterCallCheckin(ctx({ userId: 'phone:+15551234567' }), d)).toEqual({
      sent: true,
    });
    const hashedId = recordUserId('phone:+15551234567', ENV);
    expect(hashedId).toBe(`phone#${HASH}`);
    expect(added[0]?.userId).toBe(hashedId);
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ userId: hashedId }));
    expect(JSON.stringify(added)).not.toContain('5551234567');

    const again = deps({}, [stored({ userId: hashedId ?? '', phoneHash: 'x', sentAt: ago(2) })]);
    expect(await runAfterCallCheckin(ctx({ userId: 'phone:+15551234567' }), again.d)).toEqual({
      sent: false,
      reason: 'recently-sent',
    });
  });

  it('gives malformed phone: ids no shared record bucket, and reads nothing for them', async () => {
    expect(recordUserId('phone:not-a-number', ENV)).toBeNull();
    const { d } = deps();
    expect(await runAfterCallCheckin(ctx({ userId: 'phone:442079460958' }), d)).toEqual({
      sent: false,
      reason: 'no-verified-phone',
    });
    expect(d.store.forUser).not.toHaveBeenCalled();
  });

  it('sends nothing and reads nothing without LOG_HASH_SECRET', async () => {
    const { d, added } = deps({ env: { COHORT_FLAGS: 'on' } });
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'no-hash-secret' });
    expect(d.store.forUser).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
    expect(added).toEqual([]);
  });

  it('skips a phone that opted out, before sending or recording', async () => {
    const { d, added } = deps({}, [], [HASH]);
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'opted-out' });
    expect(d.store.isOptedOut).toHaveBeenCalledWith(HASH);
    expect(d.send).not.toHaveBeenCalled();
    expect(added).toEqual([]);
  });

  it('records a failed send as failed', async () => {
    const { d, added } = deps({
      send: vi.fn(async () => ({ success: false, error: 'SMS delivery not initialized' })),
    });
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'send-failed' });
    expect(added).toEqual([expect.objectContaining({ status: 'failed' })]);
  });
});

describe('smsTurnedOff', () => {
  it('is true only for an explicit off', () => {
    expect(smsTurnedOff(undefined, undefined)).toBe(false);
    expect(smsTurnedOff({ outreachPreferences: {} }, ['email', 'sms'])).toBe(false);
    expect(smsTurnedOff({ outreachPreferences: { channels: ['sms'] } }, undefined)).toBe(false);
    expect(smsTurnedOff({ outreachPreferences: { enabled: false } }, undefined)).toBe(true);
    expect(smsTurnedOff({ outreachPreferences: { channels: ['push'] } }, undefined)).toBe(true);
    expect(smsTurnedOff(undefined, ['email'])).toBe(true);
  });
});

describe('redactNumbers', () => {
  it('removes a number quoted in a Twilio error but keeps the error code', () => {
    const out = redactNumbers(
      "21211: The 'To' number +1 (555) 123-4567 is not a valid phone number."
    );
    expect(out).toBe("21211: The 'To' number [number] is not a valid phone number.");
    expect(redactNumbers(undefined)).toBeUndefined();
  });
});
