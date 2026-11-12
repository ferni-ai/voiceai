import { describe, expect, it } from 'vitest';

import { signedClaim } from '../../../src/services/identity/signed-dispatch-identity.js';
import { signEvalMeta } from '../eval-dispatch.js';

const META = {
  user_id: 'voice-eval-jokes-20261017-ab12',
  user_name: 'Sam',
  timezone: 'America/New_York',
};

describe('signEvalMeta', () => {
  it('is accepted by the agent check that guards user_id', () => {
    const signed = signEvalMeta(META, 'dev-secret');
    expect(signedClaim(signed, ['user_id'], 'dev-secret')).toBe(META.user_id);
    expect(signed.user_id).toBe(META.user_id);
  });

  it('is refused with another secret, and unsigned metadata is refused too', () => {
    expect(signedClaim(signEvalMeta(META, 'dev-secret'), ['user_id'], 'prod-secret')).toBeNull();
    expect(signedClaim(META, ['user_id'], 'dev-secret')).toBeNull();
  });

  it('never signs a real user or signs without a secret', () => {
    expect(() => signEvalMeta({ ...META, user_id: 'vdSfkCCXaiXpnVCvgKxHMYrNFr72' }, 's')).toThrow(
      /voice-eval-/
    );
    expect(() => signEvalMeta({ ...META, user_id: 'voice-eval-' }, 's')).toThrow(/voice-eval-/);
    expect(() => signEvalMeta(META, '')).toThrow(/secret/);
  });
});
