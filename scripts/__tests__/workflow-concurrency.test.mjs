import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED,
  PR_ONLY_CANCEL,
  concurrency,
  problems,
  pullRequestTypes,
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

  it('reads the pull_request types, flow or block list', () => {
    const flow = wf(
      '  pull_request:\n    branches: [main]\n    types: [opened, labeled]\n  merge_group:'
    );
    expect(pullRequestTypes(flow)).toEqual(['opened', 'labeled']);
    const block = wf('  pull_request:\n    types:\n      - opened\n      - unlabeled\n  push:');
    expect(pullRequestTypes(block)).toEqual(['opened', 'unlabeled']);
    expect(pullRequestTypes(wf('  pull_request:\n  push:'))).toEqual([]);
  });

  // #4198: opened + labeled a second apart; one PR group cancelled one of them.
  it('flags a label trigger in the PR cancelling group, allowlisted or not', () => {
    const on = '  pull_request:\n    types: [opened, synchronize, labeled, unlabeled]';
    const found = problems('x.yml', wf(on, good));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/labeled\/unlabeled in the PR's cancelling group/);
    const allowed =
      'concurrency:\n  group: pr-flow-${{ github.event.pull_request.number }}\n  cancel-in-progress: true\n';
    expect(problems('pr-flow.yml', wf(on, allowed))).toHaveLength(1);
  });

  it('accepts a label trigger whose unread labels get their own group', () => {
    const on = '  pull_request:\n    types: [opened, labeled]';
    const conc = `concurrency:\n  group: \${{ github.workflow }}-\${{ (github.event.action == 'labeled' && github.event.label.name != 'x' && github.run_id) || github.event.pull_request.number }}\n  cancel-in-progress: ${PR_ONLY_CANCEL}\n`;
    expect(problems('x.yml', wf(on, conc))).toEqual([]);
    // pull_request_target never cancels here, and a group with no cancel never cancels.
    expect(problems('x.yml', wf('  pull_request_target:\n    types: [labeled]', good))).toEqual([]);
    const noCancel = 'concurrency:\n  group: g-${{ github.event.pull_request.number }}\n';
    expect(problems('pr-flow.yml', wf(on, noCancel))).toEqual([]);
  });

  it('skips allowlisted workflows, and every entry names a reason', () => {
    expect(problems('pr-flow.yml', wf('  pull_request:'))).toEqual([]);
    for (const reason of Object.values(ALLOWED)) expect(reason.length).toBeGreaterThan(20);
  });
});
