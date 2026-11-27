/**
 * Opening a PR with a label fires `opened` and `labeled` about a second apart (#4198).
 * While both shared the PR's concurrency group, the second cancelled the first: a
 * cancelled Crisis Sweep run's fail-closed Verdict stayed red on a head the other run
 * passed, and a cancelled PR Flow check blocked auto-merge. Each needed a manual rerun.
 *
 * Now a label the workflow doesn't read runs the whole check in a group of its own, so
 * it can neither cancel the PR's run nor be cancelled by it. It never skips: a skipped
 * job's check counts as passing, and as the newest run of that name it would stand in
 * for a red Verdict (the gate would fail open). A label it does read still joins the
 * PR's group, as do a push and a reopen: those change the result, so the older run is
 * superseded. The verdict fails closed for a cancelled or failed run
 * (crisis-sweep-jobs.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { allNeeds, concurrencyGroup, running } from './workflow-jobs.js';

// Unset outputs read as 'true' in the simulation; a PR run is never a queue approval.
const NOT_QUEUED = { 'needs.changes.outputs.queue_lowering_approved': 'false' };
const CASES = [
  {
    workflow: 'crisis-sweep.yml',
    reads: 'crisis:lowering-approved',
    check: 'crisis-sweep-verdict',
    pr: NOT_QUEUED,
  },
  { workflow: 'pr-flow.yml', reads: 'size/large-ok', check: 'pr-flow', pr: {} },
] as const;

/** A pull_request event's payload fields; run-2 is a run other than the opened one. */
const label = (action: string, name: string): Record<string, string> => ({
  'github.event.action': action,
  'github.event.label.name': name,
  'github.run_id': 'run-2',
});
const action = (a: string): Record<string, string> => ({
  'github.event.action': a,
  'github.run_id': 'run-2',
});

describe.each(CASES)('$workflow label runs', ({ workflow, reads, check, pr }) => {
  const opened = concurrencyGroup(workflow, 'pull_request');
  /** The check and every job it needs (a skipped need fails the crisis verdict closed). */
  const whole = [check, ...allNeeds(workflow, check)];

  it('opened runs the check in the PR group', () => {
    expect(opened).toContain('101');
    const ran = running(workflow, 'pull_request', pr);
    for (const id of whole) expect(ran.has(id), id).toBe(true);
  });

  it('a label it does not read runs the whole check without cancelling the opened run', () => {
    for (const a of ['labeled', 'unlabeled']) {
      for (const name of ['hold', 'ci:full-tests', '']) {
        const ev = label(a, name);
        expect(concurrencyGroup(workflow, 'pull_request', ev), `${a} ${name}`).not.toBe(opened);
        const ran = running(workflow, 'pull_request', { ...pr, ...ev });
        for (const id of whole) expect(ran.has(id), `${a} ${name} ${id}`).toBe(true);
      }
    }
  });

  it('no event skips the check, whatever the jobs it needs did', () => {
    const events = ['opened', 'synchronize', 'reopened', 'edited', 'ready_for_review'].map(action);
    for (const a of ['labeled', 'unlabeled']) {
      for (const name of [reads, 'hold', '']) events.push(label(a, name));
    }
    const needs = allNeeds(workflow, check);
    for (const ev of events) {
      for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
        const outcome = Object.fromEntries(needs.map((n) => [`needs.${n}.result`, result]));
        const ran = running(workflow, 'pull_request', { ...pr, ...ev, ...outcome });
        expect(ran.has(check), `${JSON.stringify(ev)} needs ${result}`).toBe(true);
      }
    }
  });

  it('its own label, a push and a reopen supersede the PR run and run the check', () => {
    for (const ev of [
      label('labeled', reads),
      label('unlabeled', reads),
      action('synchronize'),
      action('reopened'),
    ]) {
      const what = JSON.stringify(ev);
      expect(concurrencyGroup(workflow, 'pull_request', ev), what).toBe(opened);
      const ran = running(workflow, 'pull_request', { ...pr, ...ev });
      for (const id of whole) expect(ran.has(id), `${what} ${id}`).toBe(true);
    }
  });

  it('different PRs never share a group', () => {
    const other = { 'github.event.pull_request.number': '202' };
    expect(concurrencyGroup(workflow, 'pull_request', other)).not.toBe(opened);
  });
});

describe('crisis sweep in the merge queue', () => {
  it('keeps its ref-keyed group and runs the verdict', () => {
    expect(concurrencyGroup('crisis-sweep.yml', 'merge_group')).toBe(
      'Crisis Sweep-refs/heads/main'
    );
    expect(running('crisis-sweep.yml', 'merge_group').has('crisis-sweep-verdict')).toBe(true);
  });
});
