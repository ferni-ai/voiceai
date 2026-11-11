/**
 * gate-files-guard.sh fails a PR whose diff switches a CI gate off. From July
 * to September every test and build step in CI carried continue-on-error and
 * CI stayed green over 214 failures. These tests run the real script against a
 * throwaway git repo (base commit, then the PR's head commit), with a fake `gh`
 * first on PATH answering the run and label-event lookups.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

// Line numbers matter: the tests assert file:line.
const CI = `name: CI
on:
  push:
    branches: [main]
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
      - name: Lint
        run: pnpm lint
  test-integration:
    name: Integration Tests (\${{ matrix.shard }}/3)
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:integration
  extras:
    name: Extras
    runs-on: ubuntu-latest
    steps:
      - run: pnpm extras
      - run: |
          if [ -z "$X" ]; then
            exit 0
          fi
          echo extras
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

const CHECK_SH = '#!/usr/bin/env bash\nset -euo pipefail\nrun-check\n';
const RUN_CREATED = '2026-06-01T00:00:00Z';

let dir: string;

function git(args: string[], env: Record<string, string> = {}) {
  const res = spawnSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')}: ${res.stderr}`);
}

function write(files: Record<string, string>) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
}

function commit(env: Record<string, string> = {}) {
  git(['add', '-A']);
  git(['commit', '-q', '--allow-empty', '-m', 'c'], env);
}

type Event = { event: string; label: string; at: string; actor?: string };

/** The label events the fake `gh` returns, oldest first. */
function events(...list: Event[]) {
  const json = list.map((e) => ({
    event: e.event,
    label: { name: e.label },
    created_at: e.at,
    actor: { login: 'lead', type: e.actor ?? 'User' },
  }));
  writeFileSync(join(dir, 'events.json'), JSON.stringify(json));
}
const labelled = (at = '2026-06-02T00:00:00Z', actor = 'User'): Event => ({
  event: 'labeled',
  label: 'ci-gate-change-ok',
  at,
  actor,
});

/** Commits `files` on top of the base and runs the guard on base..head. */
function guard(
  files: Record<string, string>,
  opts: {
    removed?: string[];
    env?: Record<string, string>;
    commitEnv?: Record<string, string>;
  } = {}
) {
  write(files);
  for (const path of opts.removed ?? []) rmSync(join(dir, path));
  commit(opts.commitEnv);
  return rerun(opts.env);
}

/** Runs the guard on the last commit again, without committing. */
function rerun(env: Record<string, string> = {}) {
  const res = spawnSync('bash', [GUARD, 'HEAD^', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${join(dir, '.bin')}:${process.env.PATH}`,
      HOME: dir,
      FAKE_DIR: dir,
      PR_NUMBER: '7',
      GITHUB_RUN_ID: '99',
      GITHUB_REPOSITORY: 'o/r',
      ...env,
    },
  });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

const ci = (from: string, to: string) => {
  if (!CI.includes(from)) throw new Error(`fixture has no ${from}`);
  return { '.github/workflows/ci.yml': CI.replace(from, to) };
};
const ADD_COE = ci('      - name: Unit\n', '      - name: Unit\n        continue-on-error: true\n');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gate-guard-'));
  mkdirSync(join(dir, '.bin'));
  // The fake answers the two calls the guard makes and logs each one.
  writeFileSync(
    join(dir, '.bin/gh'),
    `#!/usr/bin/env bash
echo "gh $*" >>"$FAKE_DIR/calls.log"
case "$*" in
  "api repos/o/r/actions/runs/99") echo '{"created_at":"${RUN_CREATED}"}' ;;
  "api repos/o/r/issues/7/events --paginate") cat "$FAKE_DIR/events.json" ;;
  *) echo "unexpected gh $*" >&2; exit 1 ;;
esac
`
  );
  chmodSync(join(dir, '.bin/gh'), 0o755);
  writeFileSync(join(dir, '.gitignore'), '.bin/\nevents.json\ncalls.log\n');
  events();
  git(['init', '-q']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 't']);
  write({
    'scripts/ci/required-checks.sh': REQUIRED_CHECKS,
    'scripts/ci/check.sh': CHECK_SH,
    '.github/workflows/ci.yml': CI,
    '.github/workflows/nightly.yml': NIGHTLY,
    '.github/workflows/build.yml':
      'on: [pull_request, merge_group]\njobs:\n  build:\n    name: Build & Test\n    runs-on: x\n',
    '.github/actions/setup/action.yml':
      'runs:\n  using: composite\n  steps:\n    - run: pnpm install\n      shell: bash\n',
  });
  commit();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('gate-files-guard.sh: what it flags', () => {
  it('fails a step that gains continue-on-error: true, naming file and line', () => {
    const res = guard(ADD_COE);
    expect(res.status).toBe(1);
    expect(res.out).toContain('.github/workflows/ci.yml:16: continue-on-error: true');
  });

  it('passes an edit next to a continue-on-error that is already on main', () => {
    const res = guard(ci('run: upload-coverage', 'run: upload-coverage --retry 3'));
    expect(res.status).toBe(0);
    expect(res.out).toMatch(/nothing that switches a gate off/);
  });

  it.each([
    [
      'continue-on-error: ${{ true }}',
      ci('    name: Extras\n', '    name: Extras\n    continue-on-error: ${{ true }}\n'),
      'ci.yml:26:',
      /continue-on-error: \$\{\{true\}\}/,
    ],
    [
      'continue-on-error: True',
      ci(
        '      - run: pnpm extras\n',
        '      - run: pnpm extras\n        continue-on-error: True\n'
      ),
      'ci.yml:29:',
      /continue-on-error: true/,
    ],
    [
      'continue-on-error: yes',
      ci(
        '      - run: pnpm extras\n',
        '      - run: pnpm extras\n        continue-on-error: yes\n'
      ),
      'ci.yml:29:',
      /continue-on-error: yes/,
    ],
    [
      "continue-on-error: 'true'",
      ci(
        '      - run: pnpm extras\n',
        "      - run: pnpm extras\n        continue-on-error: 'true'\n"
      ),
      'ci.yml:29:',
      /continue-on-error: true/,
    ],
    [
      'continue-on-error: ${{ matrix.experimental }}',
      ci(
        '    name: Extras\n',
        '    name: Extras\n    continue-on-error: ${{ matrix.experimental }}\n'
      ),
      'ci.yml:26:',
      /continue-on-error: \$\{\{matrix\.experimental\}\}/,
    ],
    [
      'quoted "continue-on-error": true',
      ci(
        '      - run: pnpm extras\n',
        '      - run: pnpm extras\n        "continue-on-error": true\n'
      ),
      'ci.yml:29:',
      /continue-on-error: true/,
    ],
    [
      "quoted 'continue-on-error': yes",
      ci(
        '      - run: pnpm extras\n',
        "      - run: pnpm extras\n        'continue-on-error': yes\n"
      ),
      'ci.yml:29:',
      /continue-on-error: yes/,
    ],
    [
      'continue-on-error : true (space before the colon)',
      ci(
        '      - run: pnpm extras\n',
        '      - run: pnpm extras\n        continue-on-error : true\n'
      ),
      'ci.yml:29:',
      /continue-on-error: true/,
    ],
    [
      'continue-on-error in an action',
      {
        '.github/actions/setup/action.yml':
          'runs:\n  using: composite\n  steps:\n    - run: pnpm install\n      shell: bash\n      continue-on-error: true\n',
      },
      'action.yml:6:',
      /continue-on-error/,
    ],
    [
      '|| true after pnpm',
      ci('run: pnpm test\n', 'run: pnpm test || true\n'),
      'ci.yml:16:',
      /'\|\| true'/,
    ],
    [
      '|| echo after pnpm',
      ci('run: pnpm test\n', 'run: pnpm test || echo failed\n'),
      'ci.yml:16:',
      /'\|\| echo'/,
    ],
    [
      '|| exit 0 after vitest',
      ci('run: pnpm lint\n', 'run: npx vitest run || exit 0\n'),
      'ci.yml:18:',
      /'\|\| exit 0'/,
    ],
    [
      '|| : after eslint',
      ci('run: pnpm lint\n', 'run: npx eslint . || :\n'),
      'ci.yml:18:',
      /'\|\| :'/,
    ],
    [
      '|| true after bash scripts/ci/',
      ci('run: upload-coverage\n', 'run: bash scripts/ci/secret-scan-range.sh || true\n'),
      'ci.yml:14:',
      /'\|\| true'/,
    ],
    [
      '|| : after node scripts/ci/',
      ci('run: upload-coverage\n', 'run: node scripts/ci/cli-typecheck-ratchet.mjs || :\n'),
      'ci.yml:14:',
      /'\|\| :'/,
    ],
    [
      '|| exit 0 after ./scripts/ci/',
      ci('run: upload-coverage\n', 'run: ./scripts/ci/check.sh || exit 0\n'),
      'ci.yml:14:',
      /'\|\| exit 0'/,
    ],
    [
      'set +e',
      { 'scripts/ci/check.sh': '#!/usr/bin/env bash\nset +e\nset -euo pipefail\nrun-check\n' },
      'check.sh:2:',
      /'set \+e'/,
    ],
    [
      'set +eu',
      { 'scripts/ci/check.sh': CHECK_SH.replace('run-check', 'set +eu\nrun-check') },
      'check.sh:3:',
      /'set \+eu'/,
    ],
    [
      'set +x +e',
      { 'scripts/ci/check.sh': CHECK_SH.replace('run-check', 'set +x +e\nrun-check') },
      'check.sh:3:',
      /'set \+e'/,
    ],
    [
      'set +o errexit',
      { 'scripts/ci/check.sh': CHECK_SH.replace('run-check', 'set +o errexit\nrun-check') },
      'check.sh:3:',
      /'set \+o errexit'/,
    ],
    [
      '-e dropped from set -euo pipefail',
      { 'scripts/ci/check.sh': CHECK_SH.replace('set -euo', 'set -uo') },
      'check.sh:0:',
      /removed errexit \(main's line 2\)/,
    ],
    [
      'passWithNoTests',
      ci('run: pnpm test\n', 'run: pnpm test --passWithNoTests\n'),
      'ci.yml:16:',
      /passWithNoTests/,
    ],
    [
      'step if: false',
      ci('      - name: Unit\n', '      - name: Unit\n        if: false\n'),
      'ci.yml:16:',
      /'if: false'/,
    ],
    [
      "step if: 'false'",
      ci('      - name: Lint\n', "      - name: Lint\n        if: 'false'\n"),
      'ci.yml:18:',
      /'if: false'/,
    ],
    [
      'step if: false # comment',
      ci('      - name: Lint\n', '      - name: Lint\n        if: false # off for now\n'),
      'ci.yml:18:',
      /'if: false'/,
    ],
    [
      'step if : false (space before the colon)',
      ci('      - name: Lint\n', '      - name: Lint\n        if : false\n'),
      'ci.yml:18:',
      /'if: false'/,
    ],
    [
      'step "if": false',
      ci('      - name: Lint\n', '      - name: Lint\n        "if": false\n'),
      'ci.yml:18:',
      /'if: false'/,
    ],
    [
      'job if: ${{ false }}',
      ci('    name: Extras\n', '    name: Extras\n    if: ${{ false }}\n'),
      'ci.yml:26:',
      /'if: false'/,
    ],
    [
      'exit 0 ending a run block',
      ci('          echo extras\n', '          echo extras\n          exit 0\n'),
      'ci.yml:34:',
      /'exit 0' ends the run block/,
    ],
    [
      'if: added to a required job',
      ci('    name: Unit Tests\n', "    name: Unit Tests\n    if: github.actor != 'x'\n"),
      'ci.yml:10:',
      /job-level if: on required job 'Unit Tests'/,
    ],
  ])('fails an added %s', (_what, files, where, reason) => {
    const res = guard(files);
    expect(res.status).toBe(1);
    expect(res.out).toContain(where);
    expect(res.out).toMatch(reason);
  });

  it('passes a swallowed failure on a line that runs no test/lint/build tool', () => {
    const res = guard(ci('run: upload-coverage\n', 'run: gh api repos/x || true\n'));
    expect(res.status).toBe(0);
  });

  it('passes || true on a line that only names a scripts/ci/ path', () => {
    const res = guard(ci('run: upload-coverage\n', 'run: rm -f scripts/ci/tmp.log || true\n'));
    expect(res.status).toBe(0);
  });

  it('passes an exit 0 inside the block, an if: on a job no check needs, and an explicit false', () => {
    const files = ci(
      '    name: Extras\n',
      "    name: Extras\n    if: github.event_name == 'push'\n    continue-on-error: false\n"
    );
    files['.github/workflows/ci.yml'] = files['.github/workflows/ci.yml']
      .replace(
        '      - run: pnpm extras\n',
        "      - run: pnpm extras\n        continue-on-error: 'False'\n"
      )
      .replace(
        '      - name: Lint\n',
        '      - name: Lint\n        continue-on-error: ${{ false }}\n'
      );
    files['.github/workflows/ci.yml'] = files['.github/workflows/ci.yml'].replace(
      '          echo extras\n',
      '          if [ -n "$Y" ]; then\n            exit 0\n          fi\n          echo extras\n'
    );
    const res = guard(files);
    expect(res.status).toBe(0);
  });

  it('ignores full-line comments and files outside the gate trees', () => {
    const res = guard({
      ...ci(
        '      - name: Unit\n',
        '      # never write `pnpm test || true` or continue-on-error: true here\n      - name: Unit\n'
      ),
      'src/app.sh': 'pnpm test || true\nset +e\n',
    });
    expect(res.status).toBe(0);
  });

  it('fails a path filter under pull_request in a merge-queue workflow, not under push or elsewhere', () => {
    const pr = guard(ci('  pull_request:\n', "  pull_request:\n    paths: ['src/**']\n"));
    expect(pr.status).toBe(1);
    expect(pr.out).toMatch(/ci\.yml:6: path filter on a merge-queue workflow/);

    git(['reset', '-q', '--hard', 'HEAD^']);
    const push = guard(
      ci('    branches: [main]\n', "    branches: [main]\n    paths: ['src/**']\n")
    );
    expect(push.status).toBe(0);

    git(['reset', '-q', '--hard', 'HEAD^']);
    const nightly = guard({
      '.github/workflows/nightly.yml': NIGHTLY.replace(
        '  schedule:\n',
        '  pull_request:\n    paths-ignore: [docs/**]\n  schedule:\n'
      ),
    });
    expect(nightly.status).toBe(0);
  });

  it('fails when a required check loses its job, including a matrix one', () => {
    const unit = guard(ci('    name: Unit Tests\n', '    name: Unit Tests (fast)\n'));
    expect(unit.status).toBe(1);
    expect(unit.out).toMatch(/required check 'Unit Tests' .* no longer has a job/);

    git(['reset', '-q', '--hard', 'HEAD^']);
    const matrix = guard(ci('/3)', '/4)'));
    expect(matrix.status).toBe(1);
    expect(matrix.out).toMatch(/required check 'Integration Tests \(1\/3\)'/);

    git(['reset', '-q', '--hard', 'HEAD^']);
    const other = guard({}, { removed: ['.github/workflows/build.yml'] });
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

  it('fails a test/lint step deleted from a required job, not one moved or deleted elsewhere', () => {
    const removed = guard(ci('      - name: Lint\n        run: pnpm lint\n', ''));
    expect(removed.status).toBe(1);
    expect(removed.out).toMatch(
      /removed 'run: pnpm lint' \(main's line 18\) from required job 'Unit Tests'/
    );

    git(['reset', '-q', '--hard', 'HEAD^']);
    const moved = guard(
      ci(
        '      - name: Unit\n        run: pnpm test\n      - name: Lint\n        run: pnpm lint\n',
        '      - name: Lint\n        run: pnpm lint\n      - name: Unit\n        run: pnpm test\n'
      )
    );
    expect(moved.status).toBe(0);

    git(['reset', '-q', '--hard', 'HEAD^']);
    const elsewhere = guard(ci('      - run: pnpm extras\n', ''));
    expect(elsewhere.status).toBe(0);
  });

  it('fails the gate guard step itself being deleted from a required job', () => {
    const step = '      - run: bash scripts/ci/gate-files-guard.sh HEAD^1 HEAD\n';
    const withStep = ci('        run: pnpm lint\n', `        run: pnpm lint\n${step}`);
    guard(withStep);
    const res = guard({ '.github/workflows/ci.yml': CI });
    expect(res.status).toBe(1);
    expect(res.out).toMatch(
      /removed '- run: bash scripts\/ci\/gate-files-guard\.sh HEAD\^1 HEAD' .* 'Unit Tests'/
    );
  });

  it('fails a test step moved from a required job into a job no check needs', () => {
    const files = ci('      - name: Lint\n        run: pnpm lint\n', '');
    files['.github/workflows/ci.yml'] = files['.github/workflows/ci.yml'].replace(
      '      - run: pnpm extras\n',
      '      - run: pnpm extras\n      - name: Lint\n        run: pnpm lint\n'
    );
    const res = guard(files);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(
      /removed 'run: pnpm lint' \(main's line 18\) from required job 'Unit Tests'/
    );
  });

  it('fails a scripts/ci/ run line (the secret scan) deleted from a required job', () => {
    const scan = '      - run: bash scripts/ci/secret-scan-range.sh\n';
    guard(ci('        run: pnpm lint\n', `        run: pnpm lint\n${scan}`));
    const res = guard({ '.github/workflows/ci.yml': CI });
    expect(res.status).toBe(1);
    expect(res.out).toMatch(
      /removed '- run: bash scripts\/ci\/secret-scan-range\.sh' \(main's line 19\) from required job 'Unit Tests'/
    );
  });

  it('fails a need dropped from a required job, in either list form', () => {
    guard(ci('    name: Unit Tests\n', '    name: Unit Tests\n    needs: [setup, shards]\n'));
    const flow = guard(ci('    name: Unit Tests\n', '    name: Unit Tests\n    needs: [setup]\n'));
    expect(flow.status).toBe(1);
    expect(flow.out).toMatch(/required job 'Unit Tests' no longer needs 'shards'/);
    expect(flow.out).not.toMatch(/no longer needs 'setup'/);

    git(['reset', '-q', '--hard', 'HEAD^']);
    guard(
      ci(
        '    name: Unit Tests\n',
        '    name: Unit Tests\n    needs:\n      - setup\n      - shards\n'
      )
    );
    const block = guard(ci('    name: Unit Tests\n', '    name: Unit Tests\n    needs: setup\n'));
    expect(block.status).toBe(1);
    expect(block.out).toMatch(/required job 'Unit Tests' no longer needs 'shards'/);
  });

  it('passes needs reordered, reformatted or added to, and a need dropped from a job no check needs', () => {
    guard({
      '.github/workflows/ci.yml': CI.replace(
        '    name: Unit Tests\n',
        '    name: Unit Tests\n    needs: [setup, shards]\n'
      ).replace('    name: Extras\n', '    name: Extras\n    needs: [setup, shards]\n'),
    });
    const res = guard({
      '.github/workflows/ci.yml': CI.replace(
        '    name: Unit Tests\n',
        "    name: Unit Tests\n    needs:\n      - 'shards'\n      - lint # new\n      - setup\n"
      ).replace('    name: Extras\n', '    name: Extras\n    needs: setup\n'),
    });
    expect(res.status).toBe(0);
  });
});

describe('gate-files-guard.sh: what runs before or around the guard', () => {
  // A job no check needs, so only the guard's-job rules can catch these.
  const GATES = [
    '  gates:',
    '    name: Gates',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Checkout',
    '        uses: actions/checkout@v4',
    '        with:',
    '          fetch-depth: 0',
    '      - name: Gate files guard',
    "        if: github.event_name == 'pull_request'",
    '        run: bash "$RUNNER_TEMP/gate-files-guard.sh" HEAD^1 HEAD',
    '      - run: pnpm gates',
    '',
  ].join('\n');
  const BASE_CI = CI + GATES;
  const edit = (...pairs: [string, string][]) => {
    let body = BASE_CI;
    for (const [from, to] of pairs) {
      if (!body.includes(from)) throw new Error(`fixture has no ${from}`);
      body = body.replace(from, to);
    }
    return { '.github/workflows/ci.yml': body };
  };
  const FETCH = '          fetch-depth: 0\n';
  const GATES_NAME = '    name: Gates\n';
  const GUARD_STEP = '      - name: Gate files guard\n';

  beforeEach(() => {
    guard({ '.github/workflows/ci.yml': BASE_CI });
  });

  it.each<[string, Record<string, string>, RegExp]>([
    [
      'the checkout of the PR head commit',
      edit([FETCH, `${FETCH}          ref: \${{ github.event.pull_request.head.sha }}\n`]),
      /ci\.yml:42: a checkout of another ref in the guard's job/,
    ],
    [
      'the checkout of another repository',
      edit([FETCH, `${FETCH}          repository: someone/fork\n`]),
      /ci\.yml:42: a checkout of another ref in the guard's job/,
    ],
    [
      'a step ahead of the guard',
      edit([GUARD_STEP, `      - run: git reset -q --hard HEAD~1\n${GUARD_STEP}`]),
      /ci\.yml:42: a step ahead of the gate files guard/,
    ],
    [
      'job-level defaults.run.shell: true {0}',
      edit([GATES_NAME, `${GATES_NAME}    defaults:\n      run:\n        shell: true {0}\n`]),
      /ci\.yml:36: defaults: on the job that runs the gate files guard/,
    ],
    [
      'workflow-level defaults.run.shell: true {0}',
      edit(['jobs:\n', 'defaults:\n  run:\n    shell: true {0}\njobs:\n']),
      /ci\.yml:9: defaults: at workflow level/,
    ],
    [
      'workflow-level defaults.run.working-directory',
      edit(['jobs:\n', 'defaults: { run: { working-directory: sub } }\njobs:\n']),
      /ci\.yml:7: defaults: at workflow level/,
    ],
    [
      'job-level env: BASH_ENV',
      edit([GATES_NAME, `${GATES_NAME}    env:\n      BASH_ENV: ./x.sh\n`]),
      /ci\.yml:37: env: on the job that runs the gate files guard/,
    ],
    [
      'job-level container',
      edit([GATES_NAME, `${GATES_NAME}    container: someone/image\n`]),
      /ci\.yml:36: container: on the job that runs the gate files guard/,
    ],
    [
      'workflow-level env: BASH_ENV',
      edit(['jobs:\n', 'env:\n  BASH_ENV: ./x.sh\njobs:\n']),
      /ci\.yml:8: workflow env that bash or git reads/,
    ],
    [
      'workflow-level env: an exported bash function',
      edit(['jobs:\n', "env:\n  'BASH_FUNC_git%%': '() { :; }'\njobs:\n"]),
      /ci\.yml:8: workflow env that bash or git reads/,
    ],
    [
      'workflow-level env: { PATH } in flow style',
      edit(['jobs:\n', 'env: { NODE_VERSION: 22, PATH: ./bin }\njobs:\n']),
      /ci\.yml:7: workflow env that bash or git reads/,
    ],
    [
      'shell: true {0} on the guard step',
      edit([GUARD_STEP, `${GUARD_STEP}        shell: true {0}\n`]),
      /'Gate files guard' step changed/,
    ],
  ])('fails %s', (_what, files, reason) => {
    const res = guard(files);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(reason);
  });

  it('fails the guard step moved, unchanged, into another job', () => {
    const step = [
      GUARD_STEP,
      "        if: github.event_name == 'pull_request'\n",
      '        run: bash "$RUNNER_TEMP/gate-files-guard.sh" HEAD^1 HEAD\n',
    ].join('');
    const res = guard(
      edit([step, ''], ['      - run: pnpm extras\n', `${step}      - run: pnpm extras\n`])
    );
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/step moved from job gates to job extras/);
  });

  it('passes shell, env, defaults and checkout refs on other jobs, and safe env at workflow level', () => {
    const res = guard(
      edit(
        ['jobs:\n', 'env:\n  NODE_VERSION: 22\n  NODE_ENV: test\njobs:\n'],
        [
          '    name: Extras\n',
          '    name: Extras\n    defaults:\n      run:\n        shell: bash\n    env:\n      BASH_ENV: ./x.sh\n',
        ],
        [
          '      - run: pnpm extras\n',
          '      - uses: actions/checkout@v4\n        with:\n          ref: other\n        shell: sh\n      - run: pnpm extras\n',
        ]
      )
    );
    expect(res.out).toMatch(/nothing that switches a gate off/);
    expect(res.status).toBe(0);
  });

  it('passes the usual job keys on the guard job and a step after the guard', () => {
    const res = guard(
      edit(
        [
          '    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout',
          '    runs-on: ubuntu-latest\n    timeout-minutes: 15\n    needs: setup\n    permissions:\n      issues: read\n    steps:\n      - name: Checkout',
        ],
        [
          '      - run: pnpm gates\n',
          '      - run: pnpm gates\n      - run: git reset -q --hard HEAD~1\n        shell: sh\n        env:\n          BASH_ENV: x\n',
        ]
      )
    );
    expect(res.out).toMatch(/nothing that switches a gate off/);
    expect(res.status).toBe(0);
  });
});

describe('gate-files-guard.sh: files bigger than a pipe buffer', () => {
  // A reader that stops early (grep -q, awk exit) used to kill `git show` with
  // SIGPIPE once a file outgrew the 64 KB pipe buffer, and pipefail turned that
  // into a dropped finding or a made-up one, a few runs in four. Each case runs
  // the guard five times on the same commit.
  const FILLER = Array.from(
    { length: 4000 },
    (_, i) => `      - run: echo filler step ${i} padding the file past the pipe buffer\n`
  ).join('');
  const BIG_JOB = `  filler:\n    name: Filler\n    runs-on: x\n    steps:\n${FILLER}`;
  const RUNS = 5;
  const statuses = () => Array.from({ length: RUNS }, () => rerun().status);

  it('fails a path filter under pull_request every time', () => {
    guard({ '.github/workflows/ci.yml': CI + BIG_JOB });
    guard({
      '.github/workflows/ci.yml': (CI + BIG_JOB).replace(
        '  pull_request:\n',
        "  pull_request:\n    paths: ['src/**']\n"
      ),
    });
    expect(rerun().out).toMatch(/ci\.yml:6: path filter on a merge-queue workflow/);
    expect(statuses()).toEqual(Array(RUNS).fill(1));
  });

  it('fails an exit 0 ending a run block and a change to the guard step every time', () => {
    const step =
      "      - name: Gate files guard\n        if: github.event_name == 'pull_request'\n        run: bash guard.sh\n";
    const base =
      CI.replace('      - run: pnpm extras\n', `${step}      - run: pnpm extras\n`) + BIG_JOB;
    guard({ '.github/workflows/ci.yml': base });
    guard({
      '.github/workflows/ci.yml': base
        .replace('          echo extras\n', '          echo extras\n          exit 0\n')
        .replace("'pull_request'\n", "'never'\n"),
    });
    const out = rerun().out;
    expect(out).toMatch(/'exit 0' ends the run block/);
    expect(out).toMatch(/'Gate files guard' step changed/);
    expect(statuses()).toEqual(Array(RUNS).fill(1));
  });

  it('passes set -e kept in a big script, and a step moved within a big required job, every time', () => {
    const script = `#!/usr/bin/env bash\nset -euo pipefail\n${'echo filler line padding the script past the pipe buffer\n'.repeat(4000)}`;
    const unit = CI.replace('        run: pnpm test\n', `        run: pnpm test\n${FILLER}`);
    guard({ 'scripts/ci/check.sh': script, '.github/workflows/ci.yml': unit });
    guard({
      'scripts/ci/check.sh': script.replace('set -euo', 'set -eo'),
      '.github/workflows/ci.yml': unit
        .replace('      - name: Lint\n        run: pnpm lint\n', '')
        .replace(
          '      - name: Coverage upload\n',
          '      - name: Lint\n        run: pnpm lint\n      - name: Coverage upload\n'
        ),
    });
    expect(statuses()).toEqual(Array(RUNS).fill(0));
  });
});

describe('gate-files-guard.sh: the Gate files guard step', () => {
  // In a job no check needs, so only the step comparison can catch these.
  const STEP = [
    '      - name: Gate files guard',
    "        if: github.event_name == 'pull_request'",
    '        run: |',
    '          git show HEAD^1:scripts/ci/gate-files-guard.sh >"$RUNNER_TEMP/gate-files-guard.sh"',
    '          bash "$RUNNER_TEMP/gate-files-guard.sh" HEAD^1 HEAD',
    '',
  ].join('\n');
  const withStep = (step: string) =>
    ci('      - run: pnpm extras\n', `${step}      - run: pnpm extras\n`);

  beforeEach(() => {
    guard(withStep(STEP));
  });

  it('passes an unrelated change while the step stays as on main', () => {
    const files = withStep(STEP);
    files['.github/workflows/ci.yml'] = files['.github/workflows/ci.yml'].replace(
      'run: upload-coverage',
      'run: upload-coverage --retry 3'
    );
    expect(guard(files).status).toBe(0);
  });

  it.each([
    [
      'only the bash line deleted',
      STEP.replace(/ {10}bash .*\n/, ''),
      /'Gate files guard' step changed/,
    ],
    [
      "its if: changed to github.event_name == 'never'",
      STEP.replace("'pull_request'", "'never'"),
      /'Gate files guard' step changed/,
    ],
    ['the step deleted', '', /'Gate files guard' step is gone/],
    [
      'the step renamed',
      STEP.replace('Gate files guard', 'Gate guard'),
      /'Gate files guard' step is gone/,
    ],
  ])('fails with %s', (_what, step, reason) => {
    const res = guard(withStep(step));
    expect(res.status).toBe(1);
    expect(res.out).toMatch(reason);
  });
});

describe('gate-files-guard.sh: .gitattributes', () => {
  it('still sees continue-on-error in a file marked -diff, and flags the attribute', () => {
    const res = guard({ ...ADD_COE, '.gitattributes': '.github/workflows/ci.yml -diff\n' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('.github/workflows/ci.yml:16: continue-on-error: true');
    expect(res.out).toMatch(/\.gitattributes:1: attribute on CI files/);
  });

  it('ignores a textconv driver that would rewrite the diff', () => {
    const res = guard(
      { ...ADD_COE, '.gitattributes': '*.yml diff=hide\n' },
      {
        env: {
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'diff.hide.textconv',
          GIT_CONFIG_VALUE_0: 'true',
        },
      }
    );
    expect(res.out).toContain('.github/workflows/ci.yml:16: continue-on-error: true');
    expect(res.out).toMatch(/\.gitattributes:1: attribute on CI files/);
  });

  it('passes merge=union on a file outside the CI trees (#2314)', () => {
    const res = guard({
      '.gitattributes': '# union\nsrc/config/env-read-names.generated.ts merge=union\n',
    });
    expect(res.status).toBe(0);
  });
});

describe('gate-files-guard.sh: the ci-gate-change-ok label', () => {
  it('passes when a person added the label after the run started, and asks gh for both', () => {
    events(labelled());
    const res = guard(ADD_COE);
    expect(res.status).toBe(0);
    expect(res.out).toContain('.github/workflows/ci.yml:16:');
    expect(res.out).toMatch(/approved by the ci-gate-change-ok label/);
  });

  it.each<[string, Event[]]>([
    ['added before the run started (a push since)', [labelled('2026-05-31T23:59:59Z')]],
    ['added by an app', [labelled(undefined, 'Bot')]],
    [
      'added then removed',
      [labelled(), { event: 'unlabeled', label: 'ci-gate-change-ok', at: '2026-06-03T00:00:00Z' }],
    ],
    [
      'a look-alike label',
      [{ event: 'labeled', label: 'ci-gate-change-ok-not', at: '2026-06-02T00:00:00Z' }],
    ],
    ['no label at all', []],
  ])('fails with the label %s', (_what, list) => {
    events(...list);
    expect(guard(ADD_COE).status).toBe(1);
  });

  it.each([
    ['future-dated', '2099-01-01T00:00:00Z'],
    ['backdated', '2000-01-01T00:00:00Z'],
  ])('ignores a %s commit: a label from before the run stays stale', (_what, date) => {
    events(labelled('2026-05-31T00:00:00Z'));
    const res = guard(ADD_COE, { commitEnv: { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } });
    expect(res.status).toBe(1);
  });

  it('fails closed when the run cannot be read', () => {
    events(labelled());
    expect(guard(ADD_COE, { env: { GITHUB_RUN_ID: '' } }).status).toBe(1);
    git(['reset', '-q', '--hard', 'HEAD^']);
    expect(guard(ADD_COE, { env: { GITHUB_RUN_ID: '98' } }).status).toBe(1);
  });

  it('writes GitHub annotations under Actions: error with a line, file-level for line 0', () => {
    const res = guard(
      { ...ADD_COE, 'scripts/ci/check.sh': CHECK_SH.replace('set -euo', 'set -uo') },
      { env: { GITHUB_ACTIONS: 'true' } }
    );
    expect(res.status).toBe(1);
    expect(res.out).toContain(
      '::error file=.github/workflows/ci.yml,line=16::.github/workflows/ci.yml:16: continue-on-error'
    );
    expect(res.out).toContain(
      '::error file=scripts/ci/check.sh::scripts/ci/check.sh:0: removed errexit'
    );
  });

  it('writes warnings instead of errors when approved', () => {
    events(labelled());
    const res = guard(ADD_COE, { env: { GITHUB_ACTIONS: 'true' } });
    expect(res.status).toBe(0);
    expect(res.out).toContain('::warning file=.github/workflows/ci.yml,line=16::');
  });
});
