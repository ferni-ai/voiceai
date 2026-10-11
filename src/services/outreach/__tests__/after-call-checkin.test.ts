import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKIN_QUESTION,
  decideCheckin,
  isOptOut,
  lastSentAt,
  matchCheckin,
  phoneHash,
  recordCheckinReply,
  recordUserId,
  redactNumbers,
  resolveCheckinPhone,
  runAfterCallCheckin,
  type CheckinDeps,
  type CheckinRecord,
  type CheckinStore,
  type StoredCheckin,
} from '../after-call-checkin.js';
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

function makeStore(existing: StoredCheckin[] = [], optedOut: string[] = []) {
  const added: CheckinRecord[] = [];
  const optOuts: Array<{ hash: string; via: string }> = [];
  const replies: Array<{ id: string; body: string }> = [];
  const store: CheckinStore = {
    forUser: vi.fn(async (userId: string) => existing.filter((r) => r.userId === userId)),
    forPhoneHash: vi.fn(async (h: string) => existing.filter((r) => r.phoneHash === h)),
    add: vi.fn(async (r: CheckinRecord) => {
      added.push(r);
      return `new${added.length}`;
    }),
    addReply: vi.fn(async (id: string, reply: { body: string }) => {
      replies.push({ id, body: reply.body });
    }),
    sponsoredPhone: vi.fn(async () => '+15559990000'),
    isOptedOut: vi.fn(async (h: string) => optedOut.includes(h)),
    addOptOut: vi.fn(async (hash: string, o: { via: string }) => {
      optOuts.push({ hash, via: o.via });
    }),
  };
  return { store, added, replies, optOuts };
}

function deps(
  over: Partial<CheckinDeps> = {},
  existing: StoredCheckin[] = [],
  optedOut: string[] = []
) {
  const s = makeStore(existing, optedOut);
  const d: CheckinDeps = {
    env: ENV,
    resolveFlags: vi.fn(async () => ({ POST_CALL_CHECKIN: 'on' })),
    store: s.store,
    contactPhone: vi.fn(async () => '+15551234567'),
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => NOW,
    ...over,
  };
  return { d, ...s };
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
      reason: 'no-phone',
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
    expect(await resolveCheckinPhone('phone:+15550001111', d)).toBe('+15550001111');
    expect(d.contactPhone).not.toHaveBeenCalled();
    expect(d.store.sponsoredPhone).not.toHaveBeenCalled();
  });

  it('reads sponsored_identities for a sponsored_ userId', async () => {
    const { d } = deps();
    expect(await resolveCheckinPhone('sponsored_42', d)).toBe('+15559990000');
    expect(d.store.sponsoredPhone).toHaveBeenCalledWith('sponsored_42');
    expect(d.contactPhone).not.toHaveBeenCalled();
  });

  it('uses the profile contact info for any other userId', async () => {
    const { d } = deps();
    expect(await resolveCheckinPhone('uid-123', d)).toBe('+15551234567');
    expect(d.contactPhone).toHaveBeenCalledWith('uid-123');
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

  it('does nothing and reads nothing when COHORT_FLAGS is unset', async () => {
    const { d, added } = deps({ env: {} });
    expect(await runAfterCallCheckin(ctx(), d)).toEqual({ sent: false, reason: 'gate-off' });
    expect(d.resolveFlags).not.toHaveBeenCalled();
    expect(d.store.forUser).not.toHaveBeenCalled();
    expect(d.contactPhone).not.toHaveBeenCalled();
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
    const { d } = deps({}, [stored({ userId: 'someone-else', sentAt: ago(1) })]);
    expect((await runAfterCallCheckin(ctx(), d)).sent).toBe(true);
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

    const again = deps({}, [stored({ userId: hashedId, sentAt: ago(2) })]);
    expect(await runAfterCallCheckin(ctx({ userId: 'phone:+15551234567' }), again.d)).toEqual({
      sent: false,
      reason: 'recently-sent',
    });
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

describe('phoneHash', () => {
  it('is keyed: two secrets give two hashes, neither is the plain sha256', () => {
    const a = phoneHash('+15551234567', { LOG_HASH_SECRET: 'one' });
    const b = phoneHash('+15551234567', { LOG_HASH_SECRET: 'two' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).toBe(phoneHash('(555) 123-4567', { LOG_HASH_SECRET: 'one' }));
    expect(a).not.toBe(createHash('sha256').update('15551234567').digest('hex'));
    expect(a).not.toBe(createHash('sha256').update('+15551234567').digest('hex'));
  });

  it('is null without LOG_HASH_SECRET', () => {
    expect(phoneHash('+15551234567', {})).toBeNull();
    expect(phoneHash('+15551234567', { LOG_HASH_SECRET: '' })).toBeNull();
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

describe('opt-outs', () => {
  it.each([
    'STOP',
    'stop.',
    'Unsubscribe',
    'please cancel',
    'END',
    'quit',
    'StopAll',
    'Stop texting me',
  ])('treats %j as an opt-out', (body) => expect(isOptOut(body)).toBe(true));

  it.each(['that was unstoppable', 'felt real', 'endless fun', 'stopped by later'])(
    'does not treat %j as an opt-out',
    (body) => expect(isOptOut(body)).toBe(false)
  );

  it('records an opt-out reply under that phone hash, and keeps the reply', async () => {
    const { d, replies, optOuts } = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    expect(await recordCheckinReply('+15551234567', 'STOP', d)).toBe('c9');
    expect(optOuts).toEqual([{ hash: HASH, via: 'reply' }]);
    expect(replies).toEqual([{ id: 'c9', body: 'STOP' }]);
  });

  it('does not record "unstoppable" as an opt-out', async () => {
    const { d, replies, optOuts } = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    expect(await recordCheckinReply('+15551234567', 'honestly unstoppable', d)).toBe('c9');
    expect(optOuts).toEqual([]);
    expect(replies).toHaveLength(1);
  });
});

describe('replies', () => {
  it('match only when the sending and receiving sides share the secret', async () => {
    const same = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    expect(await recordCheckinReply('+15551234567', 'ok', same.d)).toBe('c9');
    const other = deps({ env: { LOG_HASH_SECRET: 'rotated' } }, [stored({ id: 'c9' })]);
    expect(await recordCheckinReply('+15551234567', 'ok', other.d)).toBeNull();
    const none = deps({ env: {} }, [stored({ id: 'c9' })]);
    expect(await recordCheckinReply('+15551234567', 'STOP', none.d)).toBeNull();
    expect(none.optOuts).toEqual([]);
  });

  it('matches the latest check-in sent to that phone within 72 hours', () => {
    const r = [
      stored({ id: 'old', sentAt: ago(80) }),
      stored({ id: 'a', sentAt: ago(50) }),
      stored({ id: 'b', sentAt: ago(5) }),
    ];
    expect(matchCheckin(r, NOW)?.id).toBe('b');
    expect(matchCheckin([stored({ id: 'old', sentAt: ago(73) })], NOW)).toBeNull();
    expect(matchCheckin([stored({ status: 'failed' })], NOW)).toBeNull();
  });

  it('stores a reply under the matching check-in, whatever the number format', async () => {
    const { d, replies } = deps({}, [stored({ id: 'c9', sentAt: ago(30) })]);
    expect(await recordCheckinReply('(555) 123-4567', 'felt good', d)).toBe('c9');
    expect(replies).toEqual([{ id: 'c9', body: 'felt good' }]);
  });

  it('ignores a reply from a phone with no recent check-in', async () => {
    const { d, replies } = deps({}, [stored({ sentAt: ago(1) })]);
    expect(await recordCheckinReply('+15550000000', 'hello', d)).toBeNull();
    expect(replies).toEqual([]);
  });

  it('never throws when the store fails', async () => {
    const { d } = deps();
    d.store.forPhoneHash = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await recordCheckinReply('+15551234567', 'x', d)).toBeNull();
  });
});
