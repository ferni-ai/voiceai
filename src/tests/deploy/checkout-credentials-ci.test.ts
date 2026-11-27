/**
 * ci.yml checks out without leaving the job token in .git/config (#4376). The one
 * step that uses the token, test-integration-related's changed-files read, gets it
 * as GH_TOKEN; every git fetch is an anonymous read of a public repo.
 */
import { describe, expect, it } from 'vitest';
import { checkouts } from './checkout-credentials.js';

/**
 * Its checkout sits before the gate files guard's step, so changing it is a
 * guard finding; it has its own PR (#4166) and row (quality-gates-permissions.test.ts).
 */
const OWN_PR = new Set(['quality-gates']);

describe('ci.yml checkouts keep the job token out of .git/config', () => {
  it('no job but quality-gates persists it', () => {
    const steps = checkouts('ci.yml');
    expect(steps.filter((s) => !OWN_PR.has(s.job)).length).toBeGreaterThanOrEqual(11);
    expect(steps.filter((s) => s.persists && !OWN_PR.has(s.job)).map((s) => s.job)).toEqual([]);
  });
});
