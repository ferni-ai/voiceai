import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchSigningSecret, signDispatch } from '../on-behalf-dispatch.js';
import { isSignedDispatch, signedClaim } from '../../identity/signed-dispatch-identity.js';
import { phoneFromSignedDispatch } from '../../identity/dispatch-phone.js';

describe('dispatchSigningSecret', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('prefers DISPATCH_SIGNING_SECRET over the LiveKit API secret', () => {
    expect(
      dispatchSigningSecret({ DISPATCH_SIGNING_SECRET: 'ours', LIVEKIT_API_SECRET: 'injected' })
    ).toBe('ours');
  });

  it('falls back to the LiveKit API secret when unset or empty', () => {
    expect(dispatchSigningSecret({ LIVEKIT_API_SECRET: 'lk' })).toBe('lk');
    expect(dispatchSigningSecret({ DISPATCH_SIGNING_SECRET: '', LIVEKIT_API_SECRET: 'lk' })).toBe(
      'lk'
    );
  });

  it('is undefined when neither is set, so nothing verifies', () => {
    expect(dispatchSigningSecret({})).toBeUndefined();
  });

  it('lets a dispatch signed with our key verify on an agent whose LiveKit key differs', () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', 'ours');
    vi.stubEnv('LIVEKIT_API_SECRET', 'injected-by-livekit-cloud');
    const meta = signDispatch({ user_id: 'u1', caller_id: '+15551234567' }, 'ours');
    expect(isSignedDispatch(meta)).toBe(true);
    expect(signedClaim(meta, ['user_id'])).toBe('u1');
    expect(phoneFromSignedDispatch(meta)).toBe('+15551234567');
  });

  it('refuses a dispatch signed with the LiveKit key once our key is set', () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', 'ours');
    vi.stubEnv('LIVEKIT_API_SECRET', 'lk');
    const meta = signDispatch({ user_id: 'u1' }, 'lk');
    expect(signedClaim(meta, ['user_id'])).toBeNull();
  });

  it('keeps verifying with the LiveKit key when our key is unset', () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', '');
    vi.stubEnv('LIVEKIT_API_SECRET', 'lk');
    expect(signedClaim(signDispatch({ user_id: 'u1' }, 'lk'), ['user_id'])).toBe('u1');
  });
});
