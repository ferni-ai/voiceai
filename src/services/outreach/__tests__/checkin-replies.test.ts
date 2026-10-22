import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import {
  firestoreReplyStore,
  matchCheckin,
  phoneHash,
  recordCheckinReply,
  toE164,
  type ReplyDeps,
  type ReplyStore,
  type StoredCheckin,
} from '../checkin-replies.js';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: vi.fn(() => null) }));

const NOW = new Date('2026-10-11T18:00:00Z');
const HOUR = 60 * 60 * 1000;
const ago = (h: number): string => new Date(NOW.getTime() - h * HOUR).toISOString();
const ENV = { LOG_HASH_SECRET: 'test-secret' };
const HASH = phoneHash('+15551234567', ENV) ?? '';

function stored(over: Partial<StoredCheckin> = {}): StoredCheckin {
  return {
    id: 'c1',
    userId: 'uid-123',
    sessionId: 's0',
    sentAt: ago(1),
    question: 'q',
    status: 'sent',
    phoneLast4: '4567',
    phoneHash: HASH,
    ...over,
  };
}

function deps(over: Partial<ReplyDeps> = {}, existing: StoredCheckin[] = []) {
  const optOuts: Array<{ hash: string; via: string }> = [];
  const replies: Array<{ id: string; body: string }> = [];
  const replyIds: Array<string | undefined> = [];
  const store: ReplyStore = {
    forPhoneHash: vi.fn(async (h: string) => existing.filter((r) => r.phoneHash === h)),
    addReply: vi.fn(async (id: string, replyId: string | undefined, reply: { body: string }) => {
      replies.push({ id, body: reply.body });
      replyIds.push(replyId);
    }),
    isOptedOut: vi.fn(async () => false),
    addOptOut: vi.fn(async (hash: string, o: { via: string }) => {
      optOuts.push({ hash, via: o.via });
    }),
    removeOptOut: vi.fn(async (hash: string) => {
      optOuts.push({ hash, via: 'removed' });
    }),
  };
  const d: ReplyDeps = { store, now: () => NOW, env: ENV, ...over };
  return { d, optOuts, replies, replyIds };
}

describe('toE164 (the one phone normalizer)', () => {
  it.each(['+15551234567', '5551234567', '15551234567', '(555) 123-4567', '+1 (555) 123-4567'])(
    'reads %j as +15551234567, and hashes it the same',
    (raw) => {
      expect(toE164(raw)).toBe('+15551234567');
      expect(phoneHash(raw, ENV)).toBe(HASH);
    }
  );

  it('keeps a 10-digit international number international, not American', () => {
    expect(toE164('+4930123456')).toBe('+4930123456');
    expect(phoneHash('+4930123456', ENV)).not.toBe(phoneHash('+14930123456', ENV));
  });

  it.each([
    '442079460958', // non-US without +: ambiguous, so refused
    '22345678901', // 11 digits not starting with 1
    '0044 20 7946 0958',
    '555-123-4567 x12',
    '+1 555 123 4567 ext 2',
    '+0123456789',
    '+1555',
    '+1234567890123456',
    'call me',
    '',
  ])('refuses %j, so it gets no hash', (raw) => {
    expect(toE164(raw)).toBeNull();
    expect(phoneHash(raw, ENV)).toBeNull();
  });
});

describe('phoneHash', () => {
  it('is keyed: two secrets give two hashes, neither is the plain sha256', () => {
    const a = phoneHash('+15551234567', { LOG_HASH_SECRET: 'one' });
    const b = phoneHash('+15551234567', { LOG_HASH_SECRET: 'two' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).not.toBe(createHash('sha256').update('15551234567').digest('hex'));
    expect(a).not.toBe(createHash('sha256').update('+15551234567').digest('hex'));
  });

  it('is null without LOG_HASH_SECRET', () => {
    expect(phoneHash('+15551234567', {})).toBeNull();
    expect(phoneHash('+15551234567', { LOG_HASH_SECRET: '' })).toBeNull();
  });
});

describe('opt-outs are not written here (messaging/consent.ts is the one writer)', () => {
  it('a STOP or START that answers a check-in is kept as its reply, and touches no opt-out', async () => {
    const { d, replies, optOuts } = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    expect(await recordCheckinReply('+15551234567', 'STOP', undefined, d)).toBe('c9');
    expect(await recordCheckinReply('+15551234567', 'START', undefined, d)).toBe('c9');
    expect(replies).toEqual([
      { id: 'c9', body: 'STOP' },
      { id: 'c9', body: 'START' },
    ]);
    expect(optOuts).toEqual([]);
  });
});

describe('replies', () => {
  it('match only when the sending and receiving sides share the secret', async () => {
    const same = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    expect(await recordCheckinReply('+15551234567', 'ok', undefined, same.d)).toBe('c9');
    const other = deps({ env: { LOG_HASH_SECRET: 'rotated' } }, [stored({ id: 'c9' })]);
    expect(await recordCheckinReply('+15551234567', 'ok', undefined, other.d)).toBeNull();
    const none = deps({ env: {} }, [stored({ id: 'c9' })]);
    expect(await recordCheckinReply('+15551234567', 'STOP', undefined, none.d)).toBeNull();
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
    expect(matchCheckin([stored({ kind: 'on-behalf' })], NOW)).toBeNull();
  });

  it('stores a reply under the matching check-in, whatever the number format', async () => {
    const { d, replies } = deps({}, [stored({ id: 'c9', sentAt: ago(30) })]);
    expect(await recordCheckinReply('(555) 123-4567', 'felt good', undefined, d)).toBe('c9');
    expect(replies).toEqual([{ id: 'c9', body: 'felt good' }]);
  });

  it('keys a reply by a valid MessageSid, and by an auto id otherwise', async () => {
    const { d, replyIds } = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    await recordCheckinReply('+15551234567', 'ok', 'SM0123456789abcdef', d);
    await recordCheckinReply('+15551234567', 'ok', 'SM../../x', d);
    await recordCheckinReply('+15551234567', 'ok', 'SMshort', d);
    expect(replyIds).toEqual(['SM0123456789abcdef', undefined, undefined]);
  });

  it('stores a replayed MessageSid once: ALREADY_EXISTS counts as saved', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 6 }))
      .mockRejectedValueOnce(Object.assign(new Error('down'), { code: 14 }));
    const doc = vi.fn(() => ({ create }));
    const fakeDb = { collection: () => ({ doc: () => ({ collection: () => ({ doc }) }) }) };
    vi.mocked(getFirestoreDb).mockReturnValue(
      fakeDb as unknown as ReturnType<typeof getFirestoreDb>
    );
    const reply = { body: 'ok', receivedAt: NOW.toISOString() };
    await firestoreReplyStore.addReply('c9', 'SM0123456789abcdef', reply);
    await firestoreReplyStore.addReply('c9', 'SM0123456789abcdef', reply);
    await expect(firestoreReplyStore.addReply('c9', 'SM0123456789abcdef', reply)).rejects.toThrow(
      'down'
    );
    expect(doc).toHaveBeenCalledWith('SM0123456789abcdef');
    vi.mocked(getFirestoreDb).mockReturnValue(null);
  });

  it('ignores a reply from a phone with no recent check-in', async () => {
    const { d, replies } = deps({}, [stored({ sentAt: ago(1) })]);
    expect(await recordCheckinReply('+15550000000', 'hello', undefined, d)).toBeNull();
    expect(replies).toEqual([]);
  });

  it('never throws when the store fails', async () => {
    const { d } = deps();
    d.store.forPhoneHash = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await recordCheckinReply('+15551234567', 'x', undefined, d)).toBeNull();
  });
});
