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
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

/** The composite action's one step: its env (KEY -> ${{ expression }}) and run script. */
function actionStep(name: string): { env: Record<string, string>; run: string } {
  const lines = readFileSync(join(ROOT, `.github/actions/${name}/action.yml`), 'utf8').split('\n');
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
  const stdout = execFileSync('bash', ['-c', run], {
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
