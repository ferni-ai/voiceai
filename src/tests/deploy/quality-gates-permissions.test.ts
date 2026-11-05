/**
 * Quality Gates (Blocking) runs with a read-only token. Each scope has one named reader:
 * - contents: checkout.
 * - issues: Flag expiry asks whether an issue is open and whether an owner's nightly issue
 *   is open (scripts/flags/expiry.ts). Without it the token gets an empty list, not an
 *   error, so a dropped scope would quietly fail every TBD flag from 2027-01-15.
 * - pull-requests + actions: the gate files guard reads the PR's label events and this
 *   run's start time (scripts/ci/gate-files-guard.sh, the two `gh api` calls).
 * Nothing else in the job gets the token; cache restore uses the runner's own.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const start = workflow.indexOf('\n  quality-gates:\n');
const next = workflow.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
const job = workflow.slice(start, start + 1 + next);

describe('ci.yml quality-gates token', () => {
  it('grants exactly the four read scopes its steps use, at job level', () => {
    expect(start).toBeGreaterThan(-1);
    const block = /\n {4}permissions:\n((?: {6}[\w-]+: \w+\n)+)/.exec(job);
    expect(block, 'quality-gates needs a job-level permissions block').not.toBeNull();
    const perms = Object.fromEntries(
      block![1]!
        .trim()
        .split('\n')
        .map((l) => l.trim().split(': '))
    );
    expect(perms).toEqual({
      contents: 'read',
      'pull-requests': 'read',
      issues: 'read',
      actions: 'read',
    });
  });

  it('hands that token to the gate files guard and Flag expiry, and to no other step', () => {
    const steps = job.split('\n      - name: ').slice(1);
    const withToken = steps.filter((s) => /github\.token|GITHUB_TOKEN|GH_TOKEN/.test(s));
    expect(withToken.map((s) => s.split('\n')[0])).toEqual(['Gate files guard', 'Flag expiry']);
    for (const step of withToken) expect(step).toContain('GH_TOKEN: ${{ github.token }}');
  });
});
