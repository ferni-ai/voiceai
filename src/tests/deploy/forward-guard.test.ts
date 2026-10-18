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

const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts/ci/deploy-forward-guard.sh');
const FREEZE = join(ROOT, 'scripts/ci/deploy-freeze.sh');
const CONFIRM = join(ROOT, 'scripts/ci/confirm-rollback-traffic.sh');
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
  queueTested?: string;
}): Run {
  const output = join(dir, `out-${Math.random().toString(36).slice(2)}`);
  const summary = `${output}-summary`;
  writeFileSync(output, '');
  writeFileSync(summary, '');
  const r = spawnSync('bash', [SCRIPT], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...baseEnv(opts.freezeDir ?? freshDir()),
      FAKE_FREEZE_ERROR: opts.freezeError ? '1' : '',
      DEPLOY_SHA: opts.deploy,
      EVENT: opts.event ?? 'workflow_run',
      ALLOW_OLDER: String(opts.allowOlder ?? false),
      REASON: opts.reason ?? '',
      QUEUE_TESTED: opts.queueTested ?? '',
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

  it('a push whose tree the merge queue tested deploys right away', () => {
    expect(guard({ ...push, queueTested: 'true', live: sha.b, deploy: sha.c })).toMatchObject({
      status: 0,
      deploy: 'true',
    });
  });

  it('an admin merge or direct push (not queue-tested) is a no-op: push CI deploys it', () => {
    for (const queueTested of ['false', '']) {
      const r = guard({ ...push, queueTested, live: sha.b, deploy: sha.c });
      expect(r).toMatchObject({ status: 0, deploy: 'false' });
      expect(r.summary).toMatch(/merge-queue/);
    }
  });

  it('the forward-only check holds on the fast path too', () => {
    expect(guard({ ...push, queueTested: 'true', live: sha.c, deploy: sha.b })).toMatchObject({
      status: 0,
      deploy: 'false',
    });
  });

  it('push CI passing later on a fast-pathed head deploys nothing again', () => {
    expect(guard({ live: sha.c, deploy: sha.c })).toMatchObject({ status: 0, deploy: 'false' });
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

  it('the merge-queue push path no-ops while frozen too, even when queue-tested', () => {
    const f = freshDir();
    freezeCmd(f, ['set', 'rollback']);
    const r = guard({
      freezeDir: f,
      event: 'push',
      queueTested: 'true',
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

  it('a push to main runs the job, and the queue verdict reaches the guard', () => {
    const pushToMain = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
    expect(job).toContain(pushToMain);
    expect(/\nconcurrency:\n {2}group: (.*)\n/.exec(workflow)?.[1]).toContain(pushToMain);
    expect(workflow).toMatch(/\n {2}push:\n {4}branches: \[main\]\n/);
    const queue = steps[at('Did the merge queue already test this tree?')];
    expect(queue).toMatch(/uses: \.\/\.github\/actions\/queue-tested/);
    expect(at('Did the merge queue already test this tree?')).toBeLessThan(guardAt);
    expect(steps[guardAt]).toMatch(/QUEUE_TESTED: \$\{\{ steps\.queue\.outputs\.tested \}\}/);
  });

  it('merge_group CI runs never deploy', () => {
    expect(job).not.toMatch(/merge_group/);
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
