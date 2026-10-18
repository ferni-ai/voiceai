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
# gh api repos/o/r/commits/main --jq .sha | gh api repos/o/r/compare/BASE...HEAD --jq .status
path=$2
case "$path" in
  */commits/main) echo "$FAKE_TIP" ;;
  */compare/*)
    spec=\${path##*/compare/}; base=\${spec%%...*}; head=\${spec##*...}
    [ "$base" = main ] && base=$FAKE_TIP
    [ "$head" = main ] && head=$FAKE_TIP
    git cat-file -e "$base^{commit}" 2>/dev/null && git cat-file -e "$head^{commit}" 2>/dev/null \\
      || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }
    if [ "$base" = "$head" ]; then echo identical
    elif git merge-base --is-ancestor "$base" "$head"; then echo ahead
    elif git merge-base --is-ancestor "$head" "$base"; then echo behind
    else echo diverged; fi ;;
  *) echo "unexpected gh $*" >&2; exit 2 ;;
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
      PATH: `${bin}:${process.env.PATH}`,
      HOME: process.env.HOME,
      DEPLOY_SHA: opts.deploy,
      EVENT: opts.event ?? 'workflow_run',
      ALLOW_OLDER: String(opts.allowOlder ?? false),
      REASON: opts.reason ?? '',
      QUEUE_TESTED: opts.queueTested ?? '',
      GCP_REGION: 'us-central1',
      GCP_PROJECT_ID: 'p',
      GITHUB_REPOSITORY: 'o/r',
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      FAKE_TIP: opts.tip ?? sha.c,
      FAKE_LIVE: opts.live ?? '',
      FAKE_SERVICE: opts.service ?? 'ok',
    },
  });
  const deploy = /^deploy=(\w+)$/m.exec(readFileSync(output, 'utf8'))?.[1];
  return { status: r.status, deploy, summary: readFileSync(summary, 'utf8'), out: r.stdout + r.stderr };
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
    expect(guard({ service: 'missing', deploy: sha.c })).toMatchObject({ status: 0, deploy: 'true' });
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
    const r = guard({ ...dispatch, live: sha.c, deploy: sha.a, allowOlder: true, reason: 'c broke sign-in' });
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
    expect(guard({ ...dispatch, live: sha.c, deploy: sha.c })).toMatchObject({ status: 0, deploy: 'true' });
  });

  it('a forward deploy runs', () => {
    expect(guard({ ...dispatch, live: sha.a, deploy: sha.c })).toMatchObject({ status: 0, deploy: 'true' });
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

describe('deploy-production.yml wiring', () => {
  const workflow = read('.github/workflows/deploy-production.yml');
  const job = workflow.slice(workflow.indexOf('\n  deploy-ui:'), workflow.indexOf('\n  report-not-live:'));
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
    expect(workflow).toMatch(/DEPLOY_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \|\| inputs\.sha \|\| github\.sha \}\}/);
    expect(steps[guardAt]).toMatch(/ALLOW_OLDER: \$\{\{ inputs\.allow_older == true \}\}/);
    expect(steps[guardAt]).toMatch(/REASON: \$\{\{ inputs\.reason \}\}/);
  });

  it('manual deploys run only from main, in the job if and the concurrency group', () => {
    const dispatchFromMain = "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'";
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
    expect(steps[at('Run smoke tests')]).toMatch(/SMOKE_TEST_URL: \$\{\{ steps\.deploy\.outputs\.green_url \}\}/);
    expect(at('Run smoke tests')).toBeLessThan(at('Shift traffic to green'));
    expect(steps[at('Rollback on failure')]).toMatch(/steps\.smoke\.outcome == 'failure'/);
    expect(steps[at('🟢 Deploy GREEN revision (no traffic)')]).toMatch(/select\(\.tag == "green"\) \| \.url/);
  });

  it('a redeploy of the same commit gets a fresh revision name', () => {
    expect(steps[at('🟢 Deploy GREEN revision (no traffic)')]).toMatch(
      /REVISION_SUFFIX=\$\{\{ steps\.meta\.outputs\.revision_suffix \}\}/
    );
    expect(steps[at('Generate metadata')]).toMatch(/revision_suffix=\$\{DEPLOY_SHA::8\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
  });

  it.each(['rollback.yml', 'incident-response.yml'])('%s shares the deploy-production group', (file) => {
    expect(read(`.github/workflows/${file}`)).toMatch(/concurrency:\n {6}group: deploy-production\n/);
  });
});
