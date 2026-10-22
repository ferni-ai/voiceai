import { describe, expect, it, vi } from 'vitest';
import { atomicLocks } from './atomic-locks.js';
import {
  ON_BEHALF_GAP_MS,
  onBehalfNotSent,
  sendOnBehalfText,
  textOnBehalf,
  type OnBehalfText,
  type TextDeps,
  type TextStore,
} from '../guarded-text.js';
import { phoneHash, type CheckinRecord, type StoredCheckin } from '../checkin-replies.js';

const NOW = new Date('2026-10-12T16:00:00Z'); // 10:00 in Denver, 01:00 in Tokyo
const ENV = { LOG_HASH_SECRET: 'test-secret' };
const MOM = '+15557654321';
const HASH = phoneHash(MOM, ENV) ?? '';

function deps(
  existing: StoredCheckin[] = [],
  opts: { optedOut?: boolean; env?: Record<string, string>; account?: Record<string, unknown> } = {}
) {
  const added: CheckinRecord[] = [];
  const store = {
    forPhoneHash: vi.fn(async (h: string) => existing.filter((r) => r.phoneHash === h)),
    isOptedOut: vi.fn(async () => opts.optedOut === true),
    consentDoc: async () => undefined,
    userDoc: vi.fn(async () => opts.account),
    add: vi.fn(async (r: CheckinRecord) => {
      added.push(r);
      return 'new';
    }),
    ...atomicLocks(),
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

  it('guards by default: no flag needs to be set', async () => {
    const { d } = deps([], { optedOut: true, env: { LOG_HASH_SECRET: 'test-secret' } });
    expect(await sendOnBehalfText(text(), d)).toEqual({ sent: false, reason: 'opted-out' });
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

  it('two texts to the same number at once send one: the lock decides', async () => {
    const { d } = deps();
    const both = await Promise.all([
      sendOnBehalfText(text(), d),
      sendOnBehalfText(text({ refId: 'out_2' }), d),
    ]);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(both).toContainEqual({ sent: false, reason: 'recently-sent' });
  });

  it("reads quiet hours in the recipient's area-code zone before the member's", async () => {
    const { d } = deps([], { account: { contactInfo: { timezone: 'Asia/Tokyo' } } });
    // 16:00Z: 06:00 in Honolulu (quiet), 10:00 in Denver (not), 01:00 in the member's Tokyo.
    const hawaii = text({ zone: undefined, toPhone: '+18085550123' });
    expect(await sendOnBehalfText(hawaii, d)).toMatchObject({ reason: 'quiet-hours' });
    const utah = text({ zone: undefined, toPhone: '+18015550123' });
    expect(await sendOnBehalfText(utah, d)).toEqual({ sent: true });
  });

  it('with no zone anywhere, it is quiet while it is quiet on either US coast', async () => {
    const { d } = deps();
    d.now = () => new Date('2026-10-12T13:30:00Z'); // 09:30 in New York, 06:30 in Los Angeles
    expect(await sendOnBehalfText(text({ zone: undefined }), d)).toEqual({
      sent: false,
      reason: 'quiet-hours',
      until: new Date('2026-10-12T15:00:00Z'), // 08:00 in Los Angeles
    });
  });

  it('two texts either side of a gap-window edge send once: they share a lock', async () => {
    const shared: StoredCheckin[] = [];
    const store = {
      isOptedOut: async () => false,
      consentDoc: async () => undefined,
      forPhoneHash: async (h: string) => shared.filter((r) => r.phoneHash === h),
      add: async () => 'x',
      ...atomicLocks(),
    } as unknown as TextStore;
    const send = vi.fn(async () => ({ success: true }));
    const at = (ms: number): TextDeps => ({
      env: ENV,
      store,
      authPhone: async () => undefined,
      send,
      now: () => new Date(NOW.getTime() + ms), // NOW sits on a 10-minute window edge
    });
    const both = await Promise.all([
      sendOnBehalfText(text({ refId: 'a' }), at(-60_000)),
      sendOnBehalfText(text({ refId: 'b' }), at(60_000)),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(both).toContainEqual({ sent: true });
    expect(both).toContainEqual({ sent: false, reason: 'recently-sent' });
  });

  it('a text that went counts as sent even if recording it fails', async () => {
    const { d } = deps();
    d.store.add = vi.fn(async () => {
      throw new Error('firestore down');
    });
    expect(await sendOnBehalfText(text(), d)).toEqual({ sent: true });
  });

  it('holds texts between 21:00 and 08:00 in the zone it is given', async () => {
    const { d } = deps();
    expect(await sendOnBehalfText(text({ zone: 'Asia/Tokyo' }), d)).toEqual({
      sent: false,
      reason: 'quiet-hours',
      until: new Date('2026-10-12T23:00:00Z'), // 08:00 in Tokyo
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("with no zone in hand, reads quiet hours in the member's zone from their account", async () => {
    const { d } = deps([], { account: { contactInfo: { timezone: 'Asia/Tokyo' } } });
    const outcome = await sendOnBehalfText(text({ zone: undefined, senderUserId: 'job-u' }), d);
    expect(outcome).toMatchObject({ sent: false, reason: 'quiet-hours' });
    expect(d.store.userDoc).toHaveBeenCalledWith('job-u');
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

describe('textOnBehalf', () => {
  it('goes through the guards by default', async () => {
    const { d, added } = deps([], { optedOut: true });
    expect(await textOnBehalf(text(), d)).toEqual({ sent: false, reason: 'opted-out' });
    expect(d.send).not.toHaveBeenCalled();
    expect(added).toHaveLength(0);
  });

  it('with ON_BEHALF_TEXT_GUARD=off sends the old unguarded way', async () => {
    const env = { ...ENV, ON_BEHALF_TEXT_GUARD: 'off' };
    const { d, added } = deps([sentToMom(60_000)], { optedOut: true, env });
    expect(await textOnBehalf(text({ zone: 'Asia/Tokyo', personaId: 'maya' }), d)).toEqual({
      sent: true,
    });
    expect(d.send).toHaveBeenCalledWith({
      to: '(555) 765-4321',
      body: 'Seth says happy birthday!',
      personaId: 'maya',
      userId: 'u1',
      outreachId: 'out_1',
    });
    expect(d.store.isOptedOut).not.toHaveBeenCalled();
    expect(added).toHaveLength(0);
  });
});

describe('onBehalfNotSent', () => {
  it('says plainly that nothing was sent, and why', () => {
    expect(onBehalfNotSent('Mom', 'opted-out')).toBe(
      "The text to Mom was NOT sent: that number replied STOP to our texts, so I can't text it."
    );
    const late = onBehalfNotSent('Mom', 'quiet-hours');
    expect(late).toBe(
      "The text to Mom was NOT sent: it's late where they are (9pm to 8am their time). Nothing is queued."
    );
    expect(late).not.toMatch(/held|will send|in the morning/i);
  });
});
