/**
 * Quality Gates (Blocking) runs with a read-only token that can read issues: the Flag expiry
 * step asks whether an issue is open and whether an owner's nightly issue is open
 * (scripts/flags/expiry.ts). Without issues: read the token gets an empty list, not an error,
 * so a dropped scope would quietly fail every TBD flag from 2027-01-15 (verify of #2577).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const start = workflow.indexOf('\n  quality-gates:\n');
const next = workflow.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
const job = workflow.slice(start, start + 1 + next);

describe('ci.yml quality-gates token', () => {
  it('grants exactly contents: read and issues: read, at job level', () => {
    expect(start).toBeGreaterThan(-1);
    const block = /\n {4}permissions:\n((?: {6}[\w-]+: \w+\n)+)/.exec(job);
    expect(block, 'quality-gates needs a job-level permissions block').not.toBeNull();
    const perms = Object.fromEntries(
      block![1]!
        .trim()
        .split('\n')
        .map((l) => l.trim().split(': '))
    );
    expect(perms).toEqual({ contents: 'read', issues: 'read' });
  });

  it('hands that token to the Flag expiry step and to no other step', () => {
    const steps = job.split('\n      - name: ').slice(1);
    const withToken = steps.filter((s) => /github\.token|GITHUB_TOKEN|GH_TOKEN/.test(s));
    expect(withToken.map((s) => s.split('\n')[0])).toEqual(['Flag expiry']);
    expect(withToken[0]).toContain('GH_TOKEN: ${{ github.token }}');
  });
});
