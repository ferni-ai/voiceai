/**
 * The prod web deploy never moves production backwards
 * (scripts/ci/deploy-forward-guard.sh, run by deploy-production.yml).
 * workflow_run events can arrive out of order, and an old CI run can be re-run:
 * either would deploy an older commit over a newer one. An intentional rollback
 * (manual dispatch from main with allow_older and a reason, for a commit on
 * main) must still go through.
 *
 * Runs the real script in a throwaway git repo with stand-in `gh` and `gcloud`
 * binaries. `gh api .../compare/A...B` answers from the repo's real commit
 * graph, the way GitHub's compare API does. `gcloud` reports the BUILD_SHA of
 * the revision serving traffic.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jobs, running } from './workflow-jobs.js';

const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts/ci/deploy-forward-guard.sh');
const FAST_PATH = join(ROOT, 'scripts/ci/queue-fast-path.sh');
const FREEZE = join(ROOT, 'scripts/ci/deploy-freeze.sh');
const CONFIRM = join(ROOT, 'scripts/ci/confirm-rollback-traffic.sh');
const CHECKS = join(ROOT, 'scripts/ci/required-checks.sh');
const VERDICT = join(ROOT, 'scripts/ci/queue-verdict.sh');

const REQUIRED_CI = [
  'Lint & Type Check',
  'Frontend Quality',
  'Unit Tests',
  'Integration Tests (1/3)',
  'Integration Tests (2/3)',
  'Integration Tests (3/3)',
  'Quality Gates (Blocking)',
  'Security Scan',
];

/** Writes CI run <id>'s jobs into state dir d: every required job success, then `jobs` overrides ('missing' drops one). */
function ciRun(d: string, id: string, jobs: Record<string, string> = {}): string {
  const all: Record<string, string> = {
    'Setup & Cache Dependencies': 'success',
    'Overlay Gallery (visual + contrast)': 'skipped', // required on PRs only; skipped in queue and push runs
    ...Object.fromEntries(REQUIRED_CI.map((n) => [n, 'success'])),
    ...jobs,
  };
  writeFileSync(
    join(d, `jobs-${id}`),
    Object.entries(all)
      .filter(([, c]) => c !== 'missing')
      .map(([n, c]) => `${c}\t${n}`)
      .join('\n') + '\n'
  );
  return id;
}
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

let dir: string;
let repo: string;
let bin: string;
// a -> b -> c on main; side branches off a and never lands.
const sha: Record<'a' | 'b' | 'c' | 'side', string> = { a: '', b: '', c: '', side: '' };

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function commit(name: string): string {
  writeFileSync(join(repo, 'f.txt'), name);
  git('add', 'f.txt');
  git('commit', '-q', '-m', name);
  return git('rev-parse', 'HEAD');
}

const FAKE_GH = `#!/usr/bin/env bash
# The gh api calls the deploy scripts make. The deploy-freeze tag lives in $FREEZE_DIR.
shift # api
method=GET; path=; msg=; sha=
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method=$2; shift 2 ;;
    --jq) shift 2 ;;
    -f|-F)
      case "$2" in message=*) msg=\${2#message=} ;; sha=*) sha=\${2#sha=} ;; esac
      [ "$method" = GET ] && method=POST
      shift 2 ;;
    *) path=$1; shift ;;
  esac
done
notfound() { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }
case "$method $path" in
  "GET "*/commits/main) echo "$FAKE_TIP" ;;
  "GET "*/compare/*)
    spec=\${path##*/compare/}; base=\${spec%%...*}; head=\${spec##*...}
    [ "$base" = main ] && base=$FAKE_TIP
    [ "$head" = main ] && head=$FAKE_TIP
    git cat-file -e "$base^{commit}" 2>/dev/null && git cat-file -e "$head^{commit}" 2>/dev/null || notfound
    if [ "$base" = "$head" ]; then echo identical
    elif git merge-base --is-ancestor "$base" "$head"; then echo ahead
    elif git merge-base --is-ancestor "$head" "$base"; then echo behind
    else echo diverged; fi ;;
  "GET "*/git/ref/tags/deploy-freeze)
    [ -z "$FAKE_FREEZE_ERROR" ] || { echo "gh: Server Error (HTTP 500)" >&2; exit 1; }
    [ -f "$FREEZE_DIR/ref" ] && cat "$FREEZE_DIR/ref" || notfound ;;
  "GET "*/git/tags/*) f="$FREEZE_DIR/tag-\${path##*/}"; [ -f "$f" ] && cat "$f" || notfound ;;
  "POST "*/git/tags)
    id=$(printf '%s %s' "$msg" "$RANDOM$RANDOM" | git hash-object --stdin)
    printf '%s' "$msg" > "$FREEZE_DIR/tag-$id"; echo "$id" ;;
  "POST "*/git/refs)
    [ -f "$FREEZE_DIR/ref" ] && { echo "gh: Reference already exists (HTTP 422)" >&2; exit 1; }
    echo "$sha" > "$FREEZE_DIR/ref" ;;
  "PATCH "*/git/refs/tags/deploy-freeze) echo "$sha" > "$FREEZE_DIR/ref" ;;
  "DELETE "*/git/refs/tags/deploy-freeze) [ -f "$FREEZE_DIR/ref" ] && rm "$FREEZE_DIR/ref" || notfound ;;
  # CI runs (state in $QV_DIR): jobs-<run> ("<conclusion>\\t<name>" lines),
  # runs-<workflow>-<sha> (ids of successful runs), mg-runs ("<id> <head>").
  "GET "*/actions/runs/*/jobs*)
    id=\${path%/jobs*}; id=\${id##*/}
    [ -f "$QV_DIR/jobs-$id" ] && cat "$QV_DIR/jobs-$id" || notfound ;;
  "GET "*/actions/workflows/ci.yml/runs?event=merge_group*) cat "$QV_DIR/mg-runs" 2>/dev/null || true ;;
  "GET "*/actions/workflows/*/runs*)
    wf=\${path%/runs*}; wf=\${wf##*/}; q=\${path#*head_sha=}; q=\${q%%&*}
    cat "$QV_DIR/runs-$wf-$q" 2>/dev/null || true ;;
  "GET "*/git/commits/*) git rev-parse "\${path##*/}^{tree}" 2>/dev/null || notfound ;;
  # Merge-queue verdict: head-<run>, parent-<sha>.
  "GET "*/actions/runs/*) f="$QV_DIR/head-\${path##*/}"; [ -f "$f" ] && cat "$f" || notfound ;;
  "GET "*/commits/*) f="$QV_DIR/parent-\${path##*/}"; [ -f "$f" ] && cat "$f" || notfound ;;
  *) echo "unexpected gh $method $path" >&2; exit 2 ;;
esac
`;

const FAKE_GCLOUD = `#!/usr/bin/env bash
case "$*" in
  *"services describe"*)
    if [ "$FAKE_SERVICE" = missing ]; then echo "ERROR: Service [john-bogle-ui] could not be found." >&2; exit 1; fi
    if [ "$FAKE_SERVICE" = error ]; then echo "ERROR: PERMISSION_DENIED" >&2; exit 1; fi
    echo '{"status":{"traffic":[{"revisionName":"john-bogle-ui-old","percent":0,"tag":"green"},{"revisionName":"john-bogle-ui-live","percent":100}]}}' ;;
  *"revisions describe john-bogle-ui-live"*)
    echo "{\\"spec\\":{\\"containers\\":[{\\"env\\":[{\\"name\\":\\"NODE_ENV\\",\\"value\\":\\"production\\"},{\\"name\\":\\"BUILD_SHA\\",\\"value\\":\\"$FAKE_LIVE\\"}]}]}}" ;;
  *) echo "unexpected gcloud $*" >&2; exit 2 ;;
esac
`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'forward-guard-'));
  repo = join(dir, 'repo');
  bin = join(dir, 'bin');
  mkdirSync(repo);
  mkdirSync(bin);
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  sha.a = commit('a');
  sha.b = commit('b');
  sha.c = commit('c');
  git('checkout', '-q', '-b', 'side', sha.a);
  sha.side = commit('side');
  git('checkout', '-q', 'main');
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  writeFileSync(join(bin, 'gcloud'), FAKE_GCLOUD);
  chmodSync(join(bin, 'gh'), 0o755);
  chmodSync(join(bin, 'gcloud'), 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function freshDir(): string {
  return mkdtempSync(join(dir, 'freeze-'));
}

function baseEnv(freezeDir: string): NodeJS.ProcessEnv {
  return {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: process.env.HOME,
    GITHUB_REPOSITORY: 'o/r',
    GITHUB_SHA: sha.c,
    GITHUB_ACTOR: 'tester',
    FREEZE_DIR: freezeDir,
    QV_DIR: freezeDir,
  };
}

/** Runs scripts/ci/deploy-freeze.sh the way rollback.yml and deploy-production.yml do. */
function freezeCmd(
  freezeDir: string,
  args: string[],
  env: Record<string, string> = {}
): { status: number | null; out: string } {
  const r = spawnSync('bash', [FREEZE, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...baseEnv(freezeDir), GITHUB_STEP_SUMMARY: '/dev/null', ...env },
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

/**
 * Writes a merge-queue CI run (id 101) on `head`, built on `base`, into `d`.
 * By default every required check passed (an unscoped run). basePushCi adds a
 * green push CI run on main for the base: 'full' (unscoped) or 'scoped'.
 */
function queueRun(
  d: string,
  opts: {
    head?: string;
    base?: string;
    ci?: Record<string, string>;
    build?: string;
    menu?: string;
    basePushCi?: 'full' | 'scoped';
  } = {}
): string {
  const head = opts.head ?? sha.c;
  const base = opts.base ?? sha.b;
  ciRun(d, '101', opts.ci);
  writeFileSync(join(d, 'head-101'), `${head}\n`);
  const other = (wf: string, id: string, job: string, c: string): void => {
    if (c === 'missing') return;
    writeFileSync(join(d, `runs-${wf}-${head}`), `${id}\n`);
    writeFileSync(join(d, `jobs-${id}`), `${c}\t${job}\n`);
  };
  other('build.yml', '201', 'Build & Test', opts.build ?? 'success');
  other('menu-e2e.yml', '301', 'Menu E2E', opts.menu ?? 'success');
  writeFileSync(join(d, `parent-${head}`), `${base}\n`);
  if (opts.basePushCi) {
    writeFileSync(join(d, `runs-ci.yml-${base}`), '401\n');
    ciRun(d, '401', opts.basePushCi === 'scoped' ? { 'Unit Tests': 'skipped' } : {});
  }
  return '101';
}

function verdict(d: string, run: string, live: string): { status: number | null; out: string } {
  const r = spawnSync('bash', [VERDICT, run, live], {
    cwd: repo,
    encoding: 'utf8',
    env: baseEnv(d),
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

interface Run {
  status: number | null;
  deploy: string | undefined;
  summary: string;
  out: string;
}

function guard(opts: {
  deploy: string;
  live?: string;
  event?: string;
  allowOlder?: boolean;
  reason?: string;
  tip?: string;
  service?: 'ok' | 'missing' | 'error';
  freezeDir?: string;
  freezeError?: boolean;
  /** The triggering push CI run's job overrides; every required job passes by default. */
  ciJobs?: Record<string, string>;
  ciRunId?: string;
  queueTested?: string;
  queueRunId?: string;
}): Run {
  const d = opts.freezeDir ?? freshDir();
  const ciRunId = opts.ciRunId ?? ciRun(d, '501', opts.ciJobs);
  const output = join(dir, `out-${Math.random().toString(36).slice(2)}`);
  const summary = `${output}-summary`;
  writeFileSync(output, '');
  writeFileSync(summary, '');
  const r = spawnSync('bash', [SCRIPT], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...baseEnv(d),
      CI_RUN_ID: ciRunId,
      QUEUE_TESTED: opts.queueTested ?? '',
      QUEUE_RUN_ID: opts.queueRunId ?? '',
      FAKE_FREEZE_ERROR: opts.freezeError ? '1' : '',
      DEPLOY_SHA: opts.deploy,
      EVENT: opts.event ?? 'workflow_run',
      ALLOW_OLDER: String(opts.allowOlder ?? false),
      REASON: opts.reason ?? '',
      GCP_REGION: 'us-central1',
      GCP_PROJECT_ID: 'p',
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      FAKE_TIP: opts.tip ?? sha.c,
      FAKE_LIVE: opts.live ?? '',
      FAKE_SERVICE: opts.service ?? 'ok',
    },
  });
  const deploy = /^deploy=(\w+)$/m.exec(readFileSync(output, 'utf8'))?.[1];
  return {
    status: r.status,
    deploy,
    summary: readFileSync(summary, 'utf8'),
    out: r.stdout + r.stderr,
  };
}

const dispatch = { event: 'workflow_dispatch' } as const;

describe('forward-only deploy guard: automatic (workflow_run) path', () => {
  it('deploys a commit ahead of production', () => {
    expect(guard({ live: sha.a, deploy: sha.c })).toMatchObject({ status: 0, deploy: 'true' });
  });

  it('a late or re-run CI for an older commit (behind) is a no-op, not a failure', () => {
    const r = guard({ live: sha.c, deploy: sha.b });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.out).toMatch(/::notice::Not deploying .*behind/);
    expect(r.summary).toMatch(/move production backwards/);
  });

  it('a diverged commit is a no-op', () => {
    const r = guard({ live: sha.c, deploy: sha.side });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.out).toMatch(/diverged/);
  });

  it('the commit already serving (identical) is a no-op', () => {
    expect(guard({ live: sha.c, deploy: sha.c })).toMatchObject({ status: 0, deploy: 'false' });
  });

  it('allow_older is ignored on the automatic path', () => {
    expect(guard({ live: sha.c, deploy: sha.a, allowOlder: true, reason: 'x' })).toMatchObject({
      status: 0,
      deploy: 'false',
    });
  });

  it('reads the revision serving traffic, not a 0% green tag', () => {
    // gcloud fails for any other revision, so a pass proves the 100% one was read.
    expect(guard({ live: sha.b, deploy: sha.c }).out).toMatch(/serving: john-bogle-ui-live/);
  });

  it('with production on an unknown commit, deploys only main tip', () => {
    const unknown = 'f'.repeat(40);
    expect(guard({ live: unknown, deploy: sha.c, tip: sha.c })).toMatchObject({ deploy: 'true' });
    expect(guard({ live: unknown, deploy: sha.b, tip: sha.c })).toMatchObject({ deploy: 'false' });
  });

  it('deploys when the service does not exist yet', () => {
    expect(guard({ service: 'missing', deploy: sha.c })).toMatchObject({
      status: 0,
      deploy: 'true',
    });
  });

  it('fails closed when production cannot be read', () => {
    const r = guard({ service: 'error', deploy: sha.c });
    expect(r.status).not.toBe(0);
    expect(r.deploy).toBeUndefined();
  });

  it('refuses a DEPLOY_SHA that is not a full SHA', () => {
    expect(guard({ live: sha.a, deploy: 'main; rm -rf /' }).status).not.toBe(0);
  });
});

describe('forward-only deploy guard: manual dispatch', () => {
  it('an older commit without allow_older is refused as a no-op', () => {
    const r = guard({ ...dispatch, live: sha.c, deploy: sha.a });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/allow_older/);
  });

  it('an intentional rollback (allow_older + reason, commit on main) goes through', () => {
    const r = guard({
      ...dispatch,
      live: sha.c,
      deploy: sha.a,
      allowOlder: true,
      reason: 'c broke sign-in',
    });
    expect(r).toMatchObject({ status: 0, deploy: 'true' });
    expect(r.summary).toMatch(/c broke sign-in/);
  });

  it('allow_older without a reason fails', () => {
    const r = guard({ ...dispatch, live: sha.c, deploy: sha.a, allowOlder: true, reason: '  ' });
    expect(r.status).not.toBe(0);
    expect(r.deploy).toBeUndefined();
  });

  it('a commit that is not on main is refused, even with allow_older', () => {
    const r = guard({ ...dispatch, live: sha.c, deploy: sha.side, allowOlder: true, reason: 'x' });
    expect(r.status).not.toBe(0);
    expect(r.deploy).toBeUndefined();
    expect(r.out).toMatch(/not a commit on main/);
  });

  it('a redeploy of the serving commit still runs', () => {
    expect(guard({ ...dispatch, live: sha.c, deploy: sha.c })).toMatchObject({
      status: 0,
      deploy: 'true',
    });
  });

  it('a forward deploy runs', () => {
    expect(guard({ ...dispatch, live: sha.a, deploy: sha.c })).toMatchObject({
      status: 0,
      deploy: 'true',
    });
  });
});

describe('forward-only deploy guard: merge-queue fast path (push)', () => {
  const push = { event: 'push' } as const;
  const fast = (d: string, run: string, live: string, deploy: string): Run =>
    guard({ ...push, freezeDir: d, queueTested: 'true', queueRunId: run, live, deploy });

  it('an unscoped merge-queue run on this tree deploys right away', () => {
    const d = freshDir();
    expect(fast(d, queueRun(d, { base: sha.b }), sha.b, sha.c)).toMatchObject({
      status: 0,
      deploy: 'true',
    });
  });

  it('a scoped merge-queue run (a required job skipped) does not deploy', () => {
    const d = freshDir();
    const r = fast(d, queueRun(d, { ci: { 'Integration Tests (2/3)': 'skipped' } }), sha.b, sha.c);
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/Integration Tests \(2\/3\)' was skipped/);
    expect(r.summary).toMatch(/push CI passes/);
  });

  it('a queue run on an untested base does not deploy', () => {
    const d = freshDir();
    // Built on a, which production doesn't serve (b) and push CI never passed on.
    const r = fast(d, queueRun(d, { base: sha.a }), sha.b, sha.c);
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/never tested/);
  });

  it('a queue run on a base whose push run was scoped does not deploy', () => {
    const d = freshDir();
    const r = fast(d, queueRun(d, { base: sha.a, basePushCi: 'scoped' }), sha.b, sha.c);
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/no unscoped green push CI run/);
  });

  it('an admin merge or direct push (not queue-tested) is a no-op: push CI deploys it', () => {
    for (const queueTested of ['false', '']) {
      const r = guard({ ...push, queueTested, live: sha.b, deploy: sha.c });
      expect(r).toMatchObject({ status: 0, deploy: 'false' });
      expect(r.summary).toMatch(/merge-queue/);
    }
  });

  it('QUEUE_TESTED gates on its own: a run that would count is ignored unless queue-tested found it', () => {
    const d = freshDir();
    const run = queueRun(d, { base: sha.b });
    expect(fast(d, run, sha.b, sha.c).deploy).toBe('true'); // the run itself counts
    const r = guard({
      ...push,
      freezeDir: d,
      queueTested: 'false',
      queueRunId: run,
      live: sha.b,
      deploy: sha.c,
    });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/no successful merge-queue run tested this tree/);
  });

  it("a queue verdict that can't tell (unreadable run) is a no-op, never a deploy", () => {
    const r = fast(freshDir(), '999', sha.b, sha.c);
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/could not check merge-queue run 999/);
  });

  it("a service's first deploy waits for push CI on the push path", () => {
    const d = freshDir();
    const r = guard({
      ...push,
      freezeDir: d,
      queueTested: 'true',
      queueRunId: queueRun(d, { base: sha.b }),
      service: 'missing',
      deploy: sha.c,
    });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/first deploy waits for push CI/);
  });

  it('the forward-only check holds on the fast path too', () => {
    const d = freshDir();
    const r = fast(d, queueRun(d, { head: sha.b, base: sha.a, basePushCi: 'full' }), sha.c, sha.b);
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/backwards/);
  });

  it('push CI passing later on a fast-pathed head deploys nothing again', () => {
    expect(guard({ live: sha.c, deploy: sha.c })).toMatchObject({ status: 0, deploy: 'false' });
  });
});

describe('queue verdict: may a merge-queue run stand in for full push CI?', () => {
  it('counts an unscoped run built on the commit production serves', () => {
    const d = freshDir();
    const r = verdict(d, queueRun(d, { base: sha.b }), sha.b);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/built on production's/);
  });

  it('counts a run whose base had an unscoped green push run on main', () => {
    const d = freshDir();
    expect(verdict(d, queueRun(d, { base: sha.a, basePushCi: 'full' }), sha.b).status).toBe(0);
  });

  it('does not count a run whose base push run was scoped', () => {
    const d = freshDir();
    const r = verdict(d, queueRun(d, { base: sha.a, basePushCi: 'scoped' }), sha.b);
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/never tested/);
  });

  it.each(REQUIRED_CI)('does not count a run where %s was skipped (scoped)', (job) => {
    const d = freshDir();
    const r = verdict(d, queueRun(d, { ci: { [job]: 'skipped' } }), sha.b);
    expect(r.status).toBe(3);
    expect(r.out).toContain(`'${job}' was skipped`);
  });

  it('does not count a run missing a required job', () => {
    const d = freshDir();
    expect(verdict(d, queueRun(d, { ci: { 'Security Scan': 'missing' } }), sha.b).out).toMatch(
      /was missing/
    );
  });

  it('requires Build & Test and Menu E2E on the same head', () => {
    const d1 = freshDir();
    const b = verdict(d1, queueRun(d1, { build: 'skipped' }), sha.b);
    expect(b.status).toBe(3);
    expect(b.out).toMatch(/Build & Test.*build\.yml/);
    const d2 = freshDir();
    expect(verdict(d2, queueRun(d2, { menu: 'missing' }), sha.b).out).toMatch(
      /Menu E2E.*menu-e2e\.yml/
    );
  });

  it('does not count a run built on an untested base', () => {
    const d = freshDir();
    const r = verdict(d, queueRun(d, { base: sha.a }), sha.b);
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/base .* was never tested/);
  });

  it('cannot tell without a readable run', () => {
    expect(verdict(freshDir(), '999', sha.b).status).toBe(1);
    expect(verdict(freshDir(), '', sha.b).status).toBe(1);
  });

  it.each(['null', '', 'not-a-sha'])("cannot tell when the head's parent reads as %j", (parent) => {
    const d = freshDir();
    queueRun(d, { base: sha.b });
    writeFileSync(join(d, `parent-${sha.c}`), `${parent}\n`);
    const r = verdict(d, '101', sha.b);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/has no parent SHA/);
  });

  it('with production unknown (`-`), an untested base is left to the guard (exit 5)', () => {
    const d1 = freshDir();
    const r = verdict(d1, queueRun(d1, { base: sha.a }), '-');
    expect(r.status).toBe(5);
    expect(r.out).toMatch(/counts only if production serves/);
    const d2 = freshDir();
    expect(verdict(d2, queueRun(d2, { base: sha.a, basePushCi: 'full' }), '-').status).toBe(0);
    const d3 = freshDir();
    expect(verdict(d3, queueRun(d3, { ci: { 'Unit Tests': 'skipped' } }), '-').status).toBe(3);
  });
});

/** Runs scripts/ci/queue-fast-path.sh the way deploy-production's queue-verdict job does. */
function fastPath(
  d: string,
  opts: { queueTested: string; queueRunId: string; pushCi?: boolean }
): { status: number | null; tested?: string; runId?: string; out: string } {
  if (opts.pushCi ?? true) writeFileSync(join(d, `runs-ci.yml-${sha.c}`), '601\n');
  const output = join(dir, `fast-${Math.random().toString(36).slice(2)}`);
  writeFileSync(output, '');
  const r = spawnSync('bash', [FAST_PATH], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...baseEnv(d),
      SHA: sha.c,
      QUEUE_TESTED: opts.queueTested,
      QUEUE_RUN_ID: opts.queueRunId,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: '/dev/null',
    },
  });
  const out = readFileSync(output, 'utf8');
  return {
    status: r.status,
    tested: /^tested=(\w+)$/m.exec(out)?.[1],
    runId: /^run-id=(\d+)$/m.exec(out)?.[1],
    out: r.stdout + r.stderr,
  };
}

describe('queue-verdict job: only a push that may deploy reaches the deploy group', () => {
  it('a fully tested queue run, with push CI on the commit, takes the fast path', () => {
    const d = freshDir();
    const r = fastPath(d, {
      queueTested: 'true',
      queueRunId: queueRun(d, { base: sha.a, basePushCi: 'full' }),
    });
    expect(r).toMatchObject({ status: 0, tested: 'true', runId: '101' });
  });

  it("a base with no push run yet is left to the guard, which knows production's commit", () => {
    const d = freshDir();
    const r = fastPath(d, { queueTested: 'true', queueRunId: queueRun(d, { base: sha.a }) });
    expect(r).toMatchObject({ status: 0, tested: 'true' });
  });

  it('a commit with no push CI run of its own (docs only) never enters the group', () => {
    const d = freshDir();
    const run = queueRun(d, { base: sha.a, basePushCi: 'full' });
    const r = fastPath(d, { queueTested: 'true', queueRunId: run, pushCi: false });
    expect(r).toMatchObject({ status: 0, tested: 'false' });
    expect(r.out).toMatch(/no push CI run/);
  });

  it.each([
    ['not queue-tested (admin merge, direct push)', 'false', (_d: string) => '101'],
    ['queue-tested left empty', '', (_d: string) => '101'],
    ['a scoped queue run', 'true', (d: string) => queueRun(d, { ci: { 'Unit Tests': 'skipped' } })],
    ['an unreadable queue run', 'true', (_d: string) => '999'],
  ])('%s stays out of the group', (_name, queueTested, run) => {
    const d = freshDir();
    queueRun(d, { base: sha.a, basePushCi: 'full' });
    const r = fastPath(d, { queueTested, queueRunId: run(d) });
    expect(r).toMatchObject({ status: 0, tested: 'false' });
    expect(r.runId).toBeUndefined();
  });
});

describe('required checks: a push CI "success" must have run them', () => {
  const skippedSuite = {
    'Lint & Type Check': 'skipped',
    'Unit Tests': 'skipped',
    'Frontend Quality': 'skipped',
  };

  it('a push run where every required job passed deploys', () => {
    expect(guard({ live: sha.b, deploy: sha.c })).toMatchObject({ status: 0, deploy: 'true' });
  });

  it('a scoped push run (required jobs skipped, nothing they cover changed) is a quiet no-op', () => {
    const r = guard({ live: sha.b, deploy: sha.c, ciJobs: skippedSuite });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toContain('no code change since the last deploy; nothing to ship');
    expect(r.out).not.toMatch(/::error::/);
  });

  it("skipped jobs are fine when an unscoped merge-queue run passed them on this tree (ci.yml's queue-tested skip)", () => {
    const d = freshDir();
    ciRun(d, '601'); // the queue run: every required job passed
    writeFileSync(join(d, 'mg-runs'), `601 ${sha.c}\n`);
    const r = guard({ freezeDir: d, live: sha.b, deploy: sha.c, ciJobs: skippedSuite });
    expect(r).toMatchObject({ status: 0, deploy: 'true' });
    expect(r.out).toMatch(/merge-queue run 601 already passed them/);
  });

  it('a scoped merge-queue run does not cover the skipped jobs', () => {
    const d = freshDir();
    ciRun(d, '601', { 'Unit Tests': 'skipped' });
    writeFileSync(join(d, 'mg-runs'), `601 ${sha.c}\n`);
    const r = guard({ freezeDir: d, live: sha.b, deploy: sha.c, ciJobs: skippedSuite });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toContain('no code change since the last deploy');
  });

  it('a merge-queue run on a different tree does not cover them', () => {
    const d = freshDir();
    ciRun(d, '601');
    writeFileSync(join(d, 'mg-runs'), `601 ${sha.b}\n`); // b's tree, not c's
    expect(guard({ freezeDir: d, live: sha.a, deploy: sha.c, ciJobs: skippedSuite }).deploy).toBe(
      'false'
    );
  });

  it.each(['failure', 'cancelled', 'missing'])('a required job that is %s goes red', (c) => {
    const r = guard({ live: sha.b, deploy: sha.c, ciJobs: { 'Security Scan': c } });
    expect(r.status).not.toBe(0);
    expect(r.deploy).toBeUndefined();
    expect(r.out).toMatch(/::error::.*Security Scan/);
  });

  it('an unreadable push run goes red, never a silent skip', () => {
    const r = guard({ live: sha.b, deploy: sha.c, ciRunId: '999' });
    expect(r.status).not.toBe(0);
    expect(r.deploy).toBeUndefined();
  });

  it('manual dispatch does not depend on a push run', () => {
    expect(
      guard({ event: 'workflow_dispatch', live: sha.b, deploy: sha.c, ciRunId: '' })
    ).toMatchObject({
      deploy: 'true',
    });
  });

  it('others: Build & Test and Menu E2E on a commit', () => {
    const d = freshDir();
    const run = (args: string[]): { status: number | null; out: string } => {
      const r = spawnSync('bash', [CHECKS, ...args], {
        cwd: repo,
        encoding: 'utf8',
        env: baseEnv(d),
      });
      return { status: r.status, out: r.stdout + r.stderr };
    };
    expect(run(['others', sha.c]).status).toBe(3);
    writeFileSync(join(d, `runs-build.yml-${sha.c}`), '701\n');
    writeFileSync(join(d, 'jobs-701'), 'success\tBuild & Test\n');
    writeFileSync(join(d, `runs-menu-e2e.yml-${sha.c}`), '702\n');
    writeFileSync(join(d, 'jobs-702'), 'skipped\tMenu E2E\n');
    expect(run(['others', sha.c]).out).toMatch(/Menu E2E/);
    writeFileSync(join(d, 'jobs-702'), 'success\tMenu E2E\n');
    expect(run(['others', sha.c]).status).toBe(0);
  });
});

describe('deploy freeze: a rollback holds until someone unfreezes', () => {
  it('a pending rollback freezes first; the workflow_run that arrives next no-ops', () => {
    const f = freshDir();
    // rollback.yml: freeze, then move traffic back to b.
    expect(freezeCmd(f, ['set', 'rollback.yml by seth: c broke sign-in']).status).toBe(0);
    // CI passes on main's tip c (ahead of b, so the forward-only check alone would deploy it).
    const r = guard({ freezeDir: f, live: sha.b, deploy: sha.c });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toContain('frozen: rollback.yml by seth: c broke sign-in');
  });

  it('a deploy that passed the guard before the freeze stops at the pre-shift re-check', () => {
    const f = freshDir();
    expect(guard({ freezeDir: f, live: sha.b, deploy: sha.c }).deploy).toBe('true');
    freezeCmd(f, ['set', 'incident-response rollback']);
    const recheck = freezeCmd(f, ['gate'], { EVENT: 'workflow_run' });
    expect(recheck.status).toBe(3);
    expect(recheck.out).toContain('incident-response rollback');
  });

  it('the merge-queue push path no-ops while frozen too, even with an unscoped queue run', () => {
    const f = freshDir();
    freezeCmd(f, ['set', 'rollback']);
    const run = queueRun(f, { base: sha.b });
    const r = guard({
      freezeDir: f,
      event: 'push',
      queueTested: 'true',
      queueRunId: run,
      live: sha.b,
      deploy: sha.c,
    });
    expect(r).toMatchObject({ deploy: 'false' });
    expect(r.summary).toContain('frozen: rollback');
  });

  it('a plain manual run no-ops while frozen; allow_older still deploys', () => {
    const f = freshDir();
    freezeCmd(f, ['set', 'rollback']);
    expect(
      guard({ freezeDir: f, event: 'workflow_dispatch', live: sha.b, deploy: sha.c })
    ).toMatchObject({
      deploy: 'false',
    });
    const older = guard({
      freezeDir: f,
      event: 'workflow_dispatch',
      live: sha.c,
      deploy: sha.a,
      allowOlder: true,
      reason: 'roll back further',
    });
    expect(older).toMatchObject({ status: 0, deploy: 'true' });
    expect(freezeCmd(f, ['gate'], { EVENT: 'workflow_dispatch', ALLOW_OLDER: 'true' }).status).toBe(
      0
    );
  });

  it('allow_older bypasses the freeze only on a manual run', () => {
    const f = freshDir();
    freezeCmd(f, ['set', 'rollback']);
    expect(freezeCmd(f, ['gate'], { EVENT: 'workflow_run', ALLOW_OLDER: 'true' }).status).toBe(3);
    expect(
      guard({ freezeDir: f, live: sha.b, deploy: sha.c, allowOlder: true, reason: 'x' })
    ).toMatchObject({
      deploy: 'false',
    });
  });

  it('unfreeze is deliberate: it needs a reason, then automatic deploys resume', () => {
    const f = freshDir();
    freezeCmd(f, ['set', 'rollback']);
    expect(freezeCmd(f, ['clear', ' ']).status).not.toBe(0);
    expect(guard({ freezeDir: f, live: sha.b, deploy: sha.c }).deploy).toBe('false');
    const cleared = freezeCmd(f, ['clear', 'fix #123 is on main']);
    expect(cleared.status).toBe(0);
    expect(cleared.out).toMatch(
      /unfrozen by tester at .*Reason: fix #123 is on main\. Was frozen for: rollback/
    );
    expect(guard({ freezeDir: f, live: sha.b, deploy: sha.c }).deploy).toBe('true');
    expect(freezeCmd(f, ['clear', 'again']).status).toBe(0); // not frozen: nothing to do
  });

  it('a second rollback replaces the freeze reason', () => {
    const f = freshDir();
    freezeCmd(f, ['set', 'first']);
    expect(freezeCmd(f, ['set', 'second']).status).toBe(0);
    expect(freezeCmd(f, ['check']).out).toContain('second');
  });

  it('a freeze needs a reason', () => {
    expect(freezeCmd(freshDir(), ['set', '']).status).not.toBe(0);
  });

  it('fails closed when the freeze cannot be read', () => {
    const r = guard({ freezeError: true, live: sha.b, deploy: sha.c });
    expect(r.status).not.toBe(0);
    expect(r.deploy).toBeUndefined();
  });
});

describe('unfreeze audit: who, when and why', () => {
  it('logs the actor, a UTC timestamp, the reason and the old freeze, in the log and the summary', () => {
    const f = freshDir();
    freezeCmd(f, ['set', 'rollback.yml by seth: c broke sign-in']);
    const summary = join(f, 'summary.md');
    writeFileSync(summary, '');
    const r = freezeCmd(f, ['clear', 'fix #123 is on main'], {
      GITHUB_ACTOR: 'mindy',
      GITHUB_STEP_SUMMARY: summary,
    });
    expect(r.status).toBe(0);
    expect(r.out).toMatch(
      /::notice::Deploys unfrozen by mindy at \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\. Reason: fix #123 is on main\. Was frozen for: rollback\.yml by seth: c broke sign-in/
    );
    const md = readFileSync(summary, 'utf8');
    expect(md).toContain('| By | mindy |');
    expect(md).toMatch(/\| When \(UTC\) \| \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ \|/);
    expect(md).toContain('| Reason | fix #123 is on main |');
    expect(md).toContain('| Was frozen for | rollback.yml by seth: c broke sign-in |');
  });
});

describe('a rollback confirms its traffic held', () => {
  function confirm(target: string): Run {
    const summary = join(freshDir(), 'summary.md');
    writeFileSync(summary, '');
    const r = spawnSync('bash', [CONFIRM, target], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...baseEnv(freshDir()),
        GCP_REGION: 'us-central1',
        GITHUB_STEP_SUMMARY: summary,
        FAKE_SERVICE: 'ok',
      },
    });
    return {
      status: r.status,
      deploy: undefined,
      summary: readFileSync(summary, 'utf8'),
      out: r.stdout + r.stderr,
    };
  }

  it('passes when the rollback target still serves traffic', () => {
    const r = confirm('john-bogle-ui-live');
    expect(r.status).toBe(0);
    expect(r.summary).toMatch(/Rollback held/);
  });

  it('fails loudly when a racing deploy moved traffic off the target', () => {
    const r = confirm('john-bogle-ui-rolled-back');
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(
      /::error::Traffic is on john-bogle-ui-live, not the rollback target john-bogle-ui-rolled-back/
    );
    expect(r.summary).toMatch(/Rollback did not hold/);
  });

  it('fails without a target', () => {
    expect(confirm('').status).not.toBe(0);
  });
});

describe('deploy-production.yml wiring', () => {
  const workflow = read('.github/workflows/deploy-production.yml');
  // deploy-ui runs until the next job (unfreeze).
  const job = workflow.slice(workflow.indexOf('\n  deploy-ui:'), workflow.indexOf('\n  unfreeze:'));
  const steps = job.split('\n      - name: ').slice(1);
  const names = steps.map((s) => s.split('\n')[0]);
  const at = (name: string): number => {
    const i = names.indexOf(name);
    expect(i, name).toBeGreaterThan(-1);
    return i;
  };
  const guardAt = at('Forward-only guard');
  const notifyAt = at('Create deployment summary');

  it('runs the guard script before anything is built or deployed', () => {
    expect(steps[guardAt]).toMatch(/run: bash scripts\/ci\/deploy-forward-guard\.sh/);
    expect(guardAt).toBeLessThan(at('Build and push image'));
  });

  it('a no-op skips every build and deploy step, rollback included', () => {
    const gated = steps.slice(guardAt + 1, notifyAt);
    expect(gated.length).toBeGreaterThan(10);
    for (const s of gated) {
      expect(s, s.split('\n')[0]).toMatch(/\n {8}if: .*steps\.guard\.outputs\.deploy == 'true'/);
    }
  });

  it('notifications stay quiet on a no-op', () => {
    for (const s of steps.slice(notifyAt)) {
      expect(s, s.split('\n')[0]).toMatch(/steps\.guard\.outputs\.deploy != 'false'/);
    }
  });

  it('manual rollback inputs reach the guard', () => {
    for (const input of ['sha', 'allow_older', 'reason']) {
      expect(workflow).toMatch(new RegExp(`\\n {6}${input}:\\n`));
    }
    expect(workflow).toMatch(
      /DEPLOY_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \|\| inputs\.sha \|\| github\.sha \}\}/
    );
    expect(steps[guardAt]).toMatch(/ALLOW_OLDER: \$\{\{ inputs\.allow_older == true \}\}/);
    expect(steps[guardAt]).toMatch(/REASON: \$\{\{ inputs\.reason \}\}/);
  });

  it('manual deploys run only from main, in the job if and the concurrency group', () => {
    const dispatchFromMain =
      "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'";
    expect(job).toContain(dispatchFromMain);
    expect(/\nconcurrency:\n {2}group: (.*)\n/.exec(workflow)?.[1]).toContain(dispatchFromMain);
    expect(workflow).not.toMatch(/github\.event_name == 'workflow_dispatch' \|\|/);
  });

  it('the manual CI check counts only push runs on main, never a green PR run', () => {
    expect(steps[at('Require CI to pass on this commit')]).toMatch(
      /select\(\.event == "push" and \.head_branch == "main"\)/
    );
  });

  it('health check and smoke tests hit green before it gets traffic', () => {
    expect(steps[at('Health check green revision')]).toMatch(/steps\.deploy\.outputs\.green_url/);
    expect(steps[at('Run smoke tests')]).toMatch(
      /SMOKE_TEST_URL: \$\{\{ steps\.deploy\.outputs\.green_url \}\}/
    );
    expect(at('Run smoke tests')).toBeLessThan(at('Shift traffic to green'));
    expect(steps[at('Rollback on failure')]).toMatch(/steps\.smoke\.outcome == 'failure'/);
    expect(steps[at('🟢 Deploy GREEN revision (no traffic)')]).toMatch(
      /select\(\.tag == "green"\) \| \.url/
    );
  });

  it('a redeploy of the same commit gets a fresh revision name', () => {
    expect(steps[at('🟢 Deploy GREEN revision (no traffic)')]).toMatch(
      /REVISION_SUFFIX=\$\{\{ steps\.meta\.outputs\.revision_suffix \}\}/
    );
    expect(steps[at('Generate metadata')]).toMatch(
      /revision_suffix=\$\{DEPLOY_SHA::8\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/
    );
  });

  it('re-checks the freeze right before the traffic shift, and a freeze rolls green back', () => {
    const recheck = at('Re-check the deploy freeze');
    expect(recheck).toBeLessThan(at('Shift traffic to green'));
    expect(steps[recheck]).toMatch(/bash scripts\/ci\/deploy-freeze\.sh gate/);
    expect(steps[at('Rollback on failure')]).toMatch(/steps\.freeze\.outcome == 'failure'/);
  });

  it('incident-response hands its rollback target to the traffic check', () => {
    const text = read('.github/workflows/incident-response.yml');
    expect(text).toMatch(/name: "Action: Rollback to previous version"\n {8}id: rollback\n/);
    expect(text).toContain('echo "revision=$PREV_REV" >> "$GITHUB_OUTPUT"');
    expect(text).toMatch(
      /TARGET: \$\{\{ steps\.rollback\.outputs\.revision \}\}[\s\S]*?confirm-rollback-traffic\.sh "\$TARGET"/
    );
  });

  const verdictJob = workflow.slice(
    workflow.indexOf('\n  queue-verdict:'),
    workflow.indexOf('\n  deploy-ui:')
  );

  it('a push to main runs the queue-verdict job, and its verdict reaches the guard', () => {
    expect(workflow).toMatch(/\n {2}push:\n {4}branches: \[main\]\n/);
    expect(verdictJob).toMatch(
      /\n {4}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\n/
    );
    expect(verdictJob).toMatch(/uses: \.\/\.github\/actions\/queue-tested/);
    expect(verdictJob).toMatch(/run: bash scripts\/ci\/queue-fast-path\.sh/);
    expect(verdictJob).toMatch(/tested: \$\{\{ steps\.verdict\.outputs\.tested \}\}/);
    expect(job).toMatch(/\n {4}needs: queue-verdict\n/);
    expect(steps[guardAt]).toMatch(
      /QUEUE_TESTED: \$\{\{ needs\.queue-verdict\.outputs\.tested \}\}/
    );
    expect(steps[guardAt]).toMatch(
      /QUEUE_RUN_ID: \$\{\{ needs\.queue-verdict\.outputs\.run-id \}\}/
    );
  });

  it("a push run that isn't queue-tested never reaches a job in the deploy-production group", () => {
    // Workflow level: a push run is never in the shared group (it falls to the
    // per-run noop group), so no job of it inherits the group.
    const top = /\nconcurrency:\n {2}group: (.*)\n/.exec(workflow)?.[1] ?? '';
    expect(top).toContain("'deploy-production'");
    // Only manual runs and push-CI workflow_runs take it; nothing keyed on a push event.
    expect(top).not.toMatch(/github\.event_name (==|!=) 'push'/);
    // Job level: the jobs a push can put in the group.
    const body = workflow.slice(workflow.indexOf('\njobs:\n'));
    const grouped = jobs('deploy-production.yml')
      .map((j) => j.id)
      .filter((id) => {
        const text = body.slice(body.indexOf(`\n  ${id}:\n`) + 1).split(/\n {2}[\w-]+:\n/)[0];
        return /\n {4}concurrency:\n {6}group: [^\n]*'deploy-production'/.test(text);
      });
    expect(grouped).toEqual(['deploy-ui']);
    const tested = 'needs.queue-verdict.outputs.tested';
    for (const id of grouped) {
      expect(running('deploy-production.yml', 'push', { [tested]: 'true' }).has(id), id).toBe(true);
      expect(running('deploy-production.yml', 'push', { [tested]: 'false' }).has(id), id).toBe(
        false
      );
      expect(running('deploy-production.yml', 'push', { [tested]: '' }).has(id), id).toBe(false);
      expect(
        running('deploy-production.yml', 'push', { 'needs.queue-verdict.result': 'failure' }).has(
          id
        ),
        id
      ).toBe(false);
    }
    // The verdict job itself: no group, no cloud credentials, no install.
    expect(running('deploy-production.yml', 'push').has('queue-verdict')).toBe(true);
    expect(verdictJob).not.toMatch(/concurrency:|google-github-actions\/auth|secrets\.|pnpm/);
  });

  it('merge_group CI runs never deploy', () => {
    expect(job).not.toMatch(/merge_group/);
  });

  it('the triggering push CI run reaches the guard', () => {
    expect(steps[guardAt]).toMatch(/CI_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  });

  it('report-not-live goes red only when CI failed, not for a scoped skip', () => {
    const report = workflow.slice(workflow.indexOf('\n  report-not-live:'));
    expect(report).toMatch(/github\.event\.workflow_run\.conclusion == 'failure'/);
    expect(report).not.toMatch(/conclusion == 'success'/);
  });

  it('unfreeze is its own job; the deploy job never gets contents: write', () => {
    expect(workflow).toMatch(
      /\n {2}unfreeze:\n[\s\S]*?inputs\.unfreeze == true[\s\S]*?contents: write[\s\S]*?deploy-freeze\.sh clear/
    );
    expect(job).toMatch(/\n {4}permissions:\n {6}contents: read\n/);
    expect(job).not.toMatch(/\n {6}contents: write/);
    expect(job).toContain('inputs.unfreeze != true');
  });

  it.each(['rollback.yml', 'incident-response.yml'])(
    '%s has its own group, so a deploy can never replace a pending rollback, and freezes before moving traffic',
    (file) => {
      const text = read(`.github/workflows/${file}`);
      expect(text).not.toMatch(/group: deploy-production/);
      expect(text).toMatch(/concurrency:\n {6}group: prod-rollback\n/);
      const freezeAt = text.indexOf('deploy-freeze.sh set');
      expect(freezeAt).toBeGreaterThan(-1);
      expect(freezeAt).toBeLessThan(text.indexOf('update-traffic'));
      // A freeze failure never blocks the rollback itself.
      expect(text).toMatch(
        /deploy-freeze\.sh set "[^\n]*" \\\n\s+\|\| echo "::error::Could not set the deploy freeze; rolling back anyway/
      );
      // ...and confirms afterwards that traffic stayed on the target.
      const confirmAt = text.indexOf('confirm-rollback-traffic.sh');
      expect(confirmAt).toBeGreaterThan(text.lastIndexOf('update-traffic'));
    }
  );
});
