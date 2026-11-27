/**
 * The quality gates are one list, scripts/ci/gates.json, and CI's Quality Gates job, the
 * pre-push hook and `pnpm gates` all run it through scripts/ci/gates.ts (#4551). Before that,
 * pre-push ran 3 of the 16 checks the job ran, and lanes hand-copied the rest into private
 * scripts that drifted, so each gap cost a CI round trip. These rows keep the list the one
 * place a gate lives: a step that runs a quality command of its own in the job fails here,
 * and so does a hook that calls a gate directly or drops the clean-tree guard around them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readGates } from '../../../scripts/ci/gates.js';

const ROOT = join(__dirname, '../../..');
const gates = readGates(readFileSync(join(ROOT, 'scripts/ci/gates.json'), 'utf8'));
const commands = gates.map((g) => g.run.join(' '));

interface Step {
  id?: string;
  name?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
  'continue-on-error'?: unknown;
}
const workflow = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
  jobs: Record<string, { steps?: Step[] }>;
};
const steps = workflow.jobs['quality-gates']?.steps ?? [];
const hook = readFileSync(join(ROOT, '.husky/pre-push'), 'utf8').split('\n');

/** What the job ran as its own steps on main f1063d5b8, the day the list replaced them. */
const FORMER_STEPS = [
  'pnpm tsx apps/cli/src/commands/quality/ratchet.ts',
  'pnpm flags:expiry',
  'pnpm quality:arch',
  'pnpm quality:baseline-shrink',
  'pnpm quality:decisions',
  'pnpm quality:firestore',
  'pnpm quality:mock-paths',
  'pnpm quality:lint-tests',
  'pnpm docs:map --check',
  'pnpm docs:capabilities --check',
  'pnpm tsx scripts/ci/firestore-database-ratchet.ts',
  'pnpm tsx scripts/ci/crisis-readers-ratchet.ts',
  'pnpm tsx scripts/ci/firestore-indexes-drift.ts',
  'pnpm quality:knip',
  'pnpm quality:module-state',
  'pnpm ci:quality-gates',
];
/** Setup steps of the job, not gates (the guard and the main fetch are pinned elsewhere). */
const SETUP_RUNS = ['pnpm install --no-frozen-lockfile', 'pnpm gen:lists'];
const PINNED_ELSEWHERE = ['Gate files guard', 'Fetch main for the ratchets'];

describe('scripts/ci/gates.json is the one list of quality gates', () => {
  it('lists every quality command the job ran before the list existed', () => {
    expect(FORMER_STEPS.filter((c) => !commands.includes(c))).toEqual([]);
  });

  it('is run in full by one step of the Quality Gates job, after the generated lists', () => {
    const at = steps.findIndex((s) => s.run?.trim() === 'pnpm gates');
    expect(at, 'the quality-gates job has no `pnpm gates` step').toBeGreaterThan(-1);
    expect(steps.filter((s) => s.run?.trim() === 'pnpm gates')).toHaveLength(1);
    expect(steps.findIndex((s) => s.run?.trim() === 'pnpm gen:lists')).toBeLessThan(at);
    const step = steps[at]!;
    expect(step.if).toBeUndefined();
    expect(step['continue-on-error']).toBeUndefined();
    expect(step.env).toEqual({ GH_TOKEN: '${{ github.token }}' });
  });

  it('leaves the job no command of its own: a new gate goes on the list', () => {
    const own = steps
      .filter((s) => s.run !== undefined && !PINNED_ELSEWHERE.includes(s.name ?? ''))
      .map((s) => s.run!.trim())
      .filter((run) => run !== 'pnpm gates' && !SETUP_RUNS.includes(run));
    expect(own, 'add these to scripts/ci/gates.json instead of a step').toEqual([]);
  });

  it('is what pre-push runs, as its pre-push set, only when the tree is what is pushed', () => {
    const code = hook.map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'));
    const clean = code.findIndex((l) => l.includes('git diff --quiet HEAD; then'));
    const call = code.findIndex((l) => l.startsWith('pnpm gates --pre-push ||'));
    const elseAt = code.findIndex((l, i) => i > clean && /^(elif|else|fi)\b/.test(l));
    expect(clean, 'the clean-tree guard is gone').toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(clean);
    expect(call).toBeLessThan(elseAt);
    expect(code[call]).toMatch(/\|\| fail /);
    // No gate called around the list, where it would drift from CI's copy again.
    const direct = /apps\/cli\/src\/commands\/quality\/|pnpm quality:|scripts\/ci\/[\w-]+\.ts/;
    expect(code.filter((l) => direct.test(l))).toEqual([]);
  });

  it('runs the row above on a pull request that changes only the hook', () => {
    // Deploy & CI Config Tests run on a PR only when setup's deploy-tests filter matches.
    const filter = workflow.jobs.setup?.steps?.find((s) => s.id === 'deploy-tests');
    expect(new RegExp(filter?.with?.include ?? '$^').test('.husky/pre-push')).toBe(true);
  });

  it('keeps the gates pre-push ran before in its set, and gives none of them a token', () => {
    const prePush = gates.filter((g) => g.prePush);
    expect(prePush.map((g) => g.run.join(' '))).toEqual(
      expect.arrayContaining([
        'pnpm tsx apps/cli/src/commands/quality/ratchet.ts',
        'pnpm quality:arch',
        'pnpm quality:mock-paths',
      ])
    );
    expect(prePush.filter((g) => g.env !== undefined)).toEqual([]);
  });

  it('is run by `pnpm gates`', () => {
    const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(scripts.gates).toBe('tsx scripts/ci/gates.ts');
  });
});
