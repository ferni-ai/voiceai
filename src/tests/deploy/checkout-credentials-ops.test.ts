/**
 * The secret-scan, security-scan, health and repo-automation workflows check out without leaving
 * the job token in .git/config (#4167). None of their jobs pushes or tags. The steps that call
 * the API get a token as GH_TOKEN, and the one git fetch (the secret scan of pushed commits) is an
 * anonymous read of this public repo.
 */
import { describe, expect, it } from 'vitest';
import { checkouts } from './checkout-credentials.js';

const WORKFLOWS = [
  'cancel-orphan-queue-runs.yml',
  'ferni-liveness.yml',
  'memory-recall-gate.yml',
  'nightly-health.yml',
  'pr-flow.yml',
  'required-check-backfill.yml',
  'secret-scan-main.yml',
  'security-scan.yml',
];

describe('scan, health and automation checkouts keep the job token out of .git/config', () => {
  it.each(WORKFLOWS)('%s', (workflow) => {
    const steps = checkouts(workflow);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((s) => s.persists).map((s) => s.job)).toEqual([]);
  });
});
