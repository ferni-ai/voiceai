/**
 * Gate canaries (#3521): each blocking gate runs for real (its own script, the real tool
 * binary) on a throwaway git repo, once with a planted violation, which must exit non-zero,
 * and once with a clean change, which must exit 0. A unit test of a gate's helpers can't
 * catch a gate whose plumbing never fails: a tool that stops reporting, a parse that reads
 * nothing, an exit code that gets lost. A mutant that makes the gate always pass turns its
 * canary red.
 *
 * Covered here: the gate files guard, the knip dead-code ratchet and the lint-coverage
 * ratchet. The gitleaks scans carry their own canary, run before every scan in CI
 * (gitleaks-canary.sh). Not covered yet: quality:arch, quality:decisions, kernel
 * duplicates, flags:expiry; the crisis readers ratchet and crisis-symbols belong to the
 * crisis lane.
 */
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const TSX = join(REPO, 'node_modules/.bin/tsx');
const QUALITY = join(REPO, 'apps/cli/src/commands/quality');

// CI context would point the gates at the real PR (merge-base.ts reads GITHUB_EVENT_PATH and
// ignores QUALITY_BASE under GITHUB_ACTIONS; the guard reads PR_NUMBER for its label check).
const CI_VARS = ['GITHUB_ACTIONS', 'GITHUB_EVENT_PATH', 'GITHUB_EVENT_NAME', 'PR_NUMBER', 'GITHUB_RUN_ID', 'GH_TOKEN'];

interface Canary {
  dir: string;
  /** Writes the files and commits them; returns the new commit's sha. */
  commit(files: Record<string, string>): string;
  /** Runs a command in the repo with CI context removed. */
  run(cmd: string, args: string[], env?: Record<string, string>): { status: number | null; out: string };
}

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function canaryRepo(): Canary {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'gate-canary-')));
  dirs.push(dir);
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=canary', '-c', 'user.email=canary@example.invalid', '-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  return {
    dir,
    commit(files) {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
      }
      git('add', '-A');
      git('commit', '-q', '--allow-empty', '-m', 'canary');
      return git('rev-parse', 'HEAD');
    },
    run(cmd, args, env = {}) {
      const clean = { ...process.env, ...env };
      for (const name of CI_VARS) delete clean[name];
      const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: clean, timeout: 120_000 });
      return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    },
  };
}

describe('gate canary: gate files guard', () => {
  const GUARD = join(REPO, 'scripts/ci/gate-files-guard.sh');
  const WORKFLOW = 'on: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Test\n        run: pnpm test\n';
  // Joined at run time: the guard reads this file too (it lives under scripts/ci/), and the
  // literal violations would trip it on this PR.
  const TOLERATE = ['continue-on-error', 'true'].join(': ');
  const SWALLOW = ['||', 'true'].join(' ');

  it.each([
    [TOLERATE, '.github/workflows/ci.yml', `${WORKFLOW}        ${TOLERATE}\n`],
    [`${SWALLOW} on a tool line`, 'scripts/ci/check.sh', `#!/usr/bin/env bash\nset -euo pipefail\npnpm exec tsc --noEmit ${SWALLOW}\n`],
  ])('fails a planted %s', (_name, file, text) => {
    const repo = canaryRepo();
    const base = repo.commit({ '.github/workflows/ci.yml': WORKFLOW, 'scripts/ci/check.sh': '#!/usr/bin/env bash\nset -euo pipefail\npnpm exec tsc --noEmit\n' });
    const head = repo.commit({ [file]: text });
    const r = repo.run('bash', [GUARD, base, head]);
    expect(r.out).toContain(`${file}:`);
    expect(r.status).toBe(1);
  });

  it('passes a clean change to the same files', () => {
    const repo = canaryRepo();
    const base = repo.commit({ '.github/workflows/ci.yml': WORKFLOW });
    const head = repo.commit({ '.github/workflows/ci.yml': `${WORKFLOW}      - name: Lint\n        run: pnpm lint\n` });
    const r = repo.run('bash', [GUARD, base, head]);
    expect(r.out).toContain('nothing that switches a gate off');
    expect(r.status).toBe(0);
  });
});

describe('gate canary: knip dead-code ratchet', { timeout: 120_000 }, () => {
  // A small project: one production entry, one test entry, and an export nothing uses, so
  // knip's report is never empty (an empty report fails the gate on its own).
  function knipRepo(): { repo: Canary; base: string } {
    const repo = canaryRepo();
    symlinkSync(join(REPO, 'node_modules'), join(repo.dir, 'node_modules'));
    const base = repo.commit({
      '.gitignore': 'node_modules\n',
      'package.json': '{ "name": "knip-canary", "private": true, "type": "module" }\n',
      'tsconfig.json': '{ "compilerOptions": { "module": "NodeNext", "moduleResolution": "NodeNext", "strict": true }, "include": ["src"] }\n',
      'knip.json': '{ "entry": ["src/index.ts!", "src/**/*.test.ts"], "project": ["src/**/*.ts!"] }\n',
      'src/index.ts': "import { used } from './lib.js';\nconsole.log(used());\n",
      'src/lib.ts': 'export function used(): number {\n  return 1;\n}\nexport const legacyUnused = 1;\n',
      'src/lib.test.ts': "import { used } from './lib.js';\nif (used() !== 1) throw new Error('used');\n",
    });
    return { repo, base };
  }
  const ratchet = (repo: Canary, base: string) => repo.run(TSX, [join(QUALITY, 'knip-ratchet.ts')], { QUALITY_BASE: base });

  it('fails a planted unused export', () => {
    const { repo, base } = knipRepo();
    repo.commit({ 'src/lib.ts': 'export function used(): number {\n  return 1;\n}\nexport const legacyUnused = 1;\nexport function planted(): void {}\n' });
    const r = ratchet(repo, base);
    expect(r.out).toContain('planted');
    expect(r.status).toBe(1);
  });

  it('passes a new export that production code uses', () => {
    const { repo, base } = knipRepo();
    repo.commit({
      'src/lib.ts': 'export function used(): number {\n  return 1;\n}\nexport const legacyUnused = 1;\nexport function added(): number {\n  return 2;\n}\n',
      'src/index.ts': "import { added, used } from './lib.js';\nconsole.log(used(), added());\n",
    });
    const r = ratchet(repo, base);
    expect(r.out).toContain('No dead code added');
    expect(r.status).toBe(0);
  });
});

describe('gate canary: lint-coverage ratchet', { timeout: 120_000 }, () => {
  // The ratchet lints every .ts file under its roots with the repo's ESLint and compares
  // per-file error counts with its committed baseline, which has no canary paths, so any
  // error in one is new. The ESLint config here is a stand-in; the real config's coverage
  // is the ratchet's own "skipped file" check.
  function lintRepo(files: Record<string, string>): Canary {
    const repo = canaryRepo();
    // A real node_modules dir, so ESLint's cache lands here and not in the repo's.
    mkdirSync(join(repo.dir, 'node_modules'));
    symlinkSync(join(REPO, 'node_modules/eslint'), join(repo.dir, 'node_modules/eslint'));
    repo.commit({
      '.gitignore': 'node_modules\n',
      'eslint.config.mjs': "export default [{ files: ['**/*.ts'], rules: { 'no-debugger': 'error' } }, { ignores: ['src/skipped/**'] }];\n",
      'src/canary-fixture/clean.ts': 'export const clean = 1;\n',
      'apps/cli/src/commands/deploy/canary-fixture.ts': 'export const deploy = 1;\n',
      'scripts/canary-fixture.ts': 'export const script = 1;\n',
      ...files,
    });
    return repo;
  }
  const ratchet = (repo: Canary) => repo.run(TSX, [join(QUALITY, 'lint-coverage-ratchet.ts')]);

  it('fails a planted lint error', () => {
    const r = ratchet(lintRepo({ 'src/canary-fixture/planted.ts': 'export const planted = 1;\ndebugger;\n' }));
    expect(r.out).toContain('src/canary-fixture/planted.ts: 1 lint errors');
    expect(r.status).toBe(1);
  });

  it('fails a file ESLint skips', () => {
    const r = ratchet(lintRepo({ 'src/skipped/hidden.ts': 'debugger;\n' }));
    expect(r.out).toContain('src/skipped/hidden.ts: eslint skipped this file');
    expect(r.status).toBe(1);
  });

  it('passes clean files', () => {
    const r = ratchet(lintRepo({}));
    expect(r.out).toContain('No regressions');
    expect(r.status).toBe(0);
  });
});
