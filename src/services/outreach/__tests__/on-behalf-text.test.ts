import { describe, expect, it, vi } from 'vitest';
import {
  ON_BEHALF_GAP_MS,
  sendOnBehalfText,
  type OnBehalfText,
  type TextDeps,
  type TextStore,
} from '../guarded-text.js';
import { phoneHash, type CheckinRecord, type StoredCheckin } from '../checkin-replies.js';

const NOW = new Date('2026-10-12T16:00:00Z'); // 10:00 in Denver, 01:00 in Tokyo
const ENV = { LOG_HASH_SECRET: 'test-secret', ON_BEHALF_TEXTS: 'on' };
const MOM = '+15557654321';
const HASH = phoneHash(MOM, ENV) ?? '';

function deps(
  existing: StoredCheckin[] = [],
  opts: { optedOut?: boolean; env?: Record<string, string> } = {}
) {
  const added: CheckinRecord[] = [];
  const store = {
    forPhoneHash: vi.fn(async (h: string) => existing.filter((r) => r.phoneHash === h)),
    isOptedOut: vi.fn(async () => opts.optedOut === true),
    add: vi.fn(async (r: CheckinRecord) => {
      added.push(r);
      return 'new';
    }),
  } as unknown as TextStore;
  const d: TextDeps = {
    env: opts.env ?? ENV,
    store,
    authPhone: vi.fn(async () => undefined),
    send: vi.fn(async () => ({ success: true, messageSid: 'SM1' })),
    now: () => NOW,
  };
  return { d, added };
}

const text = (over: Partial<OnBehalfText> = {}): OnBehalfText => ({
  senderUserId: 'u1',
  toPhone: '(555) 765-4321',
  body: 'Seth says happy birthday!',
  refId: 'out_1',
  zone: 'America/Denver',
  ...over,
});

const sentToMom = (msAgo: number): StoredCheckin => ({
  id: 'r1',
  userId: 'u1',
  sessionId: 'out_0',
  sentAt: new Date(NOW.getTime() - msAgo).toISOString(),
  question: 'q',
  status: 'sent',
  phoneLast4: '4321',
  phoneHash: HASH,
  kind: 'on-behalf',
});

describe('sendOnBehalfText', () => {
  it('sends to the normalized number and records it as on-behalf, without the number', async () => {
    const { d, added } = deps();
    expect(await sendOnBehalfText(text(), d)).toEqual({ sent: true });
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ to: MOM, outreachId: 'out_1' }));
    expect(added[0]).toMatchObject({
      kind: 'on-behalf',
      refId: 'out_1',
      phoneHash: HASH,
      phoneLast4: '4321',
    });
    expect(JSON.stringify(added[0])).not.toContain(MOM);
  });

  it('sends nothing while ON_BEHALF_TEXTS is off', async () => {
    const { d, added } = deps([], { env: { LOG_HASH_SECRET: 'test-secret' } });
    expect(await sendOnBehalfText(text(), d)).toEqual({ sent: false, reason: 'flag-off' });
    expect(d.send).not.toHaveBeenCalled();
    expect(added).toHaveLength(0);
  });

  it('never texts a number that sent STOP', async () => {
    const { d } = deps([], { optedOut: true });
    expect(await sendOnBehalfText(text(), d)).toEqual({ sent: false, reason: 'opted-out' });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('holds a second text to the same person within ten minutes, then allows one', async () => {
    const recent = deps([sentToMom(ON_BEHALF_GAP_MS - 60_000)]);
    expect(await sendOnBehalfText(text(), recent.d)).toEqual({
      sent: false,
      reason: 'recently-sent',
    });
    const later = deps([sentToMom(ON_BEHALF_GAP_MS + 60_000)]);
    expect(await sendOnBehalfText(text(), later.d)).toEqual({ sent: true });
  });

  it('holds texts between 21:00 and 08:00 in the zone it is given', async () => {
    const { d } = deps();
    expect(await sendOnBehalfText(text({ zone: 'Asia/Tokyo' }), d)).toEqual({
      sent: false,
      reason: 'quiet-hours',
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it('refuses a number that is not one', async () => {
    const { d } = deps();
    expect(await sendOnBehalfText(text({ toPhone: 'call mom' }), d)).toEqual({
      sent: false,
      reason: 'bad-number',
    });
  });

  it('records a failed send as failed and reports it', async () => {
    const { d, added } = deps();
    d.send = vi.fn(async () => ({
      success: false,
      error: 'The To number +15557654321 is invalid',
    }));
    expect(await sendOnBehalfText(text(), d)).toEqual({ sent: false, reason: 'send-failed' });
    expect(added[0]?.status).toBe('failed');
  });
});
