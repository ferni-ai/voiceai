import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProjectRoot } from '../utils/project-root.js';

// Web deploys run only through the GitHub workflows. `ferni deploy <web target>`
// must print the workflow run that does the job, exit 1, and touch no cloud
// tool. Fake gcloud/gsutil/firebase/gh first on PATH record any call.
const root = findProjectRoot();
const tsx = join(root, 'node_modules', '.bin', 'tsx');
const TOOLS = ['gcloud', 'gsutil', 'firebase', 'gh', 'docker'];

function deploy(args: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'ferni-fake-cloud-'));
  const calls = join(dir, 'calls.log');
  for (const tool of TOOLS) {
    writeFileSync(join(dir, tool), `#!/bin/sh\necho "${tool} $@" >> "${calls}"\n`);
    chmodSync(join(dir, tool), 0o755);
  }
  const r = spawnSync(tsx, [join(root, 'apps/cli/src/commands/deploy/deploy.ts'), ...args], {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    timeout: 60_000,
  });
  return {
    status: r.status,
    output: `${r.stdout}${r.stderr}`,
    calls: existsSync(calls) ? readFileSync(calls, 'utf-8') : '',
  };
}

describe.each([
  ['ui', ['deploy-production.yml --ref main -f service=ui-server']],
  ['frontend', ['deploy-firebase.yml --ref main -f target=app']],
  ['landing', ['deploy-firebase.yml --ref main -f target=landing']],
  [
    'all',
    [
      'deploy-production.yml --ref main -f service=ui-server',
      'deploy-firebase.yml --ref main -f target=both',
    ],
  ],
])('ferni deploy %s', (target, workflows) => {
  it('prints the workflow run instead of deploying, and calls no cloud tool', () => {
    const r = deploy([target, '--dry-run']);
    for (const w of workflows) expect(r.output).toContain(`gh workflow run ${w}`);
    expect(r.calls).toBe('');
    expect(r.status).toBe(1);
  });
});

describe.each(['brand', 'intelligence'])('ferni deploy %s', (target) => {
  it('is gone: no live target behind it', () => {
    const r = deploy([target, '--dry-run']);
    expect(r.output).toContain('Unknown or removed target');
    expect(r.calls).toBe('');
    expect(r.status).toBe(1);
  });
});
