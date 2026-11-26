/**
 * The build, benchmark, Chromatic, changelog and CodeQL workflows check out without leaving the
 * job token in .git/config (#4167). None of their jobs pushes, tags or fetches with auth: the
 * PR-changes check and the comment steps get the token as GH_TOKEN or through github-script, the
 * release step through the action's GITHUB_TOKEN, and every git call reads local history.
 */
import { describe, expect, it } from 'vitest';
import { checkouts } from './checkout-credentials.js';

const WORKFLOWS = [
  'android-twa.yml',
  'bth-benchmarks.yml',
  'build-apps.yml',
  'build.yml',
  'changelog.yml',
  'chromatic.yml',
  'codeql-swift.yml',
  'codeql.yml',
];

describe('build and analysis checkouts keep the job token out of .git/config', () => {
  it.each(WORKFLOWS)('%s', (workflow) => {
    const steps = checkouts(workflow);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((s) => s.persists).map((s) => s.job)).toEqual([]);
  });
});
