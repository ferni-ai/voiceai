/**
 * The workflow model reads a declared `needs.X.outputs.Y` as 'true' (the worst case), but
 * Actions reads an undeclared one, or one to a job outside the reader's `needs:`, as ''. A
 * merge that dropped setup's `deploy-tests:` output line would leave Deploy & CI Config Tests
 * never running on pull requests with every test still green, so the model throws instead.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkOutputs, jobs, running, workflows } from './workflow-jobs.js';

const ROOT = join(__dirname, '..', '..', '..');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const OUTPUT_LINE = /^ {6}deploy-tests: \$\{\{ steps\.deploy-tests\.outputs\.matched \}\}\n/m;
const REF = /needs\.([\w-]+)\.outputs\.([\w-]+)/g;

const dirs: string[] = [];
/** A directory holding one workflow file with the given text. */
function workflowDir(file: string, text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'workflow-jobs-'));
  dirs.push(dir);
  writeFileSync(join(dir, file), text);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A two-job workflow: `a` declares output `x`; `b` reads it, with or without needing `a`. */
function twoJobs(bNeedsA: boolean): string {
  return [
    'name: t',
    'on:',
    '  pull_request:',
    'jobs:',
    '  a:',
    '    runs-on: ubuntu-latest',
    '    outputs:',
    '      x: ${{ steps.s.outputs.x }}',
    '    steps:',
    '      - id: s',
    '        run: echo x=true >> "$GITHUB_OUTPUT"',
    '  b:',
    ...(bNeedsA ? ['    needs: [a]'] : []),
    "    if: needs.a.outputs.x == 'true'",
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: echo b',
    '',
  ].join('\n');
}

describe('needs.X.outputs.Y references the model would otherwise read as true', () => {
  it("ci.yml without setup's deploy-tests output line throws, naming job and output", () => {
    expect(CI.match(new RegExp(OUTPUT_LINE.source, 'gm'))).toHaveLength(1);
    const dropped = CI.replace(OUTPUT_LINE, '');
    expect(dropped.split('\n')).toHaveLength(CI.split('\n').length - 1);
    // The same file, unchanged, in the same kind of directory: test-deploy runs.
    const same = workflowDir('ci.yml', CI);
    expect(running('ci.yml', 'pull_request', {}, same).has('test-deploy')).toBe(true);
    const broken = workflowDir('ci.yml', dropped);
    expect(() => running('ci.yml', 'pull_request', {}, broken)).toThrow(
      'ci.yml test-deploy: needs.setup.outputs.deploy-tests: setup declares no output deploy-tests'
    );
  });

  it('every workflow today: no reference to an undeclared output or a job outside needs', () => {
    const refs = workflows().flatMap((w) => {
      const all = jobs(w);
      const declared = new Map(all.map((j) => [j.id, j.outputs]));
      return all.flatMap((j) =>
        [...(j.if?.matchAll(REF) ?? [])].map(([ref, x, y]) => ({
          at: `${w} ${j.id}: ${ref}`,
          ok: j.needs.includes(x) && (declared.get(x) ?? []).includes(y),
        }))
      );
    });
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((r) => !r.ok).map((r) => r.at)).toEqual([]);
    expect(refs.map((r) => r.at)).toContain('ci.yml test-deploy: needs.setup.outputs.deploy-tests');
    // The production check over every workflow. It reads no `if:` beyond the output references,
    // so it also covers workflows whose conditions the model can't evaluate (see Limits).
    for (const w of workflows()) expect(() => checkOutputs(w), w).not.toThrow();
  });

  it("a reference to a job outside the reader's needs throws (Actions reads it as '')", () => {
    // b needs a: a's declared x reads as 'true' (no override), so b runs.
    const needed = workflowDir('t.yml', twoJobs(true));
    expect(running('t.yml', 'pull_request', {}, needed)).toEqual(new Set(['a', 'b']));
    const outside = workflowDir('t.yml', twoJobs(false));
    expect(() => running('t.yml', 'pull_request', {}, outside)).toThrow(
      't.yml b: needs.a.outputs.x: a is not in its needs'
    );
  });

  it('an include-only matrix expands; a run-time one keeps the name unexpanded', () => {
    const matrixJob = (id: string, name: string, matrix: string[]): string[] => [
      `  ${id}:`,
      `    name: ${name}`,
      '    runs-on: ubuntu-latest',
      '    strategy:',
      '      matrix:',
      ...matrix,
      '    steps:',
      '      - name: Build ${{ matrix.target }}',
      '        run: echo',
    ];
    const head = ['name: t', 'on:', '  pull_request:', 'jobs:'];
    const include = ['        include:', '          - target: x86', '          - target: arm'];
    const runTime = ['        target: ${{ fromJSON(needs.plan.outputs.targets) }}'];
    const text = [
      ...head,
      ...matrixJob('inc', 'Build ${{ matrix.target }}', include),
      ...matrixJob('dyn', 'Draft ${{ matrix.target }}', runTime),
      '',
    ].join('\n');
    const dir = workflowDir('t.yml', text);
    expect(jobs('t.yml', dir).map((j) => j.checks)).toEqual([
      ['Build x86', 'Build arm'],
      ['Draft ${{ matrix.target }}'],
    ]);
    // A key the matrix never defines is still a model error, not an unknown name.
    const missingText = [...head, ...matrixJob('m', 'M ${{ matrix.os }}', include), ''].join('\n');
    const missing = workflowDir('t.yml', missingText);
    expect(() => jobs('t.yml', missing)).toThrow('M ${{ matrix.os }}: matrix.os values not found');
  });
});
