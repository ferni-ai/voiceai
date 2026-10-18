/**
 * The web server reads the owner's address from OWNER_EMAIL (config/owner-email.ts).
 * The repo is public, so the address lives only in Secret Manager (`owner-email`)
 * and reaches the server as a secret mount, never as a literal env value.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-production.yml'), 'utf8');

/** One `--flag "value"` of the workflow's john-bogle-ui deploy. */
function uiDeployValue(flag: string): string {
  const start = workflow.search(/run deploy john-bogle-ui\b/);
  expect(start).toBeGreaterThan(-1);
  const m = new RegExp(`${flag} "([^"]*)"`).exec(workflow.slice(start));
  expect(m).not.toBeNull();
  return m?.[1] ?? '';
}

describe('owner email secret mount', () => {
  it('the production web deploy mounts OWNER_EMAIL from Secret Manager', () => {
    expect(uiDeployValue('--set-secrets').split(',')).toContain('OWNER_EMAIL=owner-email:latest');
  });

  it('never as a plain env var', () => {
    expect(uiDeployValue('--set-env-vars')).not.toMatch(/OWNER_EMAIL=/);
  });

  it('no Gmail address is written into the workflow', () => {
    expect(workflow).not.toMatch(/@gmail\.com/i);
  });
});
