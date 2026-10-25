/**
 * The consent port: a registered check answers; with nothing registered and
 * MESSAGING_PIPELINE on, third parties fail closed and the owner's own number
 * goes ahead with an error log.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const error = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
vi.mock('../safe-logger.js', () => ({
  createLogger: () => ({ error, warn, info: vi.fn(), debug: vi.fn() }),
}));

// The real grant store: an unregistered port must never fall through to it.
const grantsModule = vi.hoisted(() => ({
  recordOwnerAttestation: vi.fn(async () => true),
  thirdPartyRefusal: vi.fn(async () => null),
}));
vi.mock('../../services/messaging/consent-grants.js', () => grantsModule);

import {
  consentBlocks,
  consentCheckRegistered,
  grantChecksRegistered,
  ownerRefusal,
  recordOwnerAttestation,
  registerConsentCheck,
  registerGrantChecks,
  thirdPartyRefusal,
} from '../consent-port.js';

const ON = { MESSAGING_PIPELINE: 'on' };
const PHONE = '+12025550166';

afterEach(() => {
  registerConsentCheck(undefined);
  registerGrantChecks(undefined);
  vi.clearAllMocks();
  error.mockClear();
  warn.mockClear();
});

describe('consent port', () => {
  it('asks the registered check, passing the env through', async () => {
    const check = vi.fn(async () => 'opted-out' as const);
    registerConsentCheck(check);
    expect(consentCheckRegistered()).toBe(true);
    expect(await consentBlocks(PHONE, 'sms', true, ON)).toBe('opted-out');
    expect(check).toHaveBeenCalledWith(PHONE, 'sms', true, ON);
  });

  it('flag off and nothing registered: allowed, as before the pipeline', async () => {
    expect(consentCheckRegistered()).toBe(false);
    expect(await consentBlocks(PHONE, 'sms', true, {})).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('flag on and nothing registered: a text or call refuses (fails closed)', async () => {
    expect(await consentBlocks(PHONE, 'sms', true, ON)).toBe('unverifiable');
    expect(await consentBlocks(PHONE, 'call', true, ON)).toBe('unverifiable');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
  });

  it("flag on and nothing registered: someone who isn't the owner refuses", async () => {
    expect(await consentBlocks(PHONE, 'call', async () => false, ON)).toBe('unverifiable');
  });

  it("flag on and nothing registered: the owner's own number goes ahead, loudly", async () => {
    expect(await consentBlocks(PHONE, 'call', async () => true, ON)).toBeNull();
    expect(error).toHaveBeenCalledWith(
      { channel: 'call' },
      'Consent check not registered in this process; owner number allowed'
    );
  });

  it('registerMessagingConsent delegates to consent.ts, with the env passed through', async () => {
    const consent = await import('../../services/messaging/consent.js');
    consent.registerMessagingConsent();
    // consent.ts refuses a number it can't read; flag off it allows everything.
    expect(await consentBlocks('', 'sms', async () => true, ON)).toBe('unverifiable');
    expect(await consentBlocks('', 'sms', async () => true, {})).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('consent port: the per-owner grant checks', () => {
  const OWNER = 'owner-1';
  const notOwn = async (): Promise<boolean> => false;
  const own = async (): Promise<boolean> => true;

  it('asks the registered grant checks', async () => {
    const thirdParty = vi.fn(async () => 'needs-consent' as const);
    const attest = vi.fn(async () => true);
    const owner = vi.fn(async () => 'opted-out' as const);
    registerGrantChecks({
      thirdPartyRefusal: thirdParty,
      recordOwnerAttestation: attest,
      ownerRefusal: owner,
    });
    expect(grantChecksRegistered()).toBe(true);
    expect(await thirdPartyRefusal(OWNER, PHONE, 'call', notOwn, ON)).toBe('needs-consent');
    expect(await ownerRefusal(OWNER, PHONE, 'call', ON)).toBe('opted-out');
    expect(owner).toHaveBeenCalledWith(OWNER, PHONE, 'call');
    expect(await recordOwnerAttestation(PHONE, 'sms', OWNER)).toBe(true);
    expect(attest).toHaveBeenCalledWith(PHONE, 'sms', OWNER);
  });

  it('flag off and nothing registered: a third party is allowed, as before the pipeline', async () => {
    expect(grantChecksRegistered()).toBe(false);
    expect(await thirdPartyRefusal(OWNER, PHONE, 'sms', notOwn, {})).toBeNull();
  });

  it('flag on and nothing registered: a third party is refused (fails closed)', async () => {
    expect(grantChecksRegistered()).toBe(false);
    expect(await thirdPartyRefusal(OWNER, PHONE, 'sms', notOwn, ON)).toBe('unverifiable');
    expect(await thirdPartyRefusal(OWNER, PHONE, 'call', notOwn, ON)).toBe('unverifiable');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("flag on and nothing registered: the owner's own number goes ahead", async () => {
    const isOwn = vi.fn(own);
    expect(await thirdPartyRefusal(OWNER, PHONE, 'call', isOwn, ON)).toBeNull();
    expect(isOwn).toHaveBeenCalledWith(OWNER, PHONE);
  });

  it('nothing registered: an attestation is not recorded and nothing is written', async () => {
    expect(await recordOwnerAttestation(PHONE, 'sms', OWNER)).toBe(false);
    expect(await recordOwnerAttestation(PHONE, 'call', OWNER)).toBe(false);
    expect(grantsModule.recordOwnerAttestation).not.toHaveBeenCalled();
    expect(grantsModule.thirdPartyRefusal).not.toHaveBeenCalled();
  });
});
