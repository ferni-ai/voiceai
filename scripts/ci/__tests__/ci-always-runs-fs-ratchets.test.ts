/**
 * A pull request runs only the unit tests whose imports reach a changed file (`--changed`,
 * ci.yml). Many scripts/ci ratchets read what they guard as text (crisis symbols, CODEOWNERS,
 * workflow files, web env reads), so no import edge reaches them and a PR that opens a new gap
 * would first fail in the merge queue's full run. ci.yml's "Run the scripts/ci ratchets" step
 * runs the whole directory on every such PR; this pins that step so it can't quietly vanish,
 * be gated off, or be softened, and checks that the unit config picks up every test in the
 * directory (a file it doesn't include would be skipped by the step too).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import unitConfig from '../../../vitest.config.unit';

const ROOT = join(__dirname, '../../..');
const CI_YML = join(ROOT, '.github/workflows/ci.yml');
const STEP = 'Run the scripts/ci ratchets';
const IF = "env.FULL_SUITE != 'true' && matrix.shard == 1";
const RUN = 'pnpm exec vitest run --config vitest.config.unit.ts scripts/ci/';

/** The named step of the test-unit-shard job, as its lines. Throws if the job or step is missing. */
export function unitShardStep(yml: string, name: string): string[] {
  const lines = yml.split('\n');
  const job = lines.findIndex((l) => l === '  test-unit-shard:');
  if (job === -1) throw new Error('no test-unit-shard job in ci.yml');
  const jobEnd = lines.findIndex((l, i) => i > job && /^ {2}[\w-]+:\s*$/.test(l));
  const body = lines.slice(job, jobEnd === -1 ? undefined : jobEnd);
  const at = body.findIndex((l) => l.trim() === `- name: ${name}`);
  if (at === -1) throw new Error(`no "${name}" step in the test-unit-shard job`);
  const indent = body[at]!.indexOf('- ');
  const end = body.findIndex(
    (l, i) =>
      i > at &&
      l.trim() !== '' &&
      !l.trimStart().startsWith('#') &&
      (l.indexOf('- ') === indent || l.search(/\S/) < indent)
  );
  return body.slice(at, end === -1 ? undefined : end).filter((l) => !/^\s*#/.test(l));
}

/** Why the step would not run the ratchets on every PR, or undefined when it does. */
export function stepGap(step: string[]): string | undefined {
  const field = (key: string): string | undefined =>
    step
      .map((l) => new RegExp(`^\\s+(?:- )?${key}:\\s*(.*)$`).exec(l)?.[1])
      .find((v) => v !== undefined);
  if (field('if') !== IF) return `its if: is ${JSON.stringify(field('if'))}, not ${IF}`;
  if (field('run') !== RUN) return `it runs ${JSON.stringify(field('run'))}, not ${RUN}`;
  if (field('continue-on-error') !== undefined) return 'it has continue-on-error';
  if (field('NODE_ENV') !== 'test') return 'it does not set NODE_ENV: test';
  return undefined;
}

describe('ci.yml always runs the scripts/ci ratchets on pull requests', () => {
  it('has the step, gated like the decision register and never soft', () => {
    const step = unitShardStep(readFileSync(CI_YML, 'utf8'), STEP);
    expect(stepGap(step)).toBeUndefined();
  });

  it('flags a missing, gated-off or softened step', () => {
    const yml = (stepLines: string[]): string =>
      [
        'jobs:',
        '  test-unit-shard:',
        '    steps:',
        '      - name: Other',
        '        run: echo',
        ...stepLines,
        '      - name: Next',
        `        if: ${IF}`,
        `        run: ${RUN}`,
        '  other:',
        '    steps: []',
      ].join('\n');
    const good = [
      `      - name: ${STEP}`,
      `        if: ${IF}`,
      `        run: ${RUN}`,
      '        env:',
      '          NODE_ENV: test',
    ];
    const swap = (ls: string[], i: number, l: string): string[] =>
      ls.map((x, j) => (j === i ? l : x));
    expect(stepGap(unitShardStep(yml(good), STEP))).toBeUndefined();
    expect(() => unitShardStep(yml([]), STEP)).toThrow(/no "Run the scripts\/ci ratchets" step/);
    expect(stepGap(unitShardStep(yml(swap(good, 1, '        if: false')), STEP))).toMatch(
      /its if:/
    );
    expect(stepGap(unitShardStep(yml(swap(good, 2, `        run: ${RUN}x`)), STEP))).toMatch(
      /it runs/
    );
    expect(stepGap(unitShardStep(yml([...good, '        continue-on-error: true']), STEP))).toBe(
      'it has continue-on-error'
    );
    expect(stepGap(unitShardStep(yml(good.slice(0, 3)), STEP))).toBe(
      'it does not set NODE_ENV: test'
    );
  });

  it('runs every test file in scripts/ci (the unit config includes each one)', () => {
    // picomatch as vitest's own dist resolves it, the way unit-full-suite-needed.mjs matches.
    const picomatch = createRequire(fileURLToPath(import.meta.resolve('vitest')))('picomatch') as (
      globs: string[]
    ) => (path: string) => boolean;
    const included = picomatch(unitConfig.test?.include ?? []);
    const excluded = picomatch(unitConfig.test?.exclude ?? []);
    const tests = (readdirSync(join(ROOT, 'scripts/ci'), { recursive: true }) as string[])
      .map((f) => relative(ROOT, join(ROOT, 'scripts/ci', f)))
      .filter((f) => /\.test\.[cm]?[jt]s$/.test(f));
    expect(tests.length).toBeGreaterThan(10);
    expect(tests.filter((f) => !included(f) || excluded(f))).toEqual([]);
  });
});
