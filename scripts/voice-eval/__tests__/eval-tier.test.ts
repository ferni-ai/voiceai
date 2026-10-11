import { describe, expect, it } from 'vitest';

import { seedTierRefusal } from '../eval-tier.js';

describe('seedTierRefusal', () => {
  it('lets a voice-eval user be seeded with a known tier', () => {
    expect(seedTierRefusal('voice-eval-handoff-every-teammate-20261011-ab12', 'partner')).toBeNull();
  });

  it('never touches a real user', () => {
    expect(seedTierRefusal('vdSfkCCXaiXpnVCvgKxHMYrNFr72', 'partner')).toMatch(/only voice-eval-/);
    expect(seedTierRefusal('voice-eval-', 'partner')).toMatch(/only voice-eval-/);
  });

  it('refuses a tier that does not exist', () => {
    expect(seedTierRefusal('voice-eval-x', 'admin')).toMatch(/tier must be one of/);
  });
});
