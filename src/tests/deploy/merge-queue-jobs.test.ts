/**
 * The merge queue builds 8 groups at once and each group's checks have 90
 * minutes. Jobs that no required check needs competed with the required ones
 * for runners on every group (a macOS iOS build among them), so they run on
 * the push to main instead, and a failed push run opens a main-red issue
 * (nightly-health.yml). This checks, by simulating merge_group and push:
 * - every required check still comes from the same job, and nothing that job
 *   needs is skipped in the queue;
 * - no job skipped in the queue reports a required check name (a skipped job
 *   reports success, so a required check from one would pass unrun);
 * - the moved jobs skip in the queue and still run on the push to main.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allNeeds, jobs, running, triggers, workflows } from './workflow-jobs.js';

/**
 * Branch protection's required contexts, from
 * `gh api repos/ferni-ai/voiceai/branches/main/protection/required_status_checks`
 * on 2026-10-19 (the only ruleset, 24473177, holds just the merge_queue rule).
 * Update this map when branch protection changes.
 */
const REQUIRED: Record<string, string> = {
  'Lint & Type Check': 'ci.yml#lint',
  'Frontend Quality': 'ci.yml#frontend-quality',
  'Unit Tests': 'ci.yml#test-unit',
  'Build & Test': 'build.yml#build',
  'Quality Gates (Blocking)': 'ci.yml#quality-gates',
  'Security Scan': 'ci.yml#security',
  'Integration Tests (1/3)': 'ci.yml#test-integration',
  'Integration Tests (2/3)': 'ci.yml#test-integration',
  'Integration Tests (3/3)': 'ci.yml#test-integration',
  'Menu E2E': 'menu-e2e.yml#gate',
};

/** Jobs no required check needs: skipped in the merge queue, run on the push to main. */
const POST_MERGE = [
  'ci.yml#test-agi-features',
  'ci.yml#build',
  'ci.yml#code-quality',
  'ci.yml#validation',
  'ci.yml#e2e-validation',
  'ci.yml#dependencies',
  'build-apps.yml#build-ios',
];

const queued = workflows().filter((w) => triggers(w).includes('merge_group'));
const all = queued.flatMap((w) => jobs(w));
const key = (w: string, id: string): string => `${w}#${id}`;
const inQueue = new Set(
  queued.flatMap((w) => [...running(w, 'merge_group')].map((id) => key(w, id)))
);
const onPush = (k: string): boolean => {
  const [w, id] = k.split('#');
  return running(w, 'push').has(id);
};

describe('the merge queue runs the required checks and only those', () => {
  it('reads the workflows (guards against an empty check)', () => {
    expect(queued).toEqual(expect.arrayContaining(['ci.yml', 'build.yml', 'menu-e2e.yml']));
    expect(all.length).toBeGreaterThan(20);
    expect(inQueue.size).toBeGreaterThan(8);
  });

  it.each(Object.entries(REQUIRED))('%s comes from %s, which runs in the queue', (check, from) => {
    const producers = all.filter((j) => j.checks.includes(check)).map((j) => key(j.workflow, j.id));
    expect(producers).toEqual([from]);
    expect(inQueue.has(from)).toBe(true);
    const [w, id] = from.split('#');
    for (const need of allNeeds(w, id)) expect(inQueue.has(key(w, need))).toBe(true);
  });

  it('no job skipped in the queue reports a required check name', () => {
    const skipped = all.filter((j) => !inQueue.has(key(j.workflow, j.id)));
    expect(skipped.length).toBeGreaterThanOrEqual(POST_MERGE.length);
    expect(skipped.flatMap((j) => j.checks).filter((c) => c in REQUIRED)).toEqual([]);
  });

  it.each(POST_MERGE)('%s skips in the queue', (k) => {
    expect(all.map((j) => key(j.workflow, j.id))).toContain(k);
    expect(inQueue.has(k)).toBe(false);
  });

  it.each(POST_MERGE)('%s runs on the push to main', (k) => {
    expect(onPush(k)).toBe(true);
  });

  // The usual push to main follows a queue merge: queue-tested finds the queue run
  // for the same tree and setup reports node 'false', which skips the required
  // Node suite. The moved jobs must not ride on that output, or they never run.
  describe('after a queue merge (setup.outputs.node is false on the push)', () => {
    // setup's outputs on that push: queue-tested turns both 'false'
    const queueTested = running('ci.yml', 'push', {
      'needs.setup.outputs.node': 'false',
      'needs.setup.outputs.voice-eval': 'false',
    });
    const moved = POST_MERGE.filter((k) => k.startsWith('ci.yml#')).map((k) => k.split('#')[1]);

    it('the required Node suite does skip (the simulation is live)', () => {
      expect(queueTested.has('lint')).toBe(false);
      expect(queueTested.has('test-unit')).toBe(false);
    });

    it.each(moved)('ci.yml#%s still runs', (id) => {
      expect(queueTested.has(id)).toBe(true);
    });
  });

  it.each(POST_MERGE.filter((k) => k.startsWith('ci.yml#')))('%s runs nightly', (k) => {
    expect(running('ci.yml', 'schedule').has(k.split('#')[1])).toBe(true);
  });

  it('a failed push run of each moved job’s workflow opens a main-red issue', () => {
    const health = readFileSync(
      join(__dirname, '..', '..', '..', '.github/workflows/nightly-health.yml'),
      'utf8'
    );
    for (const name of ['CI', 'Build Native Apps']) {
      expect(health).toContain(`      - ${name}\n`);
      expect(health).toMatch(new RegExp(`report-main:[\\s\\S]*"${name}"`));
    }
    expect(health).toMatch(/report-main:[\s\S]*workflow_run\.event == 'push'/);
  });
});
