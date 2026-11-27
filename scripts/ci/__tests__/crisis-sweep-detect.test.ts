/**
 * crisis-sweep.yml's Detect step decides whether a PR can change a crisis read. A hand-kept
 * list there missed heavy-moment.ts: the crisis gate reads it, a PR changing it got
 * crisis=false, and the sweep skipped and reported green, twice (#4332, on #4259). Detect now
 * reads the crisis lane of autonomy-policy.json (crisis-lane-include.ts --sweep), the list
 * crisis-paths-complete.test.ts keeps complete, so there is no second list to drift.
 *
 * "A module the gate reads" here: a source file in crisis-gate.ts's transitive import closure
 * (every specifier preProcessFile lists: import, import type, export-from, import()) that is
 * a crisis kernel module (src/services/safety/**) or imports one. That is what feeds the gate
 * a crisis reading; the closure's other ~4,000 files (flags, logging, audio) don't read one.
 */
import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { importTargets, inPaths, POLICY_PATH } from '../autonomy-lanes.js';
import { crisisLaneInclude, DECIDES_THE_SWEEP, EVERY_PATH } from '../crisis-lane-include.js';
import { ROOT } from './codeowners-rules.js';

const GATE = 'src/agents/personas/crisis-gate.ts';
const KERNEL = ['src/services/safety/**'];
const HEAVY_MOMENT = 'src/speech/adaptive-ssml/heavy-moment.ts';
const include = crisisLaneInclude(POLICY_PATH, DECIDES_THE_SWEEP);

/** A policy whose lane is one unrelated file, so what still matches is the decides list. */
const NARROW_DIR = mkdtempSync(join(tmpdir(), 'crisis-sweep-narrow-'));
const NARROW = join(NARROW_DIR, 'narrow.json');
writeFileSync(join(NARROW_DIR, 'symbols.json'), JSON.stringify({ screened: [] }));
writeFileSync(
  NARROW,
  JSON.stringify({
    lanes: { crisis: { paths: ['src/elsewhere/only.ts'], symbolsFile: 'symbols.json' } },
  })
);
afterAll(() => rmSync(NARROW_DIR, { recursive: true, force: true }));

const tracked = new Set(
  execFileSync('git', ['ls-files', '-z', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((f) => /\.[cm]?[jt]sx?$/.test(f))
);
const importsOf = (file: string): string[] =>
  ts
    .preProcessFile(readFileSync(join(ROOT, file), 'utf8'), true, true)
    .importedFiles.flatMap(
      (i) => importTargets({ file, specifier: i.fileName })?.find((t) => tracked.has(t)) ?? []
    );

/** The gate's closure files that are kernel modules or import one. */
function gateReaders(): string[] {
  const seen = new Set<string>();
  const readers: string[] = [];
  const queue = [GATE];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    const imports = importsOf(file);
    if (inPaths(file, KERNEL) || imports.some((t) => inPaths(t, KERNEL))) readers.push(file);
    queue.push(...imports.filter((t) => !seen.has(t)));
  }
  return readers.sort();
}

/** The paths of `files` that `grep -E -- include` leaves out, as pr-changes greps them. */
function unmatched(files: string[], inc = include): { status: number | null; missed: string[] } {
  const r = spawnSync('grep', ['-Ev', '--', inc], {
    input: `${files.join('\n')}\n`,
    encoding: 'utf8',
  });
  return { status: r.status, missed: r.stdout.split('\n').filter(Boolean) };
}

describe("the Crisis Sweep's Detect step reads the crisis lane", () => {
  const readers = gateReaders();

  it('every module the crisis gate reads is a crisis change', () => {
    expect(readers.length).toBeGreaterThan(50); // the closure resolves, so the row isn't vacuous
    expect(readers).toContain(HEAVY_MOMENT);
    expect(readers).toContain('src/agents/safety/crisis-guard.ts');
    // grep exit 1: no line left over. 2 would be an include grep can't parse.
    expect(unmatched(readers)).toEqual({ status: 1, missed: [] });
  });

  it('a planted heavy-moment.ts change is a crisis change; a docs change is not', () => {
    expect(include).not.toBe(EVERY_PATH);
    expect(unmatched(['docs/readme.md', HEAVY_MOMENT]).missed).toEqual(['docs/readme.md']);
    // ci.yml decides the unit suite, not the sweep.
    const other = ['docs/readme.md', '.github/workflows/ci.yml'];
    expect(unmatched(other).missed).toEqual(other);
  });

  // Listed here, not read from DECIDES_THE_SWEEP, so dropping one from it fails.
  it.each([
    '.github/workflows/crisis-sweep.yml',
    '.github/actions/pr-changes/action.yml',
    'scripts/ci/crisis-lane-include.ts',
    'scripts/ci/autonomy-lanes.ts',
    'scripts/ci/autonomy-policy.json',
    'scripts/ci/queue-lowering-approved.sh',
  ])('what decides the sweep runs it: %s', (file) => {
    const narrow = crisisLaneInclude(NARROW, DECIDES_THE_SWEEP);
    expect(narrow).not.toBe(EVERY_PATH);
    expect(unmatched([file])).toEqual({ status: 1, missed: [] });
    expect(unmatched([file], narrow)).toEqual({ status: 1, missed: [] });
  });

  describe('the workflow step', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/crisis-sweep.yml'), 'utf8');
    const step = / {8}id: crisis-paths\n {8}run: \|\n((?: {10}.*\n)+)/.exec(yml);
    const script = (step?.[1] ?? '').replace(/^ {10}/gm, '');

    /** Runs the step's script with `node` first on PATH; returns what it wrote to GITHUB_OUTPUT. */
    function run(nodeDir: string): string {
      const dir = mkdtempSync(join(tmpdir(), 'crisis-paths-'));
      try {
        const out = join(dir, 'out');
        writeFileSync(out, '');
        const r = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
          cwd: ROOT,
          encoding: 'utf8',
          env: { PATH: `${nodeDir}:${process.env.PATH}`, GITHUB_OUTPUT: out },
        });
        expect(r.status, r.stderr).toBe(0);
        return readFileSync(out, 'utf8');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    function fakeNode(body: string): string {
      const dir = mkdtempSync(join(tmpdir(), 'fake-node-'));
      writeFileSync(join(dir, 'node'), `#!/bin/sh\n${body}\n`);
      chmodSync(join(dir, 'node'), 0o755);
      return dir;
    }

    it('Detect greps the include the script derives', () => {
      expect(script).toContain('scripts/ci/crisis-lane-include.ts --sweep');
      expect(yml).toMatch(
        / {6}- id: crisis\n {8}uses: \.\/\.github\/actions\/pr-changes\n {8}with:\n {10}include: \$\{\{ steps\.crisis-paths\.outputs\.include \}\}\n/
      );
      expect(run(dirname(process.execPath))).toBe(`include=${include}\n`);
    });

    it.each([
      ['fails', 'exit 1'],
      ['prints nothing', 'exit 0'],
    ])('when the script %s, the sweep runs on every path', (_, body) => {
      const dir = fakeNode(body);
      try {
        expect(run(dir)).toBe(`include=${EVERY_PATH}\n`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
