/**
 * Web-server flags are declared in the deploy commands. `--set-env-vars`
 * replaces the service's env on every deploy, so a flag set by hand on Cloud
 * Run was gone after the next main push (2026-10-17: prod john-bogle-ui had
 * only the 7 vars the workflow sets; MEMORY_VIEW and JOURNAL_ONE_STORE were
 * off). The production workflow is the only deploy path (the ferni CLI's ui
 * deploy was removed 2026-10-17), and the What Ferni Knows panel's build flag
 * must reach both web builds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const workflow = read('.github/workflows/deploy-production.yml');
const firebase = read('.github/workflows/deploy-firebase.yml');
const dockerfile = read('docker/Dockerfile.ui');

/**
 * Server flags prod's web server runs with (Seth, 2026-10-17). CALL_HOURS_GUARD
 * and FAMILY_CHECKIN_STOP are on for the agent; the web server places the calls
 * the agent defers and checks family call consent, so it needs them too.
 */
const SERVER_FLAGS = [
  'MEMORY_VIEW=on',
  'JOURNAL_ONE_STORE=on',
  'CALL_HOURS_GUARD=on',
  'FAMILY_CHECKIN_STOP=on',
  // Check-ins: the jobs run, but each sends only to people whose own flag is on (Seth, 2026-10-17).
  'COHORT_FLAGS=on',
  'PROACTIVE_CHANNELS=on',
  'FOLLOW_THROUGH_JOB=on',
  'ON_BEHALF_DNC_CHECK=on',
];

/** The `--set-env-vars` value of the workflow's john-bogle-ui deploy, split on its `::` delimiter. */
function workflowEnv(): string[] {
  const start = workflow.search(/run deploy john-bogle-ui\b/);
  expect(start).toBeGreaterThan(-1);
  const m = /--set-env-vars "\^::\^([^"]*)"/.exec(workflow.slice(start));
  expect(m).not.toBeNull();
  return m![1].split('::');
}

describe('web-server flags survive a deploy', () => {
  it.each(SERVER_FLAGS)('the production workflow sets %s', (flag) => {
    expect(workflowEnv()).toContain(flag);
  });

  it('the What Ferni Knows build flag reaches both web builds', () => {
    expect(firebase).toMatch(/VITE_MEMORY_VIEW: \$\{\{ vars\.VITE_MEMORY_VIEW \}\}/);
    expect(workflow).toMatch(/--build-arg VITE_MEMORY_VIEW="\$\{\{ vars\.VITE_MEMORY_VIEW \}\}"/);
    expect(dockerfile).toMatch(/ARG VITE_MEMORY_VIEW=""\nENV VITE_MEMORY_VIEW=\$VITE_MEMORY_VIEW/);
  });
});
