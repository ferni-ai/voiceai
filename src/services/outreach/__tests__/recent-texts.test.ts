import { describe, expect, it, vi } from 'vitest';
import { phoneHash, type StoredCheckin } from '../checkin-replies.js';
import { recentTextsFor, type RecentTextsStore } from '../recent-texts.js';

const NOW = Date.parse('2026-10-19T16:00:00Z');
const HOUR = 3_600_000;
const SINCE = NOW - 6 * HOUR;
const ENV = { LOG_HASH_SECRET: 'test-secret' };
const ago = (h: number): string => new Date(NOW - h * HOUR).toISOString();

function text(id: string, over: Partial<StoredCheckin> = {}): StoredCheckin {
  return {
    id,
    userId: 'u1',
    sessionId: 's0',
    sentAt: ago(1),
    question: `body ${id}`,
    status: 'sent',
    phoneLast4: '4567',
    phoneHash: 'h',
    kind: 'reminder',
    ...over,
  };
}

function store(records: StoredCheckin[], replied: string[] = []): RecentTextsStore {
  return {
    forUser: vi.fn(async (u: string) => records.filter((r) => r.userId === u)),
    hasReply: vi.fn(async (id: string) => replied.includes(id)),
  };
}

describe('recentTextsFor', () => {
  it('returns a text sent 2 h ago with its kind, body and reply state', async () => {
    const s = store([text('a', { sentAt: ago(2), kind: 'follow-up' })]);
    expect(await recentTextsFor('u1', SINCE, s, ENV)).toEqual([
      { kind: 'follow-up', sentAt: ago(2), body: 'body a', snippet: 'body a', replied: false },
    ]);
  });

  it('marks a text that has a reply', async () => {
    const s = store([text('a')], ['a']);
    expect((await recentTextsFor('u1', SINCE, s, ENV))[0]?.replied).toBe(true);
  });

  it('leaves out on-behalf texts, failed sends and texts older than the window', async () => {
    const s = store([
      text('behalf', { kind: 'on-behalf' }),
      text('failed', { status: 'failed' }),
      text('old', { sentAt: ago(7) }),
      text('kept', { sentAt: ago(5) }),
    ]);
    const got = await recentTextsFor('u1', SINCE, s, ENV);
    expect(got.map((t) => t.body)).toEqual(['body kept']);
  });

  it('newest first, at most three, and a record without a kind is a check-in', async () => {
    const s = store([
      text('a', { sentAt: ago(4) }),
      text('b', { sentAt: ago(1), kind: undefined }),
      text('c', { sentAt: ago(3) }),
      text('d', { sentAt: ago(2) }),
    ]);
    const got = await recentTextsFor('u1', SINCE, s, ENV);
    expect(got.map((t) => t.body)).toEqual(['body b', 'body d', 'body c']);
    expect(got[0]?.kind).toBe('checkin');
  });

  it('reads a phone caller by the hashed id the sender stores, never the raw number', async () => {
    const id = `phone#${phoneHash('+15551234567', ENV)}`;
    const s = store([text('a', { userId: id })]);
    expect(await recentTextsFor('phone:+15551234567', SINCE, s, ENV)).toHaveLength(1);
    expect(s.forUser).toHaveBeenCalledWith(id);
  });
});
