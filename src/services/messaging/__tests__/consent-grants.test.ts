/**
 * A third party's consent is a grant for one owner: a friends-and-family
 * owner's attestation, never over an opt-out, and a global STOP beats it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryConsentStore } from './memory-consent.js';
import {
  hasGrant,
  mayReachForOwner,
  recordOwnerAttestation,
  thirdPartyRefusal,
} from '../consent-grants.js';
import { readConsent, recordInboundSmsConsent, writeOptOut, type ConsentDeps } from '../consent.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import type { TextDeps, TextStore } from '../../outreach/guarded-text.js';

const PAT = '+12025550188';
const env = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
const HASH = phoneHash(PAT, env) as string;
let now = new Date('2026-10-18T16:00:00Z'); // noon in Washington: not quiet hours
const DAY = 24 * 60 * 60 * 1000;

let m: ReturnType<typeof memoryConsentStore>;
let deps: ConsentDeps;
beforeEach(() => {
  now = new Date('2026-10-18T16:00:00Z');
  m = memoryConsentStore();
  deps = { env, store: m.store, now: () => now };
});

describe('recordOwnerAttestation', () => {
  it('a friends-and-family owner: recorded with source, uid and time', async () => {
    expect(await recordOwnerAttestation(PAT, 'call', 'owner-1', deps, async () => true)).toBe(true);
    expect(m.docs.get(HASH)?.grants).toEqual({
      'owner-1': { call: { source: 'owner-attested', at: now.toISOString() } },
    });
    expect(m.docs.get(HASH)?.call).toBeUndefined(); // the global record is the contact's alone
  });

  it('an owner outside friends-and-family: nothing recorded', async () => {
    expect(await recordOwnerAttestation(PAT, 'call', 'owner-2', deps, async () => false)).toBe(
      false
    );
    expect(await hasGrant(HASH, 'owner-2', 'call', deps)).toBe(false);
  });

  it('never over an opt-out', async () => {
    await writeOptOut(HASH, 'sms', 'inbound-sms', deps);
    expect(await recordOwnerAttestation(PAT, 'sms', 'owner-1', deps, async () => true)).toBe(false);
  });
});

describe('consent is given for one owner, and a STOP beats it', () => {
  const textFor = (sender: string) => ({
    senderUserId: sender,
    toPhone: PAT,
    body: 'hi',
    refId: `r-${sender}`,
    zone: 'America/New_York',
  });
  const send = vi.fn(async () => ({ success: true, messageSid: 'SM1' }));
  let sent: Array<Record<string, unknown>> = [];
  const textDeps = (): TextDeps => ({
    env,
    store: {
      forUser: async () => [],
      forPhoneHash: async (h: string) => sent.filter((r) => r.phoneHash === h),
      add: async (r: Record<string, unknown>) => (sent.push(r), 'id'),
      lock: async () => true,
      lockedAt: async () => undefined,
      unlock: async () => undefined,
      sponsoredPhone: async () => undefined,
      isOptedOut: async () => false,
      consentDoc: async (h: string) => m.store.read(h),
      userDoc: async () => undefined,
      legacySmsChannels: async () => undefined,
    } as unknown as TextStore,
    authPhone: async () => '+12025550100',
    send,
    now: () => now,
    consent: deps,
  });
  const notOwn = async (): Promise<boolean> => false;
  beforeEach(() => {
    send.mockClear();
    sent = [];
  });

  it("each owner's first text to Mom carries that owner's intro; later ones are plain", async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    await recordOwnerAttestation(PAT, 'sms', 'seth', deps, async () => true);
    await recordOwnerAttestation(PAT, 'sms', 'user-b', deps, async () => true);
    const bodies = (): string[] =>
      (send.mock.calls as unknown as Array<[{ body: string }]>).map(([m]) => m.body);
    await sendOnBehalfText(textFor('seth'), textDeps());
    now = new Date(now.getTime() + 20 * 60 * 1000); // past the 10-minute gap
    await sendOnBehalfText({ ...textFor('seth'), refId: 'r-seth-2' }, textDeps());
    now = new Date(now.getTime() + 20 * 60 * 1000);
    await sendOnBehalfText(textFor('user-b'), textDeps());
    expect(bodies()).toEqual([
      expect.stringContaining('asked me to send this: hi'),
      'hi',
      expect.stringContaining('asked me to send this: hi'),
    ]);
  });

  it("Seth's attestation doesn't let user B text or call Mom; Seth's own grant works", async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    await recordOwnerAttestation(PAT, 'sms', 'seth', deps, async () => true);
    await recordOwnerAttestation(PAT, 'call', 'seth', deps, async () => true);
    expect(await sendOnBehalfText(textFor('user-b'), textDeps())).toEqual({
      sent: false,
      reason: 'needs-consent',
    });
    expect(await thirdPartyRefusal('user-b', PAT, 'call', notOwn, deps)).toBe('needs-consent');
    expect(await sendOnBehalfText(textFor('seth'), textDeps())).toEqual({ sent: true });
    expect(await thirdPartyRefusal('seth', PAT, 'call', notOwn, deps)).toBeNull();
  });

  it("a real STOP from Mom (texts only) beats Seth's text AND call grants", async () => {
    const { sendOnBehalfText } = await import('../../outreach/guarded-text.js');
    await recordOwnerAttestation(PAT, 'sms', 'seth', deps, async () => true);
    await recordOwnerAttestation(PAT, 'call', 'seth', deps, async () => true);
    // What the inbound route does with a plain "STOP": an sms opt-out only.
    expect(await recordInboundSmsConsent(PAT, 'STOP', deps)).toEqual({
      state: 'opted-out',
      channels: ['sms'],
    });
    expect((await readConsent(HASH, deps)).call.state).toBe('unknown');
    expect(await sendOnBehalfText(textFor('seth'), textDeps())).toEqual({
      sent: false,
      reason: 'opted-out',
    });
    expect(await thirdPartyRefusal('seth', PAT, 'call', notOwn, deps)).toBe('opted-out');
    expect(await mayReachForOwner('seth', PAT, 'call', notOwn, deps)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("Seth's own number is still callable after his own text STOP", async () => {
    await recordInboundSmsConsent(PAT, 'STOP', deps);
    expect(await thirdPartyRefusal('seth', PAT, 'call', async () => true, deps)).toBeNull();
  });
});
