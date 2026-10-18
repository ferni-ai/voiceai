import { describe, expect, it } from 'vitest';

import { isSignedDispatch } from '../../../src/services/identity/signed-dispatch-identity.js';
import { signEvalMeta } from '../eval-dispatch.js';

const META = {
  user_id: 'voice-eval-jokes-20261017-ab12',
  user_name: 'Sam',
  timezone: 'America/New_York',
};

describe('signEvalMeta', () => {
  it('is accepted by the agent check that guards user_id', () => {
    const signed = signEvalMeta(META, 'dev-secret');
    expect(isSignedDispatch(signed, 'dev-secret')).toBe(true);
    expect(signed.user_id).toBe(META.user_id);
  });

  it('is refused with another secret, and unsigned metadata is refused too', () => {
    expect(isSignedDispatch(signEvalMeta(META, 'dev-secret'), 'prod-secret')).toBe(false);
    expect(isSignedDispatch(META, 'dev-secret')).toBe(false);
  });

  it('never signs a real user or signs without a secret', () => {
    expect(() => signEvalMeta({ ...META, user_id: 'vdSfkCCXaiXpnVCvgKxHMYrNFr72' }, 's')).toThrow(
      /voice-eval-/
    );
    expect(() => signEvalMeta({ ...META, user_id: 'voice-eval-' }, 's')).toThrow(/voice-eval-/);
    expect(() => signEvalMeta(META, '')).toThrow(/secret/);
  });
});
