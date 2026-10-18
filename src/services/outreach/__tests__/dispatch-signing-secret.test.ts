import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchSigningSecret,
  dispatchVerifySecrets,
  signDispatch,
  verifyOnBehalfDispatch,
} from '../on-behalf-dispatch.js';
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

  it('refuses to sign without a key rather than sign with an empty one', () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', '');
    vi.stubEnv('LIVEKIT_API_SECRET', '');
    expect(() => signDispatch({ user_id: 'u1' })).toThrow(/signing secret/);
  });

  it('lets a dispatch signed with our key verify on an agent whose LiveKit key differs', () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', 'ours');
    vi.stubEnv('LIVEKIT_API_SECRET', 'injected-by-livekit-cloud');
    const meta = signDispatch({ user_id: 'u1', caller_id: '+15551234567' }, 'ours');
    expect(isSignedDispatch(meta)).toBe(true);
    expect(signedClaim(meta, ['user_id'])).toBe('u1');
    expect(phoneFromSignedDispatch(meta)).toBe('+15551234567');
  });

  it('accepts the LiveKit key beside ours while signers move over, and nothing else', () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', 'ours');
    vi.stubEnv('LIVEKIT_API_SECRET', 'lk');
    expect(signedClaim(signDispatch({ user_id: 'u1' }, 'lk'), ['user_id'])).toBe('u1');
    expect(signedClaim(signDispatch({ user_id: 'u1' }, 'ours'), ['user_id'])).toBe('u1');
    expect(signedClaim(signDispatch({ user_id: 'u1' }, 'forged'), ['user_id'])).toBeNull();
  });

  it('lists ours first, then the LiveKit key, skipping empty ones', () => {
    expect(
      dispatchVerifySecrets({ DISPATCH_SIGNING_SECRET: 'ours', LIVEKIT_API_SECRET: 'lk' })
    ).toEqual(['ours', 'lk']);
    expect(
      dispatchVerifySecrets({ DISPATCH_SIGNING_SECRET: '', LIVEKIT_API_SECRET: 'lk' })
    ).toEqual(['lk']);
    expect(dispatchVerifySecrets({})).toEqual([]);
  });

  it('keeps verifying with the LiveKit key when our key is unset', () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', '');
    vi.stubEnv('LIVEKIT_API_SECRET', 'lk');
    expect(signedClaim(signDispatch({ user_id: 'u1' }, 'lk'), ['user_id'])).toBe('u1');
  });
});

describe('the eval-only key (EVAL_DISPATCH_SECRET)', () => {
  afterEach(() => vi.unstubAllEnvs());
  const live = () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', 'ours');
    vi.stubEnv('LIVEKIT_API_SECRET', 'lk');
    vi.stubEnv('EVAL_DISPATCH_SECRET', 'eval');
  };

  it('signs in a voice-eval caller', () => {
    live();
    const meta = signDispatch({ user_id: 'voice-eval-sam' }, 'eval');
    expect(signedClaim(meta, ['user_id', 'userId'])).toBe('voice-eval-sam');
  });

  it('never signs in a real account', () => {
    live();
    expect(signedClaim(signDispatch({ user_id: 'seth' }, 'eval'), ['user_id'])).toBeNull();
  });

  it('is trusted for nothing but the user id: not a device, phone, auth token or outbound call', () => {
    live();
    const meta = signDispatch(
      { user_id: 'voice-eval-sam', device_id: 'voice-eval-dev', caller_id: '+15551234567' },
      'eval'
    );
    expect(isSignedDispatch(meta)).toBe(false);
    expect(signedClaim(meta, ['device_id', 'deviceId'])).toBeNull();
    expect(signedClaim({ ...meta, auth_token: 'voice-eval-x' }, ['auth_token'])).toBeNull();
    expect(phoneFromSignedDispatch(meta)).toBeNull();
    expect(verifyOnBehalfDispatch(JSON.stringify(meta), dispatchVerifySecrets())).toBe(false);
  });

  it('does nothing when the agent has no eval key', () => {
    vi.stubEnv('DISPATCH_SIGNING_SECRET', 'ours');
    vi.stubEnv('EVAL_DISPATCH_SECRET', '');
    expect(
      signedClaim(signDispatch({ user_id: 'voice-eval-sam' }, 'eval'), ['user_id'])
    ).toBeNull();
  });

  it('refuses a stale eval signature like any other', () => {
    live();
    const meta = signDispatch({ user_id: 'voice-eval-sam' }, 'eval', Date.now() - 11 * 60_000);
    expect(signedClaim(meta, ['user_id'])).toBeNull();
  });
});
