/**
 * A guest's invite, on in-memory stores: it is found by its token's hash, good
 * for one answer before it expires, every bad token is refused the same way, and
 * her answer does exactly what it says (yes records, no withdraws an earlier yes
 * and otherwise writes nothing, forget deletes), stamped by us when it arrives. Nothing kept holds the token or her
 * number. Invites are stored the way task 9c will mint them (memory-guest-invite.ts).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../stores/single-use-records.js';
import { GUEST_CONSENT_WORDING_VERSION } from '../domain/guest-consent.js';
import type { GuestInvite } from '../domain/guest-invite.js';
import { phoneHash } from '../../../outreach/checkin-replies.js';
import { hasGuestConsent } from '../use-cases/check-guest-consent.js';
import { recordGuestConsentByKey } from '../use-cases/guest-consent.js';
import { answerGuestInvite, viewGuestInvite } from '../use-cases/guest-invite.js';
import {
  GUEST,
  HASH_KEY,
  INVITE_TTL_MS,
  OWNER,
  memoryGuestInvites,
} from './memory-guest-invite.js';

const V = GUEST_CONSENT_WORDING_VERSION;
const OTHER_OWNER = 'u-fictional-other';
let m: ReturnType<typeof memoryGuestInvites>;

beforeEach(() => {
  m = memoryGuestInvites();
});

const mint = (): string => m.mint();
const consents = () => hasGuestConsent(OWNER, GUEST, m.deps.consent);
const GUEST_KEY = phoneHash(GUEST, { LOG_HASH_SECRET: HASH_KEY }) ?? '';
const yesFor = async (owner: string) =>
  recordGuestConsentByKey(owner, GUEST_KEY, V, m.deps.consent);

describe('what is kept', () => {
  it('the invite is found only by its hash, and nothing kept holds the token or her number', async () => {
    const token = mint();
    const [key] = [...m.invites.keys()];
    expect(key).toBe(sha256Hex(token));
    expect(await viewGuestInvite(token, m.deps)).not.toBeNull();
    expect(await answerGuestInvite(token, 'yes', m.deps)).toBe(true);
    expect(m.invites.size).toBe(0);
    const kept = JSON.stringify([...m.invites, ...m.consent.docs]);
    for (const secret of [token, '5555550123', '555-0123', '5550123']) {
      expect(kept).not.toContain(secret);
    }
  });
});

describe('an invite is good for one answer', () => {
  it("shows the wording with the owner's first name, takes her yes, then is spent", async () => {
    const token = mint();
    expect(await viewGuestInvite(token, m.deps)).toEqual({
      ownerFirstName: 'Rowan',
      wording: expect.stringMatching(/^Rowan would like Ferni, their AI friend,/),
      wordingVersion: V,
    });
    expect(await consents()).toBe(false);
    expect(await answerGuestInvite(token, 'yes', m.deps)).toBe(true);
    expect(await consents()).toBe(true);

    expect(await answerGuestInvite(token, 'yes', m.deps)).toBe(false);
    expect(await answerGuestInvite(token, 'forget', m.deps)).toBe(false);
    expect(await viewGuestInvite(token, m.deps)).toBeNull();
    expect(await consents()).toBe(true);
  });

  it('her yes is stamped when it arrives, at the wording in force', async () => {
    const token = mint();
    m.clock.now += 3 * 60 * 60 * 1000;
    const arrived = new Date(m.clock.now).toISOString();
    await answerGuestInvite(token, 'yes', m.deps);
    expect([...m.consent.docs.values()]).toEqual([
      expect.objectContaining({ consentedAt: arrived, wordingVersion: V }),
    ]);
  });

  it('an owner with no usable name is "Your friend"', async () => {
    m = memoryGuestInvites({ [OWNER]: 'R0wan' });
    const view = await viewGuestInvite(mint(), m.deps);
    expect(view?.ownerFirstName).toBe('Your friend');
    expect(view?.wording).toMatch(/^Your friend would like Ferni/);
  });
});

describe('a token that cannot be used is refused, always the same way', () => {
  it('unknown and malformed tokens: no view, no answer, nothing written', async () => {
    for (const token of [sha256Hex('nope').slice(0, 43), 'short', undefined, 42]) {
      expect(await viewGuestInvite(token, m.deps)).toBeNull();
      expect(await answerGuestInvite(token, 'yes', m.deps)).toBe(false);
    }
    expect(m.consent.docs.size).toBe(0);
  });

  it('an expired invite (7 days on) is refused; just before, it works', async () => {
    const late = mint();
    const early = mint();
    m.clock.now += INVITE_TTL_MS - 1;
    expect(await viewGuestInvite(early, m.deps)).not.toBeNull();
    m.clock.now += 1;
    expect(await viewGuestInvite(late, m.deps)).toBeNull();
    expect(await answerGuestInvite(late, 'yes', m.deps)).toBe(false);
    expect(await consents()).toBe(false);
    m.clock.now -= 1;
    expect(await answerGuestInvite(early, 'yes', m.deps)).toBe(true);
  });

  it('a stored invite missing its expiry is refused', async () => {
    const token = mint();
    const key = sha256Hex(token);
    const stored = m.invites.get(key);
    if (!stored) throw new Error('setup: no invite');
    const { expiresAt: _expiresAt, ...noExpiry } = stored;
    m.invites.set(key, noExpiry as GuestInvite);
    expect(await viewGuestInvite(token, m.deps)).toBeNull();
    expect(await answerGuestInvite(token, 'yes', m.deps)).toBe(false);
  });
});

describe('her answer', () => {
  it('no withdraws a yes she gave before: the record stays, revoked', async () => {
    expect(await answerGuestInvite(mint(), 'yes', m.deps)).toBe(true);
    m.clock.now += 60_000;
    expect(await answerGuestInvite(mint(), 'no', m.deps)).toBe(true);
    expect(await consents()).toBe(false);
    expect([...m.consent.docs.values()]).toEqual([
      expect.objectContaining({ revokedAt: new Date(m.clock.now).toISOString() }),
    ]);
  });

  it('no records nothing, and spends the invite', async () => {
    const token = mint();
    expect(await answerGuestInvite(token, 'no', m.deps)).toBe(true);
    expect(m.consent.docs.size).toBe(0);
    expect(await consents()).toBe(false);
    expect(await answerGuestInvite(token, 'yes', m.deps)).toBe(false);
  });

  it("forget deletes her consent for this owner, history and all, and no other owner's", async () => {
    await yesFor(OWNER);
    await yesFor(OTHER_OWNER);
    expect(await consents()).toBe(true);
    expect(await answerGuestInvite(mint(), 'forget', m.deps)).toBe(true);
    expect(await consents()).toBe(false);
    expect([...m.consent.docs.keys()]).toEqual([expect.stringMatching(/^u-fictional-other\//)]);
    expect(await hasGuestConsent(OTHER_OWNER, GUEST, m.deps.consent)).toBe(true);
  });

  it('when her yes cannot be saved, the invite is put back so she can try again', async () => {
    const token = mint();
    const { update } = m.deps.consent.store;
    m.deps.consent.store.update = async () => Promise.reject(new Error('store unavailable'));
    await expect(answerGuestInvite(token, 'yes', m.deps)).rejects.toThrow(/unavailable/);
    expect(m.invites.size).toBe(1);
    m.deps.consent.store.update = update;
    expect(await answerGuestInvite(token, 'yes', m.deps)).toBe(true);
    expect(await consents()).toBe(true);
  });
});
