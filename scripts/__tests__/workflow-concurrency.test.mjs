import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED,
  PR_ONLY_CANCEL,
  concurrency,
  problems,
  scan,
  triggers,
} from '../ci/workflow-concurrency.mjs';

const workflowsDir = fileURLToPath(new URL('../../.github/workflows', import.meta.url));

const wf = (on, conc = '') =>
  `name: X\n\non:\n${on}\n${conc}\njobs:\n  a:\n    runs-on: ubuntu-latest\n`;
const good = `concurrency:\n  group: \${{ github.workflow }}-\${{ github.event.pull_request.number || github.run_id }}\n  cancel-in-progress: ${PR_ONLY_CANCEL}\n`;

describe('workflow-concurrency', () => {
  it('passes on the repo workflows', () => {
    expect(scan(workflowsDir)).toEqual([]);
  });

  it('reads block, flow-list and single-name triggers', () => {
    expect(triggers(wf('  push:\n    branches: [main]\n  pull_request:\n  merge_group:'))).toEqual([
      'push',
      'pull_request',
      'merge_group',
    ]);
    expect(triggers('on: [push, pull_request]\n')).toEqual(['push', 'pull_request']);
    expect(triggers('on: pull_request\n')).toEqual(['pull_request']);
  });

  it('ignores workflows that do not run on pull_request', () => {
    expect(problems('x.yml', wf('  push:\n  schedule:\n    - cron: "0 0 * * *"'))).toEqual([]);
  });

  it('accepts the PR-only block', () => {
    expect(problems('x.yml', wf('  pull_request:\n  merge_group:', good))).toEqual([]);
  });

  it('flags a pull_request workflow with no concurrency group', () => {
    expect(problems('x.yml', wf('  pull_request:'))).toEqual([
      'x.yml: runs on pull_request but has no top-level concurrency group',
    ]);
  });

  it('flags cancel-in-progress: true, which also cancels merge-queue runs', () => {
    const conc =
      'concurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\n';
    const found = problems('x.yml', wf('  pull_request:\n  merge_group:', conc));
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/not keyed on github.event.pull_request.number/);
    expect(found[1]).toMatch(/cancel-in-progress must be/);
  });

  it('flags a group with no cancel (pending PR runs still pile up)', () => {
    const conc =
      'concurrency:\n  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}\n';
    expect(concurrency(wf('  pull_request:', conc)).cancel).toBe('false');
    expect(problems('x.yml', wf('  pull_request:', conc))).toHaveLength(1);
  });

  it('skips allowlisted workflows, and every entry names a reason', () => {
    expect(problems('pr-flow.yml', wf('  pull_request:'))).toEqual([]);
    for (const reason of Object.values(ALLOWED)) expect(reason.length).toBeGreaterThan(20);
  });
});
