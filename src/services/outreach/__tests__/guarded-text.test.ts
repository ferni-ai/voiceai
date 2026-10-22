import { describe, expect, it, vi } from 'vitest';
import { atomicLocks } from './atomic-locks.js';
import {
  lastSentAt,
  sendGuardedText,
  type GuardedText,
  type TextDeps,
  type TextStore,
} from '../guarded-text.js';
import { phoneHash, type CheckinRecord, type StoredCheckin } from '../checkin-replies.js';

const NOW = new Date('2026-10-12T16:00:00Z');
const HOUR = 3_600_000;
const ENV = { LOG_HASH_SECRET: 'test-secret' };
const PHONE = '+15551234567';
const ago = (h: number): string => new Date(NOW.getTime() - h * HOUR).toISOString();

function record(over: Partial<StoredCheckin> = {}): StoredCheckin {
  return {
    id: 'r1',
    userId: 'u1',
    sessionId: 's0',
    sentAt: ago(1),
    question: 'q',
    status: 'sent',
    phoneLast4: '4567',
    phoneHash: phoneHash(PHONE, ENV) ?? '',
    ...over,
  };
}

function deps(existing: StoredCheckin[] = [], opts: { optedOut?: boolean } = {}) {
  const added: CheckinRecord[] = [];
  const store: TextStore = {
    forUser: vi.fn(async (u: string) => existing.filter((r) => r.userId === u)),
    forPhoneHash: vi.fn(async (h: string) => existing.filter((r) => r.phoneHash === h)),
    add: vi.fn(async (r: CheckinRecord) => {
      added.push(r);
      return 'new';
    }),
    ...atomicLocks(),
    sponsoredPhone: vi.fn(async () => undefined),
    isOptedOut: vi.fn(async () => opts.optedOut === true),
    consentDoc: async () => undefined,
    userDoc: vi.fn(async () => undefined),
    legacySmsChannels: vi.fn(async () => undefined),
    addReply: vi.fn(async () => undefined),
    optOut: vi.fn(async () => undefined),
    optIn: vi.fn(async () => undefined),
  } as unknown as TextStore;
  const d: TextDeps = {
    env: ENV,
    store,
    authPhone: vi.fn(async () => PHONE),
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => NOW,
  };
  return { d, added };
}

const followUp = (over: Partial<GuardedText> = {}): GuardedText => ({
  userId: 'u1',
  body: 'It’s noon. You wanted to call your mom.',
  kind: 'follow-up',
  refId: 'f1',
  minGapMs: HOUR,
  ...over,
});

describe('sendGuardedText', () => {
  it('sends to their verified phone and records the kind and what it was about', async () => {
    const { d, added } = deps();
    expect(await sendGuardedText(followUp(), d)).toEqual({ sent: true });
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: PHONE, outreachId: 'follow-up_f1' })
    );
    expect(added[0]).toMatchObject({
      kind: 'follow-up',
      refId: 'f1',
      status: 'sent',
      phoneLast4: '4567',
    });
    expect(JSON.stringify(added[0])).not.toContain(PHONE);
  });

  it('a check-in sent an hour ago does not block a follow-up (each kind has its own gap)', async () => {
    const { d } = deps([record({ sentAt: ago(1) })]);
    expect(await sendGuardedText(followUp(), d)).toEqual({ sent: true });
  });

  it('but a second follow-up within its gap is held, per person and per phone', async () => {
    const { d } = deps([record({ kind: 'follow-up', sentAt: ago(0.5) })]);
    expect(await sendGuardedText(followUp(), d)).toEqual({ sent: false, reason: 'recently-sent' });
    const other = deps([record({ userId: 'someone-else', kind: 'follow-up', sentAt: ago(0.5) })]);
    expect(await sendGuardedText(followUp(), other.d)).toEqual({
      sent: false,
      reason: 'recently-sent',
    });
  });

  it('two sends at once (both past the gap check) text once: the lock decides', async () => {
    const { d, added } = deps();
    const both = await Promise.all([
      sendGuardedText(followUp(), d),
      sendGuardedText(followUp({ refId: 'f2' }), d),
    ]);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(both).toContainEqual({ sent: false, reason: 'recently-sent' });
    expect(added.map((r) => r.status)).toEqual(['sent']);
  });

  it('a failed send drops its locks, so a retry may go', async () => {
    const { d, added } = deps();
    d.send = vi.fn(async () => ({ success: false, error: 'down' }));
    expect(await sendGuardedText(followUp(), d)).toEqual({ sent: false, reason: 'send-failed' });
    d.send = vi.fn(async () => ({ success: true }));
    expect(await sendGuardedText(followUp(), d)).toEqual({ sent: true });
    expect(added.map((r) => r.status)).toEqual(['failed', 'sent']);
  });

  it('never texts a phone that sent STOP', async () => {
    const { d } = deps([], { optedOut: true });
    expect(await sendGuardedText(followUp(), d)).toEqual({ sent: false, reason: 'opted-out' });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('never texts without the hash secret, so no number is ever stored in the clear', async () => {
    const { d } = deps();
    expect(await sendGuardedText(followUp(), { ...d, env: {} })).toEqual({
      sent: false,
      reason: 'no-hash-secret',
    });
    expect(d.send).not.toHaveBeenCalled();
  });
});

describe('lastSentAt', () => {
  it('counts records from before kinds existed as check-ins', () => {
    const old = record({ sentAt: ago(2) });
    expect(lastSentAt([old], 'checkin')?.toISOString()).toBe(ago(2));
    expect(lastSentAt([old], 'follow-up')).toBeNull();
  });
});
