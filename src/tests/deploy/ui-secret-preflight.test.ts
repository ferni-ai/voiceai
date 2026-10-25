/**
 * The secret preflight must check the same mounts the deploy passes: both
 * read deploy/ui-server/secrets.txt with the same line, and the preflight
 * runs before the deploy, so a secret with no enabled version fails the job
 * instead of leaving a revision that cannot start (2026-10-17).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SECRETS_FILE, uiDeployStep } from './ui-deploy-env.js';

const ROOT = join(__dirname, '..', '..', '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-production.yml'), 'utf8');
const SECRETS_LINE = `SECRETS=$(grep -v -e '^#' -e '^$' ${SECRETS_FILE} | paste -sd, -)`;

/** The body of one step, from its `- name:` line to the next step. */
function step(name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = workflow.indexOf('\n      - name: ', start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
}

describe('secret preflight', () => {
  const preflight = step('🔐 Preflight - every mounted secret has an enabled version');

  it('reads the same secrets file, the same way, as the deploy', () => {
    expect(preflight).toContain(SECRETS_LINE);
    expect(uiDeployStep()).toContain(SECRETS_LINE);
    expect(preflight).toContain('IFS=\',\' read -ra entries <<< "$SECRETS"');
  });

  it('keeps no second hand-kept list of secrets', () => {
    expect(workflow).not.toMatch(/UI_SECRETS/);
    expect(preflight).not.toMatch(/=[a-z0-9-]+:latest/);
  });

  it('runs before the deploy and fails the job on a bad secret', () => {
    expect(workflow.indexOf(preflight)).toBeLessThan(workflow.search(/run deploy john-bogle-ui\b/));
    expect(preflight).toMatch(/if \(\( \$\{#bad\[@\]\} > 0 \)\); then[\s\S]*exit 1/);
  });

  it('verifies the new revision only when the preflight passed', () => {
    const verify = step('✅ Verify the new revision is Ready and serving');
    expect(verify).toContain("steps.preflight.outcome == 'success'");
  });
});
