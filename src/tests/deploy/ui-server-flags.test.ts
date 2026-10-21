/**
 * Web-server flags are declared in deploy/ui-server/env.yaml, which the deploy
 * passes as --env-vars-file. It replaces the service's env on every deploy, so a flag set by hand on Cloud
 * Run was gone after the next main push (2026-10-17: prod john-bogle-ui had
 * only the 7 vars the workflow sets; MEMORY_VIEW and JOURNAL_ONE_STORE were
 * off). The production workflow is the only deploy path (the ferni CLI's ui
 * deploy was removed 2026-10-17), and the What Ferni Knows panel's build flag
 * must reach both web builds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { uiServerEnv as workflowEnv, uiServerSecrets as workflowSecrets } from './ui-deploy-env.js';

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
  // The hourly pondering job (ponder-job.ts). On the web server it reads only the
  // friends-and-family cohort plus PONDERING_USERS, and only writes their pondering doc.
  'PONDERING=on',
  // The whole team from the first call, introduced by need (Seth, 2026-10-20; the agent has it too).
  'TEAM_BY_NEED=on',
  // The web server places the on-behalf calls the agent defers, so it runs the do-not-call check too.
  'ON_BEHALF_DNC_CHECK=on',
];

/** Proactive check-ins go to the uids in this secret; the repo is public, so never inline. */
const PROACTIVE_USERS_SECRET = 'PROACTIVE_CHANNELS_USERS=proactive-channels-users:latest';

describe('web-server flags survive a deploy', () => {
  it.each(SERVER_FLAGS)('the production workflow sets %s', (flag) => {
    expect(workflowEnv()).toContain(flag);
  });

  it('sends app email through the ferni.ai Workspace, switchable back by repo variable', () => {
    // The step's env holds the repo variables; the script reads them from the shell.
    const workflow = read('.github/workflows/deploy-production.yml');
    const at = workflow.indexOf('id: deploy');
    const stepEnv = workflow.slice(at, workflow.indexOf('run: |', at));
    expect(stepEnv).toContain("EMAIL_PROVIDER: ${{ vars.EMAIL_PROVIDER || 'gmail' }}");
    expect(stepEnv).toContain("EMAIL_FROM: ${{ vars.EMAIL_FROM || 'admin@ferni.ai' }}");
    const env = workflowEnv();
    expect(env).toContain('EMAIL_PROVIDER=$EMAIL_PROVIDER');
    expect(env).toContain('EMAIL_FROM=$EMAIL_FROM');
  });

  it('the production workflow mounts the proactive allowlist from Secret Manager', () => {
    expect(workflowSecrets()).toContain(PROACTIVE_USERS_SECRET);
  });

  it('never puts the proactive allowlist in plain env', () => {
    expect(workflowEnv().filter((v) => v.startsWith('PROACTIVE_CHANNELS_USERS='))).toEqual([]);
  });

  it('the What Ferni Knows build flag reaches both web builds', () => {
    expect(firebase).toMatch(/VITE_MEMORY_VIEW: \$\{\{ vars\.VITE_MEMORY_VIEW \}\}/);
    expect(workflow).toMatch(/--build-arg VITE_MEMORY_VIEW="\$\{\{ vars\.VITE_MEMORY_VIEW \}\}"/);
    expect(dockerfile).toMatch(/ARG VITE_MEMORY_VIEW=""\nENV VITE_MEMORY_VIEW=\$VITE_MEMORY_VIEW/);
  });

  // The toasts kill switch (apps/web/src/ui/overlay/toast-flag.ts) must reach both
  // builds, or setting VITE_TOAST_REGION=off would change nothing.
  it('the toast-region kill switch reaches both web builds', () => {
    expect(firebase).toMatch(/VITE_TOAST_REGION: \$\{\{ vars\.VITE_TOAST_REGION \}\}/);
    expect(workflow).toMatch(/--build-arg VITE_TOAST_REGION="\$\{\{ vars\.VITE_TOAST_REGION \}\}"/);
    expect(dockerfile).toMatch(
      /ARG VITE_TOAST_REGION=""\nENV VITE_TOAST_REGION=\$VITE_TOAST_REGION/
    );
  });
});
