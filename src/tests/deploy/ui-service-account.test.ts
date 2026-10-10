/**
 * The production UI runs as its own least-privilege service account. Without
 * --service-account, Cloud Run keeps whatever the service had, and a new
 * service (or a revert) falls back to the default compute account, which has
 * Editor on the whole project.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-production.yml'), 'utf8');
const cli = readFileSync(join(ROOT, 'apps/cli/src/commands/deploy/deploy.ts'), 'utf8');

/** The UI service's Cloud Run deploy command, up to its last continued line. */
function uiDeployCommand(text: string): string {
  const start = text.search(/run deploy john-bogle-ui\b/);
  expect(start).toBeGreaterThan(-1);
  const lines = text.slice(start).split('\n');
  const end = lines.findIndex((l) => !l.trimEnd().endsWith('\\'));
  return lines.slice(0, end + 1).join('\n');
}

describe('john-bogle-ui service account', () => {
  it('the production workflow deploys the UI as john-bogle-ui@', () => {
    expect(uiDeployCommand(workflow)).toMatch(
      /--service-account john-bogle-ui@\$\{\{ env\.GCP_PROJECT_ID \}\}\.iam\.gserviceaccount\.com/
    );
  });

  it('never as the default compute account', () => {
    expect(workflow).not.toMatch(/compute@developer\.gserviceaccount\.com/);
    expect(cli).not.toMatch(/compute@developer\.gserviceaccount\.com/);
  });

  it('the ferni CLI ui deploy uses the same account', () => {
    expect(cli).toMatch(/--service-account john-bogle-ui@\$\{CONFIG\.projectId\}\.iam\.gserviceaccount\.com/);
  });
});
