/**
 * Web-server flags are declared in the deploy commands. `--set-env-vars`
 * replaces the service's env on every deploy, so a flag set by hand on Cloud
 * Run was gone after the next main push (2026-10-17: prod john-bogle-ui had
 * only the 7 vars the workflow sets; MEMORY_VIEW and JOURNAL_ONE_STORE were
 * off). Both deploy paths must carry the same flags, and the What Ferni Knows
 * panel's build flag must reach both web builds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const workflow = read('.github/workflows/deploy-production.yml');
const firebase = read('.github/workflows/deploy-firebase.yml');
const dockerfile = read('docker/Dockerfile.ui');
const cli = read('apps/cli/src/commands/deploy/deploy.ts');

/** Server flags prod's web server runs with (Seth, 2026-10-17). */
const SERVER_FLAGS = ['MEMORY_VIEW=on', 'JOURNAL_ONE_STORE=on', 'PROACTIVE_CHANNELS=on'];

/** Proactive check-ins go to the uids in this secret; the repo is public, so never inline. */
const PROACTIVE_USERS_SECRET = 'PROACTIVE_CHANNELS_USERS=proactive-channels-users:latest';

/** The `--set-env-vars` value of the workflow's john-bogle-ui deploy, split on its `::` delimiter. */
function workflowEnv(): string[] {
  const start = workflow.search(/run deploy john-bogle-ui\b/);
  expect(start).toBeGreaterThan(-1);
  const m = /--set-env-vars "\^::\^([^"]*)"/.exec(workflow.slice(start));
  expect(m).not.toBeNull();
  return m![1].split('::');
}

/** The `--set-secrets` value after `from` (the UI deploy command), split on commas. */
function secretsAfter(text: string, from: number): string[] {
  const m = /--set-secrets "([^"]*)"/.exec(text.slice(from));
  expect(m).not.toBeNull();
  return m![1].split(',');
}

/** The CLI's `--set-env-vars` value, split on its `@` delimiter. */
function cliEnv(): string[] {
  const m = /--set-env-vars "\^@\^([^"]*)"/.exec(cli);
  expect(m).not.toBeNull();
  return m![1].split('@');
}

describe('web-server flags survive a deploy', () => {
  it.each(SERVER_FLAGS)('the production workflow sets %s', (flag) => {
    expect(workflowEnv()).toContain(flag);
  });

  it.each(SERVER_FLAGS)('the ferni CLI ui deploy sets %s', (flag) => {
    expect(cliEnv()).toContain(flag);
  });

  it('both deploys mount the proactive allowlist from Secret Manager', () => {
    expect(secretsAfter(workflow, workflow.search(/run deploy john-bogle-ui\b/))).toContain(
      PROACTIVE_USERS_SECRET
    );
    expect(secretsAfter(cli, 0)).toContain(PROACTIVE_USERS_SECRET);
  });

  it('never puts the proactive allowlist in plain env', () => {
    for (const env of [workflowEnv(), cliEnv()]) {
      expect(env.filter((v) => v.startsWith('PROACTIVE_CHANNELS_USERS='))).toEqual([]);
    }
  });

  it('the What Ferni Knows build flag reaches both web builds', () => {
    expect(firebase).toMatch(/VITE_MEMORY_VIEW: \$\{\{ vars\.VITE_MEMORY_VIEW \}\}/);
    expect(workflow).toMatch(/--build-arg VITE_MEMORY_VIEW="\$\{\{ vars\.VITE_MEMORY_VIEW \}\}"/);
    expect(dockerfile).toMatch(/ARG VITE_MEMORY_VIEW=""\nENV VITE_MEMORY_VIEW=\$VITE_MEMORY_VIEW/);
  });
});
