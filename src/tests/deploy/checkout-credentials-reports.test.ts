import { describe, expect, it } from 'vitest';
import { checkouts } from './checkout-credentials.js';

const WORKFLOWS = [
  'blog-drafts.yml',
  'blog-publish-check.yml',
  'ci-health.yml',
  'design-system.yml',
  'devops-dashboard.yml',
  'eval-gate.yml',
  'rust-native.yml',
];

describe('blog, report, eval and package build checkouts keep the job token out of .git/config', () => {
  it.each(WORKFLOWS)('%s', (workflow) => {
    const steps = checkouts(workflow);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((s) => s.persists).map((s) => s.job)).toEqual([]);
  });
});
