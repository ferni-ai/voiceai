/**
 * The crisis symbols a loop PR is screened with are derived from the source, exactly: a
 * new export can't be missed, and a removed one can't linger. Reads the full source tree,
 * so it runs in the unit suite, not the CI check.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { classify, loadPolicy } from '../autonomy-lanes.js';
import { crisisSymbols, symbolsPath } from '../crisis-symbols.js';

const ROOT = join(__dirname, '../../..');
const PERSONA = 'src/personas/bundles/x/content.ts';
// Derived once, at collection: it parses every source file (about 2 s).
const derived = crisisSymbols(ROOT);

describe('crisis symbols', () => {
  it("crisisSymbols matches the crisis modules' exports", () => {
    expect(derived.exported).toContain('scoreCrisisLanguage');
    expect(derived.exported).not.toContain('default');
    // On failure: node --experimental-strip-types scripts/ci/crisis-symbols.ts --write
    expect(JSON.parse(readFileSync(symbolsPath(), 'utf8'))).toEqual(derived);
    expect(loadPolicy().lanes.crisis.symbols).toEqual(derived.screened);
  });

  it('generic export shared with non-crisis modules is not screened', () => {
    const policy = loadPolicy();
    for (const name of ['domain', 'definitions', 'getToolDefinitions', 'plain']) {
      expect(derived.exported).toContain(name);
      expect(derived.screened).not.toContain(name);
      const line = `+  const x = ${name}(y);`;
      expect(classify([PERSONA], [line], 'ferni-loop[bot]', policy)).toEqual([]);
    }
  });

  it('crisis-critical names stay screened, colliding ones through alwaysScreen', () => {
    const { alwaysScreen } = loadPolicy().lanes.crisis;
    for (const name of [
      'recordCrisisEvent',
      'detectCrisis',
      'addSafetyNote',
      'scoreCrisisLanguage',
      'noteCrisisRisk',
    ]) {
      expect(derived.screened).toContain(name);
    }
    // These two are also exported outside the crisis paths (a barrel, a namesake).
    expect(alwaysScreen).toEqual(['addSafetyNote', 'detectCrisis']);
  });
});
