/**
 * The UI server signs the calls it places (proactive check-ins, on-behalf,
 * family check-ins) with DISPATCH_SIGNING_SECRET, and the voice agent verifies
 * with the same secret (#1706). On LiveKit Cloud the agent's LiveKit key is
 * injected and no signer outside the agent holds it, so without this mount the
 * agent refuses a proactive check-in's context and Ferni doesn't know why she
 * called.
 * 2026-10-17: #1721 mounted it while the secret had no version, and every prod
 * web deploy failed ("dispatch-signing-secret/versions/latest was not found"),
 * so #1809 took it out. The secret has an enabled version since 2026-10-18.
 * An agent verifies with DISPATCH_SIGNING_SECRET and LIVEKIT_API_SECRET
 * (dispatchVerifySecrets): one without the new key refuses calls signed with it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-production.yml'), 'utf8');

const MOUNT = 'DISPATCH_SIGNING_SECRET=dispatch-signing-secret:latest';

/** One `--flag "value"` of the workflow's john-bogle-ui deploy. */
function uiDeployValue(flag: string): string {
  const start = workflow.search(/run deploy john-bogle-ui\b/);
  expect(start).toBeGreaterThan(-1);
  const m = new RegExp(`${flag} "([^"]*)"`).exec(workflow.slice(start));
  expect(m).not.toBeNull();
  return m![1];
}

describe('dispatch signing secret mount', () => {
  it('the production web deploy mounts it from Secret Manager', () => {
    expect(uiDeployValue('--set-secrets').split(',')).toContain(MOUNT);
  });

  it('never as a plain env var', () => {
    expect(uiDeployValue('--set-env-vars')).not.toMatch(/DISPATCH_SIGNING_SECRET=/);
  });
});
