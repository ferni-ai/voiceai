/**
 * The call-user port's outreach side: texts to the owner go through the guarded
 * sender (STOP, texts off), Ferni-initiated ones are held in quiet hours, and the
 * only email is the one Firebase verified.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  guarded: vi.fn(
    async (..._a: unknown[]) => ({ sent: true }) as { sent: boolean; reason?: string }
  ),
  zone: 'America/New_York' as string | undefined,
  user: null as null | { email?: string; emailVerified: boolean },
  consented: false,
  record: vi.fn(async (..._a: unknown[]) => undefined),
}));

vi.mock('../guarded-text.js', () => ({ sendGuardedText: h.guarded }));
vi.mock('../../../utils/caller-time-zone.js', () => ({ userTimeZone: () => h.zone }));
vi.mock('../../identity/firebase-auth.js', () => ({ getFirebaseUser: async () => h.user }));
vi.mock('../conversational-calls.js', () => ({ scheduleProactiveCall: vi.fn() }));
vi.mock('../user-reach.js', () => ({ userReach: async () => ({ phone: '+18015550100' }) }));
vi.mock('../outreach-consent.js', () => ({
  VOICE_SMS_DISCLOSURE: 'Sure. Just so you know, I will text this number.',
  readSmsConsent: async () => h.consented,
  recordVoiceSmsConsent: h.record,
}));

import { callUserAdapter, installCallUserPort } from '../call-user-adapter.js';
import { verifiedAddressFor } from '../../engagement/engagement-reach-port.js';
import { noteConsentTurn, setConsentRefused } from '../voice-consent-ledger.js';

const NOON_NY = new Date('2026-10-15T16:00:00.000Z');
const ELEVEN_PM_NY = new Date('2026-10-16T03:00:00.000Z');

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('textOwner', () => {
  it('sends through the guarded sender, as a message to the owner', async () => {
    vi.useFakeTimers({ now: NOON_NY });
    expect(await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: false })).toEqual({
      sent: true,
    });
    expect(h.guarded).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'uid-1', body: 'hi', kind: 'message' })
    );
  });

  it('a STOP or texts-off held by the guard comes back as a reason to say', async () => {
    vi.useFakeTimers({ now: NOON_NY });
    h.guarded.mockResolvedValueOnce({ sent: false, reason: 'opted-out' });
    const out = await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: true });
    expect(out).toEqual({ sent: false, reason: 'you replied STOP to my texts' });
  });

  it('Ferni-initiated texts are held in quiet hours; one they just asked for is not', async () => {
    vi.useFakeTimers({ now: ELEVEN_PM_NY });
    const unasked = await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: false });
    expect(unasked).toEqual({ sent: false, reason: "it's quiet hours where you are" });
    expect(h.guarded).not.toHaveBeenCalled();
    await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: true });
    expect(h.guarded).toHaveBeenCalledTimes(1);
  });
});

describe('a text they ask for on a call, with no consent on record', () => {
  const SAID =
    "Sure. Just so you know, I'll text this number, msg and data rates may apply, and you can reply STOP anytime.";
  const ask = (sessionId?: string) =>
    callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: false, requested: true, sessionId });

  it('waits on the disclosure; consent is recorded only after Ferni spoke it and they said yes', async () => {
    vi.useFakeTimers({ now: NOON_NY });
    h.consented = false;
    expect(await ask('call-yes')).toMatchObject({ sent: false, disclose: expect.any(String) });
    expect(await ask('call-yes')).toMatchObject({ sent: false }); // the model asking again proves nothing
    expect(h.record).not.toHaveBeenCalled();

    noteConsentTurn('call-yes', 'assistant', SAID);
    noteConsentTurn('call-yes', 'user', 'yeah go ahead');
    expect(await ask('call-yes')).toEqual({ sent: true });
    expect(h.record).toHaveBeenCalledWith('uid-1', {
      sessionId: 'call-yes',
      nonce: expect.any(String),
    });
    expect(h.guarded).toHaveBeenCalledTimes(1);
    expect(h.guarded).toHaveBeenCalledWith(expect.objectContaining({ requested: true }));
  });

  it('a no, a disclosure never spoken, or no live call records nothing and sends nothing', async () => {
    vi.useFakeTimers({ now: NOON_NY });
    h.consented = false;
    await ask('call-no');
    noteConsentTurn('call-no', 'assistant', SAID);
    noteConsentTurn('call-no', 'user', 'no thanks');
    expect(await ask('call-no')).toMatchObject({ sent: false });
    await ask('call-quiet');
    noteConsentTurn('call-quiet', 'user', 'yes'); // Ferni never said it
    expect(await ask('call-quiet')).toMatchObject({ sent: false });
    expect(await ask(undefined)).toEqual({
      sent: false,
      reason: 'texts need your okay on a call or in the app',
    });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.guarded).not.toHaveBeenCalled();
  });

  it('on an on-behalf call nothing is disclosed, and the third party saying yes records nothing', async () => {
    vi.useFakeTimers({ now: NOON_NY });
    h.consented = false;
    setConsentRefused('call-ob', true);
    const refused = { sent: false, reason: 'texts need your okay on a call or in the app' };
    expect(await ask('call-ob')).toEqual(refused);
    noteConsentTurn('call-ob', 'assistant', SAID);
    noteConsentTurn('call-ob', 'user', 'yes');
    expect(await ask('call-ob')).toEqual(refused);
    expect(h.record).not.toHaveBeenCalled();
    expect(h.guarded).not.toHaveBeenCalled();
  });

  it('with consent on record (or Ferni reaching out), no disclosure and nothing recorded', async () => {
    vi.useFakeTimers({ now: NOON_NY });
    h.consented = true;
    expect(await ask('call-on-record')).toEqual({ sent: true });
    h.consented = false;
    expect(await callUserAdapter.textOwner!('uid-1', 'hi', { askedNow: false })).toEqual({
      sent: true,
    });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.guarded).toHaveBeenLastCalledWith(expect.objectContaining({ requested: false }));
  });
});

describe('verifiedEmail', () => {
  it('only an address Firebase verified', async () => {
    h.user = { email: 'owner@example.com', emailVerified: true };
    expect(await callUserAdapter.verifiedEmail!('uid-1')).toBe('owner@example.com');
    h.user = { email: 'owner@example.com', emailVerified: false };
    expect(await callUserAdapter.verifiedEmail!('uid-1')).toBeUndefined();
    expect(await callUserAdapter.verifiedEmail!('phone:+18015550100')).toBeUndefined();
  });
});

describe('installCallUserPort', () => {
  it('also installs the engagement port with the same verified-only reach', async () => {
    h.user = { email: 'owner@example.com', emailVerified: true };
    installCallUserPort();
    expect(await verifiedAddressFor('uid-1', 'sms')).toBe('+18015550100');
    expect(await verifiedAddressFor('uid-1', 'email')).toBe('owner@example.com');
  });
});
