/**
 * The web server reads its Apple keys from Secret Manager: APNS_* to push to
 * the iPhone app (token-based APNs, a .p8 key) and SIWA_* to revoke a Sign in
 * with Apple grant on account deletion. A key in --set-env-vars would sit in
 * the service's plain configuration, readable by anyone who can describe it,
 * so each must be a --set-secrets mount and never a plain env var.
 * The secrets exist in johnb-2025 with a version each (2026-10-18) and
 * john-bogle-ui@ can read them; a mount of a secret with no version fails the
 * whole deploy (see ui-dispatch-secret.test.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-production.yml'), 'utf8');

const MOUNTS = [
  'APNS_KEY_P8=apns-key-p8:latest',
  'APNS_KEY_ID=apns-key-id:latest',
  'APNS_TEAM_ID=apple-team-id:latest',
  'APNS_TOPIC=apns-topic:latest',
  'SIWA_KEY_P8=siwa-key-p8:latest',
  'SIWA_KEY_ID=siwa-key-id:latest',
  'SIWA_TEAM_ID=apple-team-id:latest',
];

/** One `--flag "value"` of the workflow's john-bogle-ui deploy. */
function uiDeployValue(flag: string): string {
  const start = workflow.search(/run deploy john-bogle-ui\b/);
  expect(start).toBeGreaterThan(-1);
  const m = new RegExp(`${flag} "([^"]*)"`).exec(workflow.slice(start));
  expect(m).not.toBeNull();
  return m![1];
}

describe('Apple push and sign-in secrets', () => {
  it.each(MOUNTS)('the production web deploy mounts %s', (mount) => {
    expect(uiDeployValue('--set-secrets').split(',')).toContain(mount);
  });

  it('never as plain env vars', () => {
    expect(uiDeployValue('--set-env-vars')).not.toMatch(/(APNS|SIWA)_[A-Z0-9_]*=/);
  });
});
