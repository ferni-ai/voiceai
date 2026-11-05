/**
 * The crisis symbols a loop PR is screened with are derived from the source, exactly: a
 * new export can't be missed, and a removed one can't linger. Reads the full source tree,
 * so it runs in the unit suite, not the CI check.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { classify, loadPolicy } from '../autonomy-lanes.js';
import {
  builtInNames,
  crisisSymbols,
  droppedFromScreen,
  ownDeclarations,
  symbolsPath,
  type CrisisSymbols,
} from '../crisis-symbols.js';

const ROOT = join(__dirname, '../../..');
const PERSONA = 'src/personas/bundles/x/content.ts';
const committed = JSON.parse(readFileSync(symbolsPath(), 'utf8')) as CrisisSymbols;
// Derived once, at collection: it parses every source file (about 2 s).
const derived = crisisSymbols(ROOT, committed.previouslyScreened);

describe('crisis symbols', () => {
  it("crisisSymbols matches the crisis modules' exports", () => {
    expect(derived.exported).toContain('scoreCrisisLanguage');
    expect(derived.exported).not.toContain('default');
    // On failure: node --experimental-strip-types scripts/ci/crisis-symbols.ts --write
    expect(committed).toEqual(derived);
    expect(loadPolicy().lanes.crisis.symbols).toEqual(derived.screened);
  });

  it('only crisis modules under src/ are scanned, not crisis-path tooling', () => {
    // scripts/ci/crisis-symbols.ts and scripts/voice-eval/release-check.mjs are crisis
    // paths for review, not crisis behaviour.
    for (const name of ['builtInNames', 'crisisSymbols', 'checkRelease', 'REPO']) {
      expect(derived.exported).not.toContain(name);
    }
  });

  it('generic export shared with non-crisis modules is not screened', () => {
    const policy = loadPolicy();
    // The screens alone: every path allowed, so default-deny doesn't decide it.
    const screens = { ...policy, loopAllowed: { paths: ['**'], screenContent: [] } };
    for (const name of ['domain', 'definitions', 'getToolDefinitions', 'plain']) {
      expect(derived.exported).toContain(name);
      expect(derived.screened).not.toContain(name);
      const line = `+  const x = ${name}(y);`;
      expect(classify([PERSONA], [line], 'ferni-loop[bot]', screens)).toEqual([]);
    }
  });

  it('export named like a built-in method is not screened', () => {
    // crisis-modifiers.ts exports normalize(); every other use is str.normalize('NFKC').
    expect(builtInNames()).toContain('normalize');
    expect(derived.exported).toContain('normalize');
    expect(derived.screened).not.toContain('normalize');
    const line = "+  const key = name.normalize('NFKC');";
    const policy = loadPolicy();
    const screens = { ...policy, loopAllowed: { paths: ['**'], screenContent: [] } };
    expect(classify([PERSONA], [line], 'ferni-loop[bot]', screens)).toEqual([]);
  });

  it('a crisis symbol cannot drop out of the screen without a policy entry', () => {
    const { unscreened } = loadPolicy().lanes.crisis;
    expect(droppedFromScreen(committed, unscreened)).toEqual([]);
    // The snapshot only grows: a regeneration keeps every name screened before.
    expect(committed.previouslyScreened).toEqual(expect.arrayContaining(committed.screened));
    expect(crisisSymbols(ROOT, ['zzzOnceScreened']).previouslyScreened).toContain(
      'zzzOnceScreened'
    );
    // A namesake declared elsewhere would drop scoreCrisisLanguage from the screen:
    const unscreenedNow = {
      ...derived,
      screened: derived.screened.filter((n) => n !== 'scoreCrisisLanguage'),
    };
    expect(droppedFromScreen(unscreenedNow, unscreened)).toEqual(['scoreCrisisLanguage']);
    expect(droppedFromScreen(unscreenedNow, ['scoreCrisisLanguage'])).toEqual([]);
    // A name no longer exported at all has left with its crisis module edit.
    const gone = {
      ...unscreenedNow,
      exported: unscreenedNow.exported.filter((n) => n !== 'scoreCrisisLanguage'),
    };
    expect(droppedFromScreen(gone, unscreened)).toEqual([]);
    // This test parses the whole source tree a second time (about 2 s idle); the 20 s
    // default timed out on a loaded CI shard, so it gets headroom without asserting less.
  }, 120_000);

  it('only real declarations elsewhere make a crisis name ambiguous', () => {
    const file = 'src/agents/processors/turn-processor/index.ts';
    const text = [
      "export { addSafetyNote } from './safety-note.js';",
      "export * from './turn-crisis.js';",
      "import { detectCrisis as detect } from '../../../services/safety/index.js';",
      'export function detectCrisis(t: string) { return detect(t); }',
      "import { helper } from './helper.js';",
      'export { helper };',
      'const own = 1;',
      'export { own as ownName };',
      'export function plainFn() {}',
    ].join('\n');
    expect(ownDeclarations(file, text).sort()).toEqual(['ownName', 'plainFn']);
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
    // Reviewed: crisis-critical names that collide, or might, with exports elsewhere.
    for (const name of alwaysScreen) {
      expect(derived.exported).toContain(name);
      expect(derived.screened).toContain(name);
    }
  });
});
