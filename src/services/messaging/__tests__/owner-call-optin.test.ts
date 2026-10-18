/**
 * The owner lifts a do-not-call on their own verified number only: a call
 * opt-in in consent/{phoneHash} and the call_opt_outs entry gone.
 */
import { describe, expect, it, vi } from 'vitest';
import { memoryConsentStore } from './memory-consent.js';
import { undoOwnCallOptOut, type OwnerCallOptInDeps } from '../owner-call-optin.js';
import { consentBlocks, readConsent, writeOptOut } from '../consent.js';
import { phoneHash } from '../../outreach/checkin-replies.js';

const OWN = '+12025550199';
const env = { MESSAGING_PIPELINE: 'on', LOG_HASH_SECRET: 'test-secret' };

function setup(verified: string | null = OWN) {
  const m = memoryConsentStore();
  const consent = { env, store: m.store, now: () => new Date('2026-10-18T16:00:00Z') };
  m.legacyCall.add(OWN);
  const deps: OwnerCallOptInDeps = {
    verifiedPhone: vi.fn(async () => verified ?? undefined),
    consent,
    removeCallOptOut: vi.fn(async (e164: string) => {
      m.legacyCall.delete(e164);
    }),
  };
  return { m, consent, deps };
}

describe('undoOwnCallOptOut', () => {
  it("lifts the do-not-call on the owner's own number: consent opt-in, call_opt_outs removed", async () => {
    const { m, consent, deps } = setup();
    const hash = phoneHash(OWN, env) as string;
    await writeOptOut(hash, 'call', 'voice-call', consent);
    expect(await consentBlocks(OWN, 'call', true, consent)).toBe('opted-out');
    expect(await undoOwnCallOptOut('owner-1', deps)).toEqual({ ok: true, phoneLast4: '0199' });
    expect((await readConsent(hash, consent)).call).toMatchObject({
      state: 'opted-in',
      source: 'owner-undo',
    });
    expect(m.legacyCall.has(OWN)).toBe(false);
    expect(await consentBlocks(OWN, 'call', true, consent)).toBeNull();
  });

  it('never texts-back: a text STOP stays', async () => {
    const { consent, deps } = setup();
    const hash = phoneHash(OWN, env) as string;
    await writeOptOut(hash, 'sms', 'inbound-sms', consent);
    await undoOwnCallOptOut('owner-1', deps);
    expect((await readConsent(hash, consent)).sms.state).toBe('opted-out');
  });

  it('no verified phone: nothing changes', async () => {
    const { m, deps } = setup(null);
    expect(await undoOwnCallOptOut('owner-1', deps)).toEqual({
      ok: false,
      reason: 'no-verified-phone',
    });
    expect(m.docs.size).toBe(0);
    expect(m.legacyCall.has(OWN)).toBe(true);
  });

  it('MESSAGING_PIPELINE off: nothing changes', async () => {
    const { m, deps } = setup();
    deps.consent = { ...deps.consent, env: { LOG_HASH_SECRET: 'test-secret' } };
    expect(await undoOwnCallOptOut('owner-1', deps)).toEqual({ ok: false, reason: 'pipeline-off' });
    expect(m.legacyCall.has(OWN)).toBe(true);
    expect(deps.verifiedPhone).not.toHaveBeenCalled();
  });

  it('a sponsored identity is refused: a sponsor-typed number is not proven theirs', async () => {
    const { m, deps } = setup();
    expect(await undoOwnCallOptOut('sponsored_abc', deps)).toEqual({
      ok: false,
      reason: 'sponsored',
    });
    expect(m.legacyCall.has(OWN)).toBe(true);
  });

  it('a dry run writes nothing; an operator run is recorded as admin-undo', async () => {
    const { m, consent, deps } = setup();
    expect(await undoOwnCallOptOut('owner-1', deps, { dryRun: true })).toEqual({
      ok: true,
      phoneLast4: '0199',
      dryRun: true,
    });
    expect(m.legacyCall.has(OWN)).toBe(true);
    expect(m.docs.size).toBe(0);
    await undoOwnCallOptOut('owner-1', deps, { source: 'admin-undo' });
    const hash = phoneHash(OWN, env) as string;
    expect((await readConsent(hash, consent)).call.source).toBe('admin-undo');
  });

  it('a failed write is reported, never claimed done', async () => {
    const { deps } = setup();
    deps.removeCallOptOut = vi.fn(async () => Promise.reject(new Error('unavailable')));
    expect(await undoOwnCallOptOut('owner-1', deps)).toEqual({ ok: false, reason: 'not-saved' });
  });
});
