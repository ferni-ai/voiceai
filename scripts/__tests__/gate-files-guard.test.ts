/**
 * gate-files-guard.sh fails a PR whose added lines switch a CI gate off. From
 * July to September every test and build step in CI carried continue-on-error
 * and CI stayed green over 214 failures. These tests run the real script
 * against a throwaway git repo: base commit, then the PR's head commit.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GUARD = resolve(__dirname, '../ci/gate-files-guard.sh');

const REQUIRED_CHECKS = `#!/usr/bin/env bash
REQUIRED_CI=(
  "Unit Tests"
  "Integration Tests (1/3)"
)
REQUIRED_OTHER=(
  "build.yml|Build & Test"
)
`;

const CI = `name: CI
on:
  pull_request:
  merge_group:
jobs:
  test-unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - name: Coverage upload
        continue-on-error: true
        run: upload-coverage
      - name: Unit
        run: pnpm test
  test-integration:
    name: Integration Tests (\${{ matrix.shard }}/3)
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:integration
  extras:
    name: Extras
    runs-on: ubuntu-latest
    steps:
      - run: echo extras
`;

const NIGHTLY = `name: Nightly
on:
  schedule:
    - cron: '0 3 * * *'
jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test
`;

let dir: string;

function git(...args: string[]) {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
}

function write(files: Record<string, string>) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
}

function commit(message: string) {
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', message);
}

/** Commits `files` on top of the base and runs the guard on base..head. */
function guard(files: Record<string, string>, labels = '', removed: string[] = []) {
  write(files);
  for (const path of removed) rmSync(join(dir, path));
  commit('head');
  const res = spawnSync('bash', [GUARD, 'HEAD^', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: dir, PR_LABELS: labels },
  });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

const ci = (from: string, to: string) => ({ '.github/workflows/ci.yml': CI.replace(from, to) });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gate-guard-'));
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  write({
    'scripts/ci/required-checks.sh': REQUIRED_CHECKS,
    'scripts/ci/check.sh': '#!/usr/bin/env bash\nset -euo pipefail\nrun-check\n',
    '.github/workflows/ci.yml': CI,
    '.github/workflows/nightly.yml': NIGHTLY,
    '.github/workflows/build.yml': 'on: [pull_request, merge_group]\njobs:\n  build:\n    name: Build & Test\n    runs-on: x\n',
  });
  commit('base');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('gate-files-guard.sh', () => {
  it('fails a step that gains continue-on-error: true, naming file and line', () => {
    const res = guard(ci('      - name: Unit\n', '      - name: Unit\n        continue-on-error: true\n'));
    expect(res.status).toBe(1);
    expect(res.out).toContain('.github/workflows/ci.yml:14: continue-on-error: true');
  });

  it('passes the same change when the PR has the ci-gate-change-ok label', () => {
    const res = guard(
      ci('      - name: Unit\n', '      - name: Unit\n        continue-on-error: true\n'),
      'size/large-ok,ci-gate-change-ok'
    );
    expect(res.status).toBe(0);
    expect(res.out).toContain('.github/workflows/ci.yml:14:');
    expect(res.out).toMatch(/allowed by the ci-gate-change-ok label/);
  });

  it('does not count a look-alike label', () => {
    const res = guard(ci('run: pnpm test\n', 'run: pnpm test || true\n'), 'ci-gate-change-ok-not');
    expect(res.status).toBe(1);
  });

  it('passes an edit next to a continue-on-error that is already on main', () => {
    const res = guard(ci('run: upload-coverage', 'run: upload-coverage --retry 3'));
    expect(res.status).toBe(0);
    expect(res.out).toMatch(/no gate-weakening lines added/);
  });

  it.each([
    ['|| true', ci('run: pnpm test\n', 'run: pnpm test || true\n'), 'ci.yml:14:', /\|\| true/],
    ['set +e', { 'scripts/ci/check.sh': '#!/usr/bin/env bash\nset +e\nrun-check\n' }, 'check.sh:2:', /set \+e/],
    ['passWithNoTests', ci('run: pnpm test\n', 'run: pnpm test --passWithNoTests\n'), 'ci.yml:14:', /passWithNoTests/],
    ['step if: false', ci('      - name: Unit\n', '      - name: Unit\n        if: false\n'), 'ci.yml:14:', /if: false/],
    ['job if: ${{ false }}', ci('    name: Extras\n', '    name: Extras\n    if: ${{ false }}\n'), 'ci.yml:22:', /if: false/],
  ])('fails an added %s', (_what, files, where, reason) => {
    const res = guard(files);
    expect(res.status).toBe(1);
    expect(res.out).toContain(where);
    expect(res.out).toMatch(reason);
  });

  it('ignores the patterns in full-line comments and outside the gate trees', () => {
    const res = guard({
      ...ci('      - name: Unit\n', '      # never write `|| true` or continue-on-error: true here\n      - name: Unit\n'),
      'src/app.sh': 'run || true\nset +e\n',
    });
    expect(res.status).toBe(0);
  });

  it('fails a new path filter on a merge_group workflow, not on other workflows', () => {
    const queued = guard(ci('  pull_request:\n', "  pull_request:\n    paths: ['src/**']\n"));
    expect(queued.status).toBe(1);
    expect(queued.out).toMatch(/ci\.yml:4: path filter on a merge_group workflow/);

    const nightly = guard({
      '.github/workflows/nightly.yml': NIGHTLY.replace('  schedule:\n', '  push:\n    paths-ignore: [docs/**]\n  schedule:\n'),
    });
    expect(nightly.status).toBe(0);
  });

  it('fails when a required check loses its job, including a matrix one', () => {
    const unit = guard(ci('    name: Unit Tests\n', '    name: Unit Tests (fast)\n'));
    expect(unit.status).toBe(1);
    expect(unit.out).toMatch(/required check 'Unit Tests' .* no longer has a job/);

    git('reset', '-q', '--hard', 'HEAD^');
    const matrix = guard(ci('/3)', '/4)'));
    expect(matrix.status).toBe(1);
    expect(matrix.out).toMatch(/required check 'Integration Tests \(1\/3\)'/);

    git('reset', '-q', '--hard', 'HEAD^');
    const other = guard({}, '', ['.github/workflows/build.yml']);
    expect(other.status).toBe(1);
    expect(other.out).toMatch(/required check 'Build & Test'/);
  });

  it('reads the required list from the base, so dropping the entry too still fails', () => {
    const res = guard({
      ...ci('    name: Unit Tests\n', '    name: Quick Tests\n'),
      'scripts/ci/required-checks.sh': REQUIRED_CHECKS.replace('  "Unit Tests"\n', ''),
    });
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/required check 'Unit Tests'/);
  });

  it('passes deleting a job no required check comes from', () => {
    const res = guard(ci(CI.slice(CI.indexOf('  extras:')), ''));
    expect(res.status).toBe(0);
  });
});
