/**
 * The blind crisis set is read only by the evals that report counts on it.
 *
 * src/agents/__tests__/fixtures/crisis-test-blind.ts was written blind: nobody tuned the
 * crisis patterns against it, so its recall is an honest measure of unseen phrasing. A unit
 * test that reads it gets tuned against (a red test shows which lines changed, and the fix
 * targets them), and then the set stops being blind. So the open corpora the unit tests share
 * (riskCorpus() and friends) leave it out, and only the files listed below may import it.
 *
 * This fails when a file under src/ or scripts/ reads the set and is not on the list. A file
 * reads it when it imports crisis-test-blind for its values, or when its code (comments aside)
 * names the CRISIS_TEST_BLIND export, which catches a load by path. A type-only import
 * (`import type { BlindCase } ...`) reads no rows and is allowed.
 * The list is by name; it may only shrink, so an entry whose file is gone or no longer
 * imports the set fails too. src/agents/__tests__/fixtures/crisis-relay.ts imports only the
 * BlindCase type, so it needs no entry.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
// Split so this file's own samples below never read as a use of the set.
const BLIND = 'crisis-test-' + 'blind';
const EXPORT = new RegExp(`\\b${'CRISIS_TEST_' + 'BLIND'}\\b`);
const FIXTURE = `src/agents/__tests__/fixtures/${BLIND}.ts`;
const SOURCE = /\.(?:[cm]?[jt]s|tsx|jsx)$/;

/** The files that may import the blind set, each with why. Do not add to this list. */
const ALLOWED: Readonly<Record<string, string>> = {
  // Count-reporting evals and the deterministic baseline (counts and hashes, never rows).
  'scripts/crisis-eval/adjudicator-eval.ts': 'eval: adjudicator recall per set',
  'scripts/crisis-eval/attribution-eval.ts': 'eval: attribution per set',
  'scripts/crisis-eval/baseline/generate.ts': 'baseline: hashed per-line results',
  'scripts/crisis-eval/classifier-eval.ts': 'eval: classifier recall per set',
  'scripts/crisis-eval/labelled-cases.ts': 'eval: labelled cases for the full-path sim',
  'scripts/crisis-eval/sweep-lowerings.ts': 'eval: lowerings per set (loads it by path)',
  'scripts/eval-gate/model.ts': 'eval gate: live model recall',
  'scripts/eval-gate/offline.ts': 'eval gate: offline blind recall floor',
  // The eval: pattern-guard recall floors on the blind set, run as a test (counts only).
  'src/agents/__tests__/crisis-guard-eval.test.ts': 'the eval: pattern-guard floors',
  // Needs lines the patterns miss; an open fixture replaces it, then this entry goes.
  // https://github.com/ferni-ai/voiceai/issues/3673
  'src/agents/personas/__tests__/non-core-persona-crisis.test.ts': 'until its open fixture lands',
};

const MESSAGE =
  'Only the count-reporting evals may read the blind crisis set: a unit test that reads it ' +
  'gets tuned against it. Use the open corpora (crisis-heldout-retired.ts, crisis-relay.ts, ' +
  'crisis-contextual.ts, riskCorpus()) instead.';

/** Tracked files plus untracked ones git doesn't ignore, so a file not yet added still counts. */
function repoFiles(): string[] {
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'src', 'scripts'];
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

/** True when `source` reads the blind set's rows (a type-only import does not). */
function readsBlindSet(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  if (EXPORT.test(code)) return true;
  const from = /\b(import|export)\s+(type\s+)?([^;]*?)\bfrom\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(from)) {
    if (m[4].includes(BLIND) && !m[2]) return true;
  }
  const bare = /\bimport\s*['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(bare)) {
    if ((m[1] ?? m[2]).includes(BLIND)) return true;
  }
  return false;
}

function readers(files: readonly string[], read: (path: string) => string): string[] {
  return files.filter((path) => path !== FIXTURE && SOURCE.test(path) && readsBlindSet(read(path)));
}

const fromDisk = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

describe('the blind crisis set stays out of unit tests', () => {
  it('only the listed evals import it', () => {
    const offenders = readers(repoFiles(), fromDisk).filter((path) => !(path in ALLOWED));
    expect(offenders, MESSAGE).toEqual([]);
  });

  it('every listed file still imports it (the list only shrinks)', () => {
    const now = new Set(readers(repoFiles(), fromDisk));
    expect(Object.keys(ALLOWED).filter((path) => !now.has(path))).toEqual([]);
  });

  it('flags every way of reading the set and passes type-only imports (the check is live)', () => {
    const at = `../fixtures/${BLIND}.js`;
    const name = 'CRISIS_TEST_' + 'BLIND';
    const samples: Record<string, string> = {
      'named.ts': `import { ${name} } from '${at}';`,
      'multiline.ts': `import {\n  ${name},\n  other,\n} from "${at}";`,
      'star.ts': `import * as blind from '${at}';`,
      'reexport.ts': `export { ${name} } from '${at}';`,
      'mixed-type.ts': `import { type BlindCase, ${name} } from '${at}';`,
      'dynamic.ts': `const m = await import('${at}');`,
      'require.cjs': `const m = require('${at}');`,
      'side-effect.ts': `import '${at}';`,
      'by-path.ts': `const rows = (await load(head, 'x.ts')).${name};`,
      'type-only.ts': `import type { BlindCase } from '${at}';`,
      'comment-only.ts': `// ${name} is read only by the evals.\n/* ${name} */ export {};`,
      'type-reexport.ts': `export type { BlindCase } from '${at}';`,
      'other.ts': `import { CRISIS_HELDOUT_RETIRED } from '../fixtures/crisis-heldout-retired.js';`,
      'data.json': `import { ${name} } from '${at}';`,
    };
    expect(readers(Object.keys(samples), (path) => samples[path])).toEqual([
      'named.ts',
      'multiline.ts',
      'star.ts',
      'reexport.ts',
      'mixed-type.ts',
      'dynamic.ts',
      'require.cjs',
      'side-effect.ts',
      'by-path.ts',
    ]);
  });
});
