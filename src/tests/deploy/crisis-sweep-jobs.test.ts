/**
 * crisis-sweep.yml's sweep is skipped on purpose (nothing crisis-related changed, or Seth
 * approved the lowering) and by accident (detection failed, so a job that needs it is
 * skipped). Both report success, so the check to require is "Crisis Sweep Verdict": it
 * runs whatever happened to the jobs it needs, and its step is green only for the
 * on-purpose skips and a passing sweep. This pins the job shape against the
 * workflow-jobs simulation and runs the verdict step's own script for every outcome.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
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
