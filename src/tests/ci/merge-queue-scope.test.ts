/**
 * Merge-queue scoping must cover every PR the queue merges on a group's verdict.
 *
 * 2026-10-19: pr-changes compared a group from merge_group.base_sha. Past the first
 * queue entry that is the group ahead's temporary commit, so the compare listed only
 * the last PR's files (#1988's six iOS files), Lint, Frontend Quality and Unit Tests
 * were skipped (a skipped job reports success), and the queue merged the seven PRs
 * ahead on that verdict, #2027 among them with its own group red. Then queue-tested
 * trusted that "successful" run and skipped the suite on the push to main too.
 *
 * These tests run the actions' real `run:` scripts, with their real env wiring, against
 * a fake `gh` that answers the GitHub API from fixtures and applies the --jq for real.
 * They run them the way the runner runs a `shell: bash` step: `bash -e -o pipefail`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { inPaths, loadPolicy } from '../../../scripts/ci/autonomy-lanes.js';
import {
  crisisLaneInclude,
  DECIDES_THE_SUITE,
  DECIDES_THE_SWEEP,
  EVERY_PATH,
} from '../../../scripts/ci/crisis-lane-include.js';

const ROOT = join(__dirname, '..', '..', '..');

/** The composite action's one step: its env (KEY -> ${{ expression }}) and run script. */
function actionStep(name: string): { env: Record<string, string>; run: string } {
  const lines = readFileSync(join(ROOT, `.github/actions/${name}/action.yml`), 'utf8').split('\n');
  if (!lines.includes('      shell: bash')) throw new Error(`${name}: not a shell: bash step`);
  const envAt = lines.findIndex((l) => l === '      env:');
  const runAt = lines.findIndex((l) => l === '      run: |');
  if (envAt < 0 || runAt < envAt) throw new Error(`${name}: env/run not found`);
  const env: Record<string, string> = {};
  for (const l of lines.slice(envAt + 1, runAt)) {
    const m = /^ {8}([A-Z_]+): \$\{\{ (.+) \}\}$/.exec(l);
    if (!m) throw new Error(`${name}: unreadable env line: ${l}`);
    env[m[1]] = m[2];
  }
  const run = lines
    .slice(runAt + 1)
    .filter((l, i, all) => all.slice(0, i + 1).every((x) => x === '' || x.startsWith('        ')))
    .map((l) => l.slice(8))
    .join('\n');
  return { env, run };
}

// The runner's command for a `shell: bash` step. Plain `bash -c` hid #3729: under
// pipefail, a reader that exits early (head) fails the step when its writer is cut off.
const RUNNER_BASH = ['--noprofile', '--norc', '-e', '-o', 'pipefail'];

/** API path -> JSON the fake gh serves; anything else fails like an API error. */
type Api = Record<string, unknown>;

const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
[ "$1" = api ] || exit 1
path=$2; shift 2; jq_expr=.
while [ $# -gt 0 ]; do case $1 in --jq) jq_expr=$2; shift 2;; *) shift;; esac; done
key=$(printf '%s' "$path" | sed 's/[^A-Za-z0-9]/_/g')
[ -f "$FIXTURES/$key" ] || { echo "HTTP 404: $path" >&2; exit 1; }
jq -r "$jq_expr" "$FIXTURES/$key"
`;

function runAction(name: string, context: Record<string, string>, api: Api) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  const bin = join(dir, 'bin');
  execFileSync('mkdir', ['-p', bin, join(dir, 'fixtures')]);
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  chmodSync(join(bin, 'gh'), 0o755);
  for (const [path, json] of Object.entries(api)) {
    writeFileSync(join(dir, 'fixtures', path.replace(/[^A-Za-z0-9]/g, '_')), JSON.stringify(json));
  }
  const { env, run } = actionStep(name);
  const resolved: Record<string, string> = {};
  for (const [key, expr] of Object.entries(env)) {
    if (!(expr in context)) throw new Error(`${name}: no test value for \${{ ${expr} }}`);
    resolved[key] = context[expr];
  }
  const out = join(dir, 'output');
  writeFileSync(out, '');
  const log = join(dir, 'gh.log');
  writeFileSync(log, '');
  const stdout = execFileSync('bash', [...RUNNER_BASH, '-c', run], {
    env: {
      ...resolved,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_OUTPUT: out,
      GH_LOG: log,
      FIXTURES: join(dir, 'fixtures'),
    },
    encoding: 'utf8',
  });
  const outputs = Object.fromEntries(
    readFileSync(out, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('=') as [string, string])
  );
  return { outputs, ghCalls: readFileSync(log, 'utf8'), stdout };
}

// A queue of two: group 1 = main + #A (src/ change), group 2 = group 1 + #B (iOS only).
const GROUP_AHEAD = 'f48dec50e5153d8488a44a6f5d8a9838525304c1';
const HEAD = 'c6986fa6b2b13a94305cc8251e70a731d35144ea';
const files = (...names: string[]) => ({ files: names.map((filename) => ({ filename })) });
const QUEUE_API: Api = {
  [`repos/o/r/compare/main...${HEAD}`]: files(
    'src/ui/text-token.ts',
    'apps/ios-native/Sources/A.swift'
  ),
  [`repos/o/r/compare/${GROUP_AHEAD}...${HEAD}`]: files('apps/ios-native/Sources/A.swift'),
};
const group = (inputs: Record<string, string>, baseRef = 'refs/heads/main') => ({
  'github.token': 't',
  'github.event_name': 'merge_group',
  'github.repository': 'o/r',
  'github.event.pull_request.number': '',
  'github.event.merge_group.base_sha': GROUP_AHEAD,
  'github.event.merge_group.base_ref': baseRef,
  'github.event.merge_group.head_sha': HEAD,
  'inputs.merge-group': 'true',
  'inputs.include': '.',
  'inputs.exclude': '^$',
  ...inputs,
});

describe('pr-changes in the merge queue', () => {
  it('scopes from main, so a src change in the PR ahead still runs the Node checks', () => {
    const r = runAction('pr-changes', group({ 'inputs.exclude': '^apps/ios-native/' }), QUEUE_API);
    expect(r.ghCalls).toContain(`repos/o/r/compare/main...${HEAD}`);
    expect(r.ghCalls).not.toContain(GROUP_AHEAD);
    expect(r.outputs.matched).toBe('true');
  });

  it('still scopes: a group that changes no docs does not match docs', () => {
    const r = runAction('pr-changes', group({ 'inputs.include': '^docs/' }), QUEUE_API);
    expect(r.outputs.matched).toBe('false');
  });

  it('runs everything when it cannot scope (no target branch, API error, 300+ files)', () => {
    expect(
      runAction('pr-changes', group({ 'inputs.include': '^docs/' }, ''), QUEUE_API).outputs.matched
    ).toBe('true');
    expect(runAction('pr-changes', group({ 'inputs.include': '^docs/' }), {}).outputs.matched).toBe(
      'true'
    );
    const many = files(...Array.from({ length: 300 }, (_, i) => `apps/ios-native/f${i}.swift`));
    const big = { [`repos/o/r/compare/main...${HEAD}`]: many };
    expect(
      runAction('pr-changes', group({ 'inputs.include': '^docs/' }), big).outputs.matched
    ).toBe('true');
  });
});

// ci.yml's setup step `risky` (output full-tests) gives a PR that touches crisis-safety
// or memory code the whole unit suite on four shards. #2717 (crisis safety) went green
// on shard 1 alone, the affected tests only.
describe('pr-changes picks out PRs that touch crisis-safety or memory code', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const include = /^ {8}id: risky\n(?: {8}.*\n)*? {10}include: '([^']+)'$/m.exec(ci)?.[1] ?? '';
  const pr = (...names: string[]) =>
    runAction(
      'pr-changes',
      {
        'github.token': 't',
        'github.event_name': 'pull_request',
        'github.repository': 'o/r',
        'github.event.pull_request.number': '7',
        'github.event.merge_group.base_ref': '',
        'github.event.merge_group.head_sha': '',
        'inputs.merge-group': 'false',
        'inputs.include': include,
        'inputs.exclude': '^$',
      },
      { 'repos/o/r/pulls/7/files': names.map((filename) => ({ filename })) }
    ).outputs.matched;

  it('reads the include from ci.yml', () => {
    expect(include).toMatch(/^\^src\//);
  });

  it.each([
    'src/services/safety/crisis-detector.ts',
    'src/agents/personas/crisis-gate.ts',
    'src/agents/processors/turn-processor/turn-crisis.ts',
    'src/tools/domains/life-coaching-shared/safety-guards.ts',
    'src/memory/recall/forget.ts',
    'src/services/memory/recent-context.ts',
    'src/utils/safety-whole-word.ts',
    'src/utils/phrase-match.ts',
  ])('%s is risky', (file) => {
    expect(pr('docs/readme.md', file)).toBe('true');
  });

  it.each([
    'src/services/safety-net.ts',
    'src/agents/personas/ferni.json',
    'src/tools/domains/life-coaching-shared/safety-guards.test.ts.snap',
    'src/memoryless.ts',
    'src/ui/memory/card.tsx',
    'docs/memory/design.md',
    'apps/web/src/memory/view.tsx',
  ])('%s is not', (file) => {
    expect(pr('src/ui/text-token.ts', file)).toBe('false');
  });
});

// #3967: 258 crisis-lane files (autonomy-policy.json) were outside `risky`'s hand-kept list,
// and #3956 went green on shard 1 alone with a red flag census. ci.yml now reads the lane's
// paths from the policy (scripts/ci/crisis-lane-include.ts) and fails closed to the full suite.
describe('every crisis-lane path gets the whole unit suite', () => {
  const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
  const include = crisisLaneInclude();
  const lane = loadPolicy().lanes.crisis.paths;
  const laneFiles = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && inPaths(f, lane));
  const pr = (inc: string, ...names: string[]) =>
    runAction(
      'pr-changes',
      {
        'github.token': 't',
        'github.event_name': 'pull_request',
        'github.repository': 'o/r',
        'github.event.pull_request.number': '7',
        'github.event.merge_group.base_ref': '',
        'github.event.merge_group.head_sha': '',
        'inputs.merge-group': 'false',
        'inputs.include': inc,
        'inputs.exclude': '^$',
      },
      { 'repos/o/r/pulls/7/files': names.map((filename) => ({ filename })) }
    ).outputs.matched;

  it('ci.yml derives the include and ORs it into full-tests and the affected-count skip', () => {
    expect(ci).toMatch(
      / {8}id: crisis-lane-paths\n(?: {8}.*\n)*? {10}if include=\$\(pnpm exec tsx scripts\/ci\/crisis-lane-include\.ts\)/
    );
    expect(ci).toMatch(
      / {8}id: crisis-lane\n(?: {8}.*\n)*? {10}include: \$\{\{ steps\.crisis-lane-paths\.outputs\.include \}\}\n/
    );
    expect(ci).toContain(
      "full-tests: ${{ steps.risky.outputs.matched == 'true' || steps.crisis-lane.outputs.matched == 'true' }}"
    );
    expect(ci).toContain("&& steps.crisis-lane.outputs.matched != 'true'\n");
  });

  it('grep -E matches every file in the crisis lane, as pr-changes greps', () => {
    expect(laneFiles.length).toBeGreaterThan(200);
    const r = spawnSync('grep', ['-Ev', '--', include], {
      input: `${laneFiles.join('\n')}\n`,
      encoding: 'utf8',
    });
    // 1 = no line left over (every file matched); 2 would be a pattern grep can't parse.
    expect({ status: r.status, missed: r.stdout.split('\n').filter(Boolean) }).toEqual({
      status: 1,
      missed: [],
    });
  });

  it.each([
    'src/agents/multi-agent/arrival-once.ts',
    'src/config/flags/CRISIS_CLASSIFIER_BLOCKED_SIGNAL.ts',
    'src/utils/minor-care.ts',
    'src/services/outreach/caller-text.ts',
    'scripts/ci/autonomy-policy.json',
  ])('%s gets the full suite', (file) => {
    expect(laneFiles).toContain(file);
    expect(pr(include, 'docs/readme.md', file)).toBe('true');
  });

  it('a PR outside the lane does not', () => {
    const outside = ['docs/readme.md', 'src/ui/text-token.ts', 'apps/web/src/memory/view.tsx'];
    expect(outside.filter((f) => inPaths(f, lane))).toEqual([]);
    expect(pr(include, ...outside)).toBe('false');
  });

  // #4332: crisis-sweep.yml's Detect step greps the same lane (crisis-lane-include.ts --sweep).
  it('a heavy-moment.ts change makes the Crisis Sweep detect a crisis change', () => {
    const sweep = crisisLaneInclude(undefined, DECIDES_THE_SWEEP);
    expect(pr(sweep, 'docs/readme.md', 'src/speech/adaptive-ssml/heavy-moment.ts')).toBe('true');
    expect(pr(sweep, 'docs/readme.md', '.github/workflows/ci.yml')).toBe('false');
  });

  // A PR can't narrow its own lane and dodge the full run in the same change.
  describe('what decides the suite always gets it, whatever the PR policy says', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crisis-lane-narrow-'));
    writeFileSync(join(dir, 'symbols.json'), JSON.stringify({ screened: [] }));
    writeFileSync(
      join(dir, 'narrow.json'),
      JSON.stringify({
        lanes: { crisis: { paths: ['src/elsewhere/only.ts'], symbolsFile: 'symbols.json' } },
      })
    );
    const narrow = crisisLaneInclude(join(dir, 'narrow.json'));

    it.each([
      ...DECIDES_THE_SUITE.filter((p) => !p.includes('*')),
      '.github/actions/pr-changes/action.yml',
    ])('%s', (file) => {
      expect(narrow).not.toBe(EVERY_PATH);
      expect(pr(narrow, 'docs/readme.md', file)).toBe('true');
    });

    it('and the narrow lane still leaves an unrelated PR alone', () => {
      expect(pr(narrow, 'docs/readme.md', 'src/ui/text-token.ts')).toBe('false');
    });
  });

  describe('fails closed to the full suite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'crisis-lane-'));
    it.each([
      ['a missing policy', join(dir, 'missing.json')],
      [
        'an unparseable policy',
        (writeFileSync(join(dir, 'bad.json'), '{ "lanes": '), join(dir, 'bad.json')),
      ],
      [
        'a lane with no paths',
        (writeFileSync(
          join(dir, 'empty.json'),
          JSON.stringify({ lanes: { crisis: { paths: [], symbolsFile: 'empty.json' } } })
        ),
        join(dir, 'empty.json')),
      ],
    ])('%s: every path', (_why, path) => {
      expect(crisisLaneInclude(path)).toBe(EVERY_PATH);
      expect(pr(crisisLaneInclude(path), 'docs/readme.md')).toBe('true');
    });

    it('the ci.yml step writes "." when the script fails or prints nothing', () => {
      const run = /^ {8}id: crisis-lane-paths\n(?: {8}.*\n)*? {8}run: \|\n((?: {10}.*\n)+)/m
        .exec(ci)?.[1]
        .replace(/^ {10}/gm, '');
      expect(run).toBeTruthy();
      for (const pnpm of ['exit 1', 'exit 0']) {
        const bin = mkdtempSync(join(dir, 'bin-'));
        writeFileSync(join(bin, 'pnpm'), `#!/usr/bin/env bash\n${pnpm}\n`);
        chmodSync(join(bin, 'pnpm'), 0o755);
        const out = join(bin, 'out');
        writeFileSync(out, '');
        execFileSync('bash', [...RUNNER_BASH, '-c', run!], {
          env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: out },
          stdio: 'pipe',
        });
        expect(readFileSync(out, 'utf8')).toBe('include=.\n');
      }
    });

    it('an empty include (the step never wrote one) still matches every path', () => {
      expect(pr('', 'docs/readme.md')).toBe('true');
    });
  });
});

// #3729 (473 changed paths): the step printed its first matches with `printf | head -5`.
// head exited, printf hit a broken pipe, pipefail failed the step, Setup failed, and
// every unit shard was skipped.
describe('pr-changes on a pull request with many changed files', () => {
  it('still matches, exits 0 and prints the first five paths', () => {
    const names = Array.from({ length: 20000 }, (_, i) => `src/services/area-${i}/module-file.ts`);
    const r = runAction(
      'pr-changes',
      {
        'github.token': 't',
        'github.event_name': 'pull_request',
        'github.repository': 'o/r',
        'github.event.pull_request.number': '7',
        'github.event.merge_group.base_ref': '',
        'github.event.merge_group.head_sha': '',
        'inputs.merge-group': 'false',
        'inputs.include': '^src/',
        'inputs.exclude': '^$',
      },
      { 'repos/o/r/pulls/7/files': names.map((filename) => ({ filename })) }
    );
    expect(r.outputs.matched).toBe('true');
    expect(r.stdout).toMatch(/Matched +20000 of +20000 changed paths, e\.g\.:\n/);
    expect(r.stdout).toContain(`e.g.:\n${names.slice(0, 5).join('\n')}\n`);
  });
});

describe('queue-tested on the push to main', () => {
  const push = {
    'github.token': 't',
    'github.event_name': 'push',
    'github.ref': 'refs/heads/main',
    'github.sha': 'pushsha',
    'github.repository': 'o/r',
    'github.server_url': 'https://github.com',
  };
  const jobs = (conclusion: string) => ({
    jobs: ['Lint & Type Check', 'Unit Tests', 'Frontend Quality', 'Security Scan'].map((name) => ({
      name,
      conclusion: name === 'Security Scan' ? 'success' : conclusion,
    })),
  });
  const api = (conclusion: string): Api => ({
    'repos/o/r/git/commits/pushsha': { tree: { sha: 'tree1' } },
    'repos/o/r/git/commits/queuehead': { tree: { sha: 'tree1' } },
    'repos/o/r/actions/workflows/ci.yml/runs?event=merge_group&status=success&per_page=30': {
      workflow_runs: [{ id: 101, head_sha: 'queuehead', conclusion: 'success' }],
    },
    'repos/o/r/actions/runs/101/jobs?per_page=100': jobs(conclusion),
  });

  it('trusts a queue run on this tree whose Node suite ran and passed', () => {
    expect(runAction('queue-tested', push, api('success')).outputs).toMatchObject({
      tested: 'true',
      run_id: '101',
    });
  });

  it('does not trust a "successful" queue run that skipped the Node suite', () => {
    expect(runAction('queue-tested', push, api('skipped')).outputs.tested).toBe('false');
  });
});
