/**
 * The end-to-end and app-check workflows check out without leaving the job token in
 * .git/config (#4167). None of their jobs pushes, tags or fetches with auth.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkouts } from './checkout-credentials.js';

const WORKFLOWS = [
  'agent-e2e.yml',
  'app-checks.yml',
  'data-layer-e2e.yml',
  'e2e-critical.yml',
  'lighthouse-ci.yml',
  'menu-e2e.yml',
  'signed-in-e2e.yml',
  'website-checks.yml',
];

describe('checkouts keep the job token out of .git/config', () => {
  it.each(WORKFLOWS)('%s', (workflow) => {
    const steps = checkouts(workflow);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((s) => s.persists).map((s) => s.job)).toEqual([]);
  });

  it('reads a checkout without the setting, or set to true, as persisting', () => {
    const dir = mkdtempSync(join(tmpdir(), 'checkout-credentials-'));
    try {
      writeFileSync(
        join(dir, 'w.yml'),
        [
          'jobs:',
          '  a:',
          '    steps:',
          '      - uses: actions/checkout@v7',
          '      - uses: actions/checkout@v7',
          '        with:',
          '          persist-credentials: false',
          '  b:',
          '    steps:',
          '      - uses: actions/checkout@v7',
          '        with:',
          '          persist-credentials: "false"',
          '      - uses: actions/checkout@v7',
          '        with:',
          '          persist-credentials: true',
          '      - uses: actions/setup-node@v7',
          '',
        ].join('\n')
      );
      expect(checkouts('w.yml', dir)).toEqual([
        { job: 'a', persists: true },
        { job: 'a', persists: false },
        { job: 'b', persists: false },
        { job: 'b', persists: true },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
