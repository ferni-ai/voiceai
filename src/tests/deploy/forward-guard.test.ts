/**
 * The prod web deploy never moves production backwards
 * (scripts/ci/deploy-forward-guard.sh, run by deploy-production.yml).
 * workflow_run events can arrive out of order: an older head's CI can finish
 * after a newer one's, and deploying it would put an older commit over a newer
 * one. An intentional rollback (manual dispatch with allow_older and a reason)
 * must still go through.
 *
 * Runs the real script in a throwaway git repo with stand-in `gh` and `gcloud`
 * binaries. `gcloud` reports the BUILD_SHA of the revision serving traffic.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts/ci/deploy-forward-guard.sh');

let dir: string;
let repo: string;
let bin: string;
// a -> b -> c on main; side branches off a.
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

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'forward-guard-'));
  repo = join(dir, 'repo');
  bin = join(dir, 'bin');
  execFileSync('mkdir', ['-p', repo, bin]);
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

  // gh: main's tip from FAKE_TIP.
  writeFileSync(join(bin, 'gh'), '#!/usr/bin/env bash\necho "$FAKE_TIP"\n');
  // gcloud: the service (or "not found" / an API error), then the serving revision's env.
  writeFileSync(
    join(bin, 'gcloud'),
    `#!/usr/bin/env bash
case "$*" in
  *"services describe"*)
    if [ "$FAKE_SERVICE" = missing ]; then echo "ERROR: Service [john-bogle-ui] could not be found." >&2; exit 1; fi
    if [ "$FAKE_SERVICE" = error ]; then echo "ERROR: PERMISSION_DENIED" >&2; exit 1; fi
    echo '{"status":{"traffic":[{"revisionName":"john-bogle-ui-old","percent":0,"tag":"green"},{"revisionName":"john-bogle-ui-live","percent":100}]}}' ;;
  *"revisions describe john-bogle-ui-live"*)
    echo "{\\"spec\\":{\\"containers\\":[{\\"env\\":[{\\"name\\":\\"NODE_ENV\\",\\"value\\":\\"production\\"},{\\"name\\":\\"BUILD_SHA\\",\\"value\\":\\"$FAKE_LIVE\\"}]}]}}" ;;
  *) echo "unexpected gcloud $*" >&2; exit 2 ;;
esac
`
  );
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

describe('forward-only deploy guard', () => {
  it('deploys a newer commit over an older one', () => {
    const r = guard({ live: sha.a, deploy: sha.c });
    expect(r).toMatchObject({ status: 0, deploy: 'true' });
  });

  it('a late CI for an older head is a no-op, not a failure', () => {
    const r = guard({ live: sha.c, deploy: sha.b });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/move production backwards/);
  });

  it('does not deploy a commit off main history over production', () => {
    expect(guard({ live: sha.c, deploy: sha.side })).toMatchObject({ status: 0, deploy: 'false' });
  });

  it('a CI re-run on the commit already serving is a no-op', () => {
    expect(guard({ live: sha.c, deploy: sha.c })).toMatchObject({ status: 0, deploy: 'false' });
  });

  it('reads the revision serving traffic, not a 0% green tag', () => {
    // The 0% revision would have answered with nothing: this proves the 100% one was read.
    expect(guard({ live: sha.b, deploy: sha.c }).out).toMatch(/serving: john-bogle-ui-live/);
  });

  it('an older-SHA dispatch without allow_older is refused as a no-op', () => {
    const r = guard({ event: 'workflow_dispatch', live: sha.c, deploy: sha.a });
    expect(r).toMatchObject({ status: 0, deploy: 'false' });
    expect(r.summary).toMatch(/allow_older/);
  });

  it('an intentional rollback (allow_older + reason) goes through', () => {
    const r = guard({
      event: 'workflow_dispatch',
      live: sha.c,
      deploy: sha.a,
      allowOlder: true,
      reason: 'c broke sign-in',
    });
    expect(r).toMatchObject({ status: 0, deploy: 'true' });
    expect(r.summary).toMatch(/c broke sign-in/);
  });

  it('allow_older without a reason fails', () => {
    const r = guard({ event: 'workflow_dispatch', live: sha.c, deploy: sha.a, allowOlder: true, reason: '  ' });
    expect(r.status).not.toBe(0);
    expect(r.deploy).toBeUndefined();
  });

  it('allow_older is ignored on the automatic path', () => {
    expect(guard({ live: sha.c, deploy: sha.a, allowOlder: true, reason: 'x' })).toMatchObject({
      status: 0,
      deploy: 'false',
    });
  });

  it('a manual redeploy of the serving commit still runs', () => {
    expect(guard({ event: 'workflow_dispatch', live: sha.c, deploy: sha.c })).toMatchObject({
      status: 0,
      deploy: 'true',
    });
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
});

describe('deploy-production.yml wires the guard', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-production.yml'), 'utf8');
  const job = workflow.slice(workflow.indexOf('\n  deploy-ui:'), workflow.indexOf('\n  report-not-live:'));
  const steps = job.split('\n      - name: ').slice(1);
  const names = steps.map((s) => s.split('\n')[0]);
  const guardAt = names.indexOf('Forward-only guard');
  const notifyAt = names.indexOf('Create deployment summary');

  it('runs the guard script before anything is built or deployed', () => {
    expect(guardAt).toBeGreaterThan(-1);
    expect(steps[guardAt]).toMatch(/run: bash scripts\/ci\/deploy-forward-guard\.sh/);
    expect(guardAt).toBeLessThan(names.indexOf('Build and push image'));
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
    expect(workflow).toMatch(/\n {6}allow_older:\n/);
    expect(workflow).toMatch(/\n {6}reason:\n/);
    expect(steps[guardAt]).toMatch(/ALLOW_OLDER: \$\{\{ inputs\.allow_older == true \}\}/);
    expect(steps[guardAt]).toMatch(/REASON: \$\{\{ inputs\.reason \}\}/);
  });
});
