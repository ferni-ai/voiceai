/**
 * MESSAGING_PIPELINE on: the guarded text senders read consent/{phoneHash}.
 * The owner's own number needs only no opt-out; anyone else needs their own
 * opt-in. Off, the same store changes nothing (today's behaviour).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  sendGuardedText,
  sendOnBehalfText,
  textOnBehalf,
  type TextDeps,
  type TextStore,
} from '../../outreach/guarded-text.js';
import { phoneHash } from '../../outreach/checkin-replies.js';
import { writeOptOut } from '../consent.js';
import { recordOwnerAttestation } from '../consent-grants.js';
import { memoryConsentStore } from './memory-consent.js';

const OWNER_PHONE = '+12025550101';
const FRIEND_PHONE = '+12025550102';
const NOW = new Date('2026-10-18T16:00:00Z'); // 12:00 in Washington: not quiet hours
const ON = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };
const OFF = { LOG_HASH_SECRET: 'test-secret' };

function textDeps(env: Record<string, string>) {
  const consent = memoryConsentStore();
  const store = {
    forUser: async () => [],
    forPhoneHash: async () => [],
    add: async () => 'id',
    lock: async () => true,
    lockedAt: async () => undefined,
    unlock: async () => undefined,
    sponsoredPhone: async () => undefined,
    isOptedOut: async () => false,
    consentDoc: async () => undefined,
    userDoc: async () => undefined,
    legacySmsChannels: async () => undefined,
  } as unknown as TextStore;
  const send = vi.fn(async () => ({ success: true, messageSid: 'SM1' }));
  const d: TextDeps = {
    env,
    store,
    authPhone: async () => OWNER_PHONE,
    send,
    now: () => NOW,
    consent: { env, store: consent.store, now: () => NOW },
  };
  return { d, send, consent: d.consent! };
}

const ownerText = {
  userId: 'u1',
  body: 'You wanted to call the dentist.',
  kind: 'reminder' as const,
  refId: 'r1',
  minGapMs: 60_000,
};
const friendText = {
  senderUserId: 'u1',
  toPhone: FRIEND_PHONE,
  body: 'Seth asked me to send this: running late.',
  refId: 'o1',
  zone: 'America/New_York',
};
const hash = (p: string) => phoneHash(p, ON) as string;

describe('sendGuardedText (owner texts)', () => {
  it('refuses the owner after their STOP in consent', async () => {
    const { d, send, consent } = textDeps(ON);
    await writeOptOut(hash(OWNER_PHONE), 'sms', 'inbound-sms', consent);
    expect(await sendGuardedText(ownerText, d)).toEqual({ sent: false, reason: 'opted-out' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends to the owner with no consent record (unknown is fine for the owner)', async () => {
    const { d, send } = textDeps(ON);
    expect(await sendGuardedText(ownerText, d)).toEqual({ sent: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it('flag off: the consent opt-out is not read, so it sends as today', async () => {
    const { d, send, consent } = textDeps(OFF);
    await writeOptOut(hash(OWNER_PHONE), 'sms', 'inbound-sms', { ...consent, env: ON });
    expect(await sendGuardedText(ownerText, d)).toEqual({ sent: true });
    expect(send).toHaveBeenCalledOnce();
  });
});

describe('sendOnBehalfText / textOnBehalf (texts to someone else)', () => {
  it('refuses a third party who never opted in', async () => {
    const { d, send } = textDeps(ON);
    expect(await sendOnBehalfText(friendText, d)).toEqual({ sent: false, reason: 'needs-consent' });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends with the sender's own grant, and refuses again after their STOP", async () => {
    const { d, send, consent } = textDeps(ON);
    await recordOwnerAttestation(FRIEND_PHONE, 'sms', 'u1', consent, async () => true);
    expect(await sendOnBehalfText(friendText, d)).toEqual({ sent: true });
    await writeOptOut(hash(FRIEND_PHONE), 'sms', 'inbound-sms', consent);
    expect(await sendOnBehalfText({ ...friendText, refId: 'o2' }, d)).toEqual({
      sent: false,
      reason: 'opted-out',
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it('the old store (feature_checkin_optouts) still blocks: fallback', async () => {
    const { d, send, consent } = textDeps(ON);
    await recordOwnerAttestation(FRIEND_PHONE, 'sms', 'u1', consent, async () => true);
    await consent.store.setLegacySmsOptOut(hash(FRIEND_PHONE), true, NOW.toISOString());
    expect(await sendOnBehalfText(friendText, d)).toEqual({ sent: false, reason: 'opted-out' });
    expect(send).not.toHaveBeenCalled();
  });

  it('the unguarded rollback path (ON_BEHALF_TEXT_GUARD=off) still reads consent', async () => {
    const { d, send } = textDeps({ ...ON, ON_BEHALF_TEXT_GUARD: 'off' });
    expect(await textOnBehalf(friendText, d)).toEqual({ sent: false, reason: 'needs-consent' });
    expect(send).not.toHaveBeenCalled();
  });

  it('flag off: a third party with no opt-in is texted as today', async () => {
    const { d, send } = textDeps(OFF);
    expect(await sendOnBehalfText(friendText, d)).toEqual({ sent: true });
    expect(send).toHaveBeenCalledOnce();
  });
});
