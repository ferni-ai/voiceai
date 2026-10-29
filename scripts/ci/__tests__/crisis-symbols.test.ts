/**
 * The crisis-symbol list a loop PR is screened with names every export of every module
 * under the crisis paths, exactly: a new export can't be missed, and a removed one can't
 * linger. Reads the full source tree, so it runs in the unit suite, not the CI check.
 */
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { loadPolicy } from '../autonomy-lanes.js';
import { crisisExports } from '../crisis-symbols.js';

describe('crisis symbols', () => {
  it("crisisSymbols matches the crisis modules' exports", () => {
    const listed = loadPolicy().lanes.crisis.symbols ?? [];
    const exported = crisisExports(join(__dirname, '../../..'));
    expect(exported).toContain('addSafetyNote');
    expect(exported).toContain('scoreCrisisLanguage');
    expect(exported).not.toContain('default');
    // On failure: node --experimental-strip-types scripts/ci/crisis-symbols.ts --write
    expect(listed).toEqual(exported);
  });
});
