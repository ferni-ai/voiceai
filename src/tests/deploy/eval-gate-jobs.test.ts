/**
 * eval-gate.yml splits the model check in two by the PR's head repo: "Model evals
 * (Vertex)" runs for this repo's branches and outside pull_request, and "Model evals
 * (fork notice)" runs only for a fork PR, which gets no secrets. The merge queue
 * carries no pull request, so the head-repo field is empty there: the Vertex job
 * must still run (it is what makes the check measurable at merge) and the fork
 * notice must not. This pins that against the workflow-jobs simulation.
 */
import { describe, expect, it } from 'vitest';
import { type Event, jobs, running } from './workflow-jobs.js';

const WORKFLOW = 'eval-gate.yml';
const VERTEX = 'Model evals (Vertex)';
const FORK_NOTICE = 'Model evals (fork notice)';
const HEAD_REPO = 'github.event.pull_request.head.repo.full_name';

/** The check names of the jobs that run for the event. */
function checksFor(event: Event, outputs: Record<string, string> = {}): string[] {
  const ran = running(WORKFLOW, event, outputs);
  return jobs(WORKFLOW)
    .filter((j) => ran.has(j.id))
    .flatMap((j) => j.checks);
}

describe('eval-gate model jobs', () => {
  it('names one job per check (guards against reading the wrong file)', () => {
    const checks = jobs(WORKFLOW).flatMap((j) => j.checks);
    expect(checks.filter((c) => c === VERTEX)).toHaveLength(1);
    expect(checks.filter((c) => c === FORK_NOTICE)).toHaveLength(1);
  });

  it('in the merge queue runs the Vertex job and not the fork notice', () => {
    const checks = checksFor('merge_group');
    expect(checks).toContain(VERTEX);
    expect(checks).not.toContain(FORK_NOTICE);
  });

  it('on a pull request from a branch of this repo does the same', () => {
    const checks = checksFor('pull_request');
    expect(checks).toContain(VERTEX);
    expect(checks).not.toContain(FORK_NOTICE);
  });

  it('on a fork pull request runs only the fork notice (the simulation is live)', () => {
    const checks = checksFor('pull_request', { [HEAD_REPO]: 'someone/fork' });
    expect(checks).toContain(FORK_NOTICE);
    expect(checks).not.toContain(VERTEX);
  });
});
