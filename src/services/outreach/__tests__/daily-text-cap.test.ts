/**
 * The interim daily text cap (DAILY_TEXT_CAP) inside sendGuardedText: three
 * texts Ferni starts per member per rolling 24 h, across kinds; the next is
 * held (queued for when a slot frees), never sent and never silently lost.
 * Texts the member asked for don't count. An unreadable count fails closed.
 */
import { describe, expect, it, vi } from 'vitest';
import { flagOn } from '../../../config/env-flag.js';
import { atomicLocks } from './atomic-locks.js';
import { DAILY_TEXT_CAP, DAILY_TEXT_WINDOW_MS } from '../../messaging/types.js';
import {
  sendGuardedText,
  type GuardedText,
  type TextDeps,
  type TextStore,
} from '../guarded-text.js';
import type { CheckinRecord, StoredCheckin } from '../checkin-replies.js';

const NOON = new Date('2026-10-18T16:00:00Z');
const PHONE = '+15551234567';

function deps(cap: 'on' | 'off', opts: { unreadable?: boolean; prior?: StoredCheckin[] } = {}) {
  const records: StoredCheckin[] = [...(opts.prior ?? [])];
  let clock = NOON.getTime();
  const store = {
    forUser: vi.fn(async (u: string) => {
      if (opts.unreadable) throw new Error('firestore down');
      return records.filter((r) => r.userId === u);
    }),
    forPhoneHash: vi.fn(async () => []),
    add: vi.fn(async (r: CheckinRecord) => {
      records.push({ ...r, id: `r${records.length}` });
      return 'id';
    }),
    ...atomicLocks(),
    sponsoredPhone: vi.fn(async () => undefined),
    isOptedOut: vi.fn(async () => false),
    userDoc: vi.fn(async () => undefined),
    legacySmsChannels: vi.fn(async () => undefined),
  } as unknown as TextStore;
  const d: TextDeps = {
    env: { LOG_HASH_SECRET: 'test-secret', DAILY_TEXT_CAP: cap },
    store,
    authPhone: vi.fn(async () => PHONE),
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => new Date((clock += 60_000)), // a minute apart, past every per-kind gap of 1 ms
    hold: vi.fn(async () => undefined),
  };
  return { d, records };
}

const text = (
  kind: GuardedText['kind'],
  n: number,
  over: Partial<GuardedText> = {}
): GuardedText => ({
  userId: 'u1',
  body: `text ${n}`,
  kind,
  refId: `${kind}-${n}`,
  minGapMs: 1,
  ...over,
});
const three = ['checkin', 'follow-up', 'morning-brief'] as const;

describe('DAILY_TEXT_CAP on', () => {
  it('three texts go out across kinds; the fourth is held until the first ages out', async () => {
    expect(DAILY_TEXT_CAP).toBe(3);
    const { d, records } = deps('on');
    for (const [i, kind] of three.entries()) {
      expect(await sendGuardedText(text(kind, i), d)).toEqual({ sent: true });
    }
    const fourth = await sendGuardedText(text('reminder', 4), d);
    const until = new Date(Date.parse(records[0].sentAt) + DAILY_TEXT_WINDOW_MS);
    expect(fourth).toEqual({ sent: false, reason: 'held', until });
    expect(d.send).toHaveBeenCalledTimes(3);
    expect(d.hold).toHaveBeenCalledWith(
      expect.objectContaining({ refId: 'reminder-4' }),
      until,
      'daily-cap'
    );
  });

  it('a text they asked for still goes, and is not counted', async () => {
    const { d, records } = deps('on');
    for (const [i, kind] of three.entries()) await sendGuardedText(text(kind, i), d);
    const reply = await sendGuardedText(text('message', 9, { requested: true }), d);
    expect(reply).toEqual({ sent: true });
    expect(records.at(-1)).toMatchObject({ refId: 'message-9', capExempt: true });
    // Still three counted: the next proactive text waits for the first, not the reply.
    const next = await sendGuardedText(text('checkin', 10), d);
    expect(next).toMatchObject({
      reason: 'held',
      until: new Date(Date.parse(records[0].sentAt) + DAILY_TEXT_WINDOW_MS),
    });
  });

  it('texts to someone else and old texts outside the window do not count', async () => {
    const old = new Date(NOON.getTime() - DAILY_TEXT_WINDOW_MS - 1).toISOString();
    const rec = (i: number, kind: 'on-behalf' | 'checkin', sentAt: string): StoredCheckin => ({
      id: `p${i}`,
      userId: 'u1',
      sessionId: 's',
      question: 'q',
      status: 'sent',
      phoneLast4: '4567',
      phoneHash: 'h',
      sentAt,
      kind,
    });
    const prior = [0, 1, 2].flatMap((i) => [
      rec(i, 'on-behalf', NOON.toISOString()),
      rec(i + 3, 'checkin', old),
    ]);
    const { d } = deps('on', { prior });
    expect(await sendGuardedText(text('follow-up', 1), d)).toEqual({ sent: true });
  });

  it('a caller that holds texts itself gets "held" back and nothing is queued', async () => {
    const { d } = deps('on');
    for (const [i, kind] of three.entries()) await sendGuardedText(text(kind, i), d);
    const out = await sendGuardedText(text('reminder', 4, { onHold: 'return' }), d);
    expect(out).toMatchObject({ sent: false, reason: 'held' });
    expect(d.hold).not.toHaveBeenCalled();
  });

  it('fails closed: an unreadable count holds the text and retries, never sends', async () => {
    const { d } = deps('on', { unreadable: true });
    const out = await sendGuardedText(text('checkin', 1), d);
    expect(out).toMatchObject({ sent: false, reason: 'held' });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.hold).toHaveBeenCalledWith(expect.anything(), expect.any(Date), 'count-unreadable');
  });
});

describe('DAILY_TEXT_CAP off (the default)', () => {
  it('is off unless set', () => {
    expect(flagOn('DAILY_TEXT_CAP', {})).toBe(false);
  });

  it('the fourth text goes out, nothing is held', async () => {
    const { d } = deps('off');
    for (const [i, kind] of three.entries()) await sendGuardedText(text(kind, i), d);
    expect(await sendGuardedText(text('reminder', 4), d)).toEqual({ sent: true });
    expect(d.send).toHaveBeenCalledTimes(4);
    expect(d.hold).not.toHaveBeenCalled();
  });

  it('an unreadable record store still throws as before', async () => {
    const { d } = deps('off', { unreadable: true });
    await expect(sendGuardedText(text('checkin', 1), d)).rejects.toThrow('firestore down');
  });
});
