/**
 * crisis-sweep.yml's sweep is skipped on purpose (nothing crisis-related changed, or Seth
 * approved the lowering) and by accident (detection failed, so a job that needs it is
 * skipped). Both report success, so the check to require is "Crisis Sweep Verdict": it
 * runs whatever happened to the jobs it needs, and its step is green only for the
 * on-purpose skips and a passing sweep. This pins the job shape against the
 * workflow-jobs simulation and runs the verdict step's own script for every outcome.
 *
 * It also runs the sweep's "Pick the base commit" step: in the queue the base must be
 * where the group leaves main (the compare API's merge base). HEAD^1 and base_sha are
 * both the PR ahead there, so either would sweep only the last PR in a group (#2027).
 */
import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { jobs, running, triggers } from './workflow-jobs.js';

const WORKFLOW = 'crisis-sweep.yml';
const VERDICT = 'crisis-sweep-verdict';
const TEXT = readFileSync(
  join(__dirname, '..', '..', '..', '.github', 'workflows', WORKFLOW),
  'utf8'
);

/** The verdict step's `run: |` script, dedented. */
function verdictScript(): string {
  const job = TEXT.slice(TEXT.indexOf(`\n  ${VERDICT}:\n`));
  const m = /\n {8}run: \|\n((?: {10}.*\n|\n)+)/.exec(job);
  if (!m) throw new Error('verdict step script not found');
  return m[1].replace(/^ {10}/gm, '');
}

function verdict(env: Record<string, string>): number | null {
  const r = spawnSync('bash', ['-e', '-c', verdictScript()], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      CRISIS: 'true',
      PR_APPROVED: 'false',
      QUEUE_APPROVED: '',
      ...env,
    },
  });
  return r.status;
}

describe('crisis-sweep verdict job', () => {
  it('needs detection and the sweep and runs whatever their result', () => {
    const job = jobs(WORKFLOW).find((j) => j.id === VERDICT);
    expect(job?.checks).toEqual(['Crisis Sweep Verdict']);
    expect(job?.needs.sort()).toEqual(['changes', 'sweep']);
    expect(job?.if).toBe('always()');
  });

  it('runs on pull requests and in the merge queue, even when detection failed', () => {
    expect(triggers(WORKFLOW)).toEqual(expect.arrayContaining(['pull_request', 'merge_group']));
    for (const event of ['pull_request', 'merge_group'] as const) {
      const ran = running(WORKFLOW, event, { 'needs.changes.result': 'failure' });
      expect(ran.has(VERDICT), event).toBe(true);
    }
  });

  it('sweeps in the queue unless the queued PR is an approved lowering on its own', () => {
    // Unset outputs read as 'true' in the simulation, so each case names both.
    const APPROVED = 'needs.changes.outputs.queue_lowering_approved';
    const crisis = { 'needs.changes.outputs.crisis': 'true', [APPROVED]: 'false' };
    expect(running(WORKFLOW, 'merge_group', crisis).has('sweep')).toBe(true);
    const approved = { ...crisis, [APPROVED]: 'true' };
    expect(running(WORKFLOW, 'merge_group', approved).has('sweep')).toBe(false);
    const noCrisis = { 'needs.changes.outputs.crisis': 'false', [APPROVED]: 'false' };
    expect(running(WORKFLOW, 'merge_group', noCrisis).has('sweep')).toBe(false);
  });

  it('passes a sweep that passed, and a skip that had a reason', () => {
    expect(verdict({ CHANGES: 'success', SWEEP: 'success' })).toBe(0);
    expect(verdict({ CHANGES: 'success', SWEEP: 'skipped', CRISIS: 'false' })).toBe(0);
    expect(verdict({ CHANGES: 'success', SWEEP: 'skipped', PR_APPROVED: 'true' })).toBe(0);
    expect(verdict({ CHANGES: 'success', SWEEP: 'skipped', QUEUE_APPROVED: 'true' })).toBe(0);
  });

  it('fails everything else', () => {
    for (const changes of ['failure', 'cancelled', 'skipped', '']) {
      expect(verdict({ CHANGES: changes, SWEEP: 'skipped', CRISIS: 'false' }), changes).toBe(1);
      expect(verdict({ CHANGES: changes, SWEEP: 'success' }), changes).toBe(1);
    }
    for (const sweep of ['failure', 'cancelled', '']) {
      expect(verdict({ CHANGES: 'success', SWEEP: sweep, CRISIS: 'false' }), sweep).toBe(1);
    }
    // Skipped with no reason: crisis matched (or unknown) and nobody approved.
    expect(verdict({ CHANGES: 'success', SWEEP: 'skipped' })).toBe(1);
    expect(verdict({ CHANGES: 'success', SWEEP: 'skipped', CRISIS: '' })).toBe(1);
    expect(verdict({ CHANGES: 'success', SWEEP: 'skipped', QUEUE_APPROVED: 'false' })).toBe(1);
  });
});

const MERGE_BASE = 'm'.repeat(40); // where the group leaves main
const PARENT = 'p'.repeat(40); // HEAD^1: on a PR main, in the queue the PR ahead
const AHEAD = 'a'.repeat(40); // merge_group.base_sha: also the PR ahead
const GROUP_HEAD = 'h'.repeat(40);

/** A step of the sweep job: its `env:` values and `run: |` script, dedented. */
function sweepStep(name: string): { env: Record<string, string>; run: string } {
  const job = TEXT.slice(TEXT.indexOf('\n  sweep:\n'), TEXT.indexOf(`\n  ${VERDICT}:\n`));
  const step = job.slice(job.indexOf(`- name: ${name}\n`)).split(/\n {6}- /)[0];
  const env = Object.fromEntries(
    [
      ...(/\n {8}env:\n((?: {10}\S.*\n)+)/.exec(step)?.[1] ?? '').matchAll(/^ {10}(\w+): (.*)$/gm),
    ].map((m) => [m[1], m[2]])
  );
  const run = /\n {8}run: \|\n((?: {10}.*\n|\n)+)/.exec(step)?.[1].replace(/^ {10}/gm, '');
  if (!run) throw new Error(`step ${name} not found`);
  return { env, run };
}

/** `${{ }}` values for the event; an expression it doesn't know throws. */
function expand(text: string, event: 'pull_request' | 'merge_group'): string {
  const queue = event === 'merge_group';
  const ctx: Record<string, string> = {
    'github.token': 'token',
    'github.event_name': event,
    'github.repository': 'o/r',
    'github.event.merge_group.base_ref': queue ? 'refs/heads/main' : '',
    'github.event.merge_group.head_sha': queue ? GROUP_HEAD : '',
    'github.event.merge_group.base_sha': queue ? AHEAD : '',
  };
  return text.replace(/\$\{\{\s*([\w.]+)\s*\}\}/g, (_, ref: string) => {
    if (!(ref in ctx)) throw new Error(`unknown expression ${ref}`);
    return ctx[ref];
  });
}

/**
 * Runs "Pick the base commit" as Actions would (bash -eo pipefail) with a stand-in gh
 * (serves the compare's merge base, or fails) and git (HEAD^1 and fetch).
 */
function pickBase(
  event: 'pull_request' | 'merge_group',
  fake: { mergeBase?: string; ghFails?: boolean; fetchFails?: boolean } = {}
) {
  const dir = mkdtempSync(join(tmpdir(), 'crisis-base-'));
  try {
    writeFileSync(
      join(dir, 'gh'),
      `#!/usr/bin/env bash\necho "gh $*" >> "$LOG"\n[ -n "$GH_FAILS" ] && exit 1\nprintf '%s\\n' "$MERGE_BASE"\n`
    );
    writeFileSync(
      join(dir, 'git'),
      [
        '#!/usr/bin/env bash',
        'echo "git $*" >> "$LOG"',
        'case "$1 $2" in',
        `  "rev-parse HEAD^1") echo ${PARENT};;`,
        '  "fetch "*) [ -z "$FETCH_FAILS" ];;',
        '  *) exit 1;;',
        'esac',
        '',
      ].join('\n')
    );
    chmodSync(join(dir, 'gh'), 0o755);
    chmodSync(join(dir, 'git'), 0o755);
    const { env, run } = sweepStep('Pick the base commit');
    const out = join(dir, 'output');
    const log = join(dir, 'log');
    writeFileSync(out, '');
    writeFileSync(log, '');
    const stepEnv = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, expand(v, event)]));
    const r = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', expand(run, event)],
      {
        encoding: 'utf8',
        env: {
          PATH: `${dir}:${process.env.PATH}`,
          GITHUB_OUTPUT: out,
          LOG: log,
          MERGE_BASE: fake.mergeBase ?? MERGE_BASE,
          GH_FAILS: fake.ghFails ? '1' : '',
          FETCH_FAILS: fake.fetchFails ? '1' : '',
          ...stepEnv,
        },
      }
    );
    const sha = /^sha=(.*)$/m.exec(readFileSync(out, 'utf8'))?.[1];
    return { status: r.status, sha, calls: readFileSync(log, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('crisis sweep base commit', () => {
  it('in the queue is where the group leaves main, never the PR ahead', () => {
    const r = pickBase('merge_group');
    expect(r.status).toBe(0);
    expect(r.sha).toBe(MERGE_BASE);
    expect(r.sha).not.toBe(PARENT);
    expect(r.sha).not.toBe(AHEAD);
    expect(r.calls).toContain(`gh api repos/o/r/compare/main...${GROUP_HEAD} `);
    expect(r.calls).toContain(`git fetch --no-tags --depth=1 origin ${MERGE_BASE}`);
  });

  it("on a pull request is the merge commit's first parent, main", () => {
    const r = pickBase('pull_request');
    expect(r).toMatchObject({ status: 0, sha: PARENT });
    expect(r.calls).not.toContain('gh ');
  });

  it('fails the sweep, and so the verdict, when the queue base cannot be found', () => {
    for (const fake of [{ ghFails: true }, { mergeBase: '' }, { fetchFails: true }]) {
      const r = pickBase('merge_group', fake);
      expect(r.status, JSON.stringify(fake)).not.toBe(0);
      expect(r.sha, JSON.stringify(fake)).toBeUndefined();
    }
    // A failed step fails the sweep job, which the verdict reads as red.
    expect(verdict({ CHANGES: 'success', SWEEP: 'failure' })).toBe(1);
  });

  it('extracts the base tree from the picked commit', () => {
    const { env, run } = sweepStep('Extract the base tree');
    expect(env.BASE_SHA).toBe('${{ steps.base.outputs.sha }}');
    expect(run).toContain('git archive "$BASE_SHA" ');
    expect(run).not.toMatch(/HEAD\^1|base_sha/);
  });

  it('keeps each queue run in its own concurrency group, cancelling only PR runs', () => {
    const block = /^concurrency:\n {2}group: (.*)\n {2}cancel-in-progress: (.*)$/m.exec(TEXT);
    // Without the ref fallback every queue run would share one group, and a newer
    // group would cancel the pending one.
    expect(block?.[1]).toBe(
      '${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}'
    );
    expect(block?.[2]).toBe("${{ github.event_name == 'pull_request' }}");
  });
});
