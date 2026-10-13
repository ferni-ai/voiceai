import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import {
  firestoreReplyStore,
  isOptOut,
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

describe('isOptOut', () => {
  it.each([
    'STOP',
    'stop.',
    'Unsubscribe',
    'please cancel',
    'stop please',
    'STOP STOP',
    'END',
    'quit',
    'StopAll',
    'Stop texting me',
    "please don't text me again",
    'no more texts thanks',
    'I want to unsubscribe from these, they are a bit much',
  ])('treats %j as an opt-out', (body) => expect(isOptOut(body)).toBe(true));

  it.each([
    'that was unstoppable',
    'felt real',
    'endless fun',
    'stopped by later',
    'in the end it felt real',
    'please cancel my dentist thing tomorrow',
    'it felt like you really knew me',
  ])('does not treat %j as an opt-out', (body) => expect(isOptOut(body)).toBe(false));

  it('reads an iOS curly apostrophe like a straight one', () => {
    expect(isOptOut('please don’t text me again')).toBe(true);
    expect(isOptOut('don‘t text me')).toBe(true);
  });
});

describe('opt-outs from replies', () => {
  it('records a STOP from a phone that never got a check-in', async () => {
    const { d, replies, optOuts } = deps({}, [stored({ sentAt: ago(100) })]);
    expect(await recordCheckinReply('+15551234567', 'STOP', undefined, d)).toBeNull();
    expect(optOuts).toEqual([{ hash: HASH, via: 'reply' }]);
    expect(replies).toEqual([]);
  });

  it('a STOP from a 10-digit international number never opts out the US look-alike', async () => {
    const { d, optOuts } = deps();
    await recordCheckinReply('+4930123456', 'STOP', undefined, d);
    expect(optOuts).toHaveLength(1);
    expect(optOuts[0]?.hash).not.toBe(phoneHash('+14930123456', ENV));
  });

  it('ignores a STOP from a number it cannot normalize', async () => {
    const { d, optOuts } = deps();
    expect(await recordCheckinReply('442079460958', 'STOP', undefined, d)).toBeNull();
    expect(optOuts).toEqual([]);
  });

  it('records the opt-out even when saving the reply fails', async () => {
    const { d, optOuts } = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    d.store.addReply = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await recordCheckinReply('+15551234567', 'stop', undefined, d)).toBeNull();
    expect(optOuts).toEqual([{ hash: HASH, via: 'reply' }]);
  });

  it('still saves the reply when the opt-out write fails', async () => {
    const { d, replies } = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    d.store.addOptOut = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await recordCheckinReply('+15551234567', 'STOP', undefined, d)).toBe('c9');
    expect(replies).toEqual([{ id: 'c9', body: 'STOP' }]);
  });

  it('does not record "unstoppable" as an opt-out', async () => {
    const { d, replies, optOuts } = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    expect(await recordCheckinReply('+15551234567', 'honestly unstoppable', undefined, d)).toBe(
      'c9'
    );
    expect(optOuts).toEqual([]);
    expect(replies).toHaveLength(1);
  });

  it('START lifts an opt-out, and an ordinary reply leaves it alone', async () => {
    const { d, optOuts } = deps({}, [stored({ id: 'c9', sentAt: ago(3) })]);
    await recordCheckinReply('+15551234567', 'in the end it felt real', undefined, d);
    expect(optOuts).toEqual([]);
    await recordCheckinReply('+15551234567', 'Start', undefined, d);
    expect(optOuts).toEqual([{ hash: HASH, via: 'removed' }]);
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
