/**
 * The consent port: a registered check answers; with nothing registered and
 * MESSAGING_PIPELINE on, third parties fail closed and the owner's own number
 * goes ahead with an error log.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const error = vi.hoisted(() => vi.fn());
vi.mock('../safe-logger.js', () => ({
  createLogger: () => ({ error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { consentBlocks, consentCheckRegistered, registerConsentCheck } from '../consent-port.js';

const ON = { MESSAGING_PIPELINE: 'on' };
const PHONE = '+12025550166';

afterEach(() => {
  registerConsentCheck(undefined);
  error.mockClear();
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
    expect(error).toHaveBeenCalledTimes(2);
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
});
