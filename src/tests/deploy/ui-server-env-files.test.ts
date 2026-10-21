/**
 * The web server's env and secrets are one key per line in deploy/ui-server/,
 * not one long --set-env-vars / --set-secrets line in the workflow: every flag
 * PR edited that one line, so any two in the merge queue conflicted (#1910,
 * #1930 and #2077 were dropped for it in one week). Sorted files put parallel
 * additions on different lines.
 */
import { describe, expect, it } from 'vitest';
import {
  ENV_FILE,
  entryLines,
  SECRETS_FILE,
  uiDeployStep,
  uiServerEnv,
  uiServerSecrets,
} from './ui-deploy-env.js';

const sorted = (xs: string[]): string[] => [...xs].sort();

describe('web-server env and secrets files', () => {
  it.each([ENV_FILE, SECRETS_FILE])('%s is sorted, one entry per line', (file) => {
    const lines = entryLines(file);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines).toEqual(sorted(lines));
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('every env value is double-quoted (a bare on/off is a YAML boolean)', () => {
    for (const l of entryLines(ENV_FILE)) expect(l).toMatch(/^[A-Z][A-Z0-9_]*: "[^"\\]*"$/);
  });

  it('every secret is a pinned Secret Manager mount', () => {
    for (const l of uiServerSecrets()) expect(l).toMatch(/^[A-Z][A-Z0-9_]*=[a-z0-9-]+:latest$/);
  });

  it('the deploy passes the env file and the joined secrets, and no inline env', () => {
    const step = uiDeployStep();
    expect(step).toContain('--env-vars-file "$ENV_FILE"');
    expect(step).toContain('--set-secrets "$SECRETS"');
    expect(step).not.toContain('--set-env-vars');
  });

  it('the per-deploy keys come from the workflow, not the file', () => {
    const env = uiServerEnv();
    expect(env).toContain('BUILD_SHA=$DEPLOY_SHA');
    expect(env).toContain('GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID');
    expect(env).toContain('GCLOUD_PROJECT=$GCP_PROJECT_ID');
    expect(env).toContain('NODE_ENV=production');
  });

  it('reads per-deploy values from shell env, never ${{ }} pasted into the script', () => {
    // DEPLOY_SHA can come from a workflow_dispatch input: pasted in, it is code injection.
    expect(uiServerEnv().filter((kv) => kv.includes('${{'))).toEqual([]);
  });

  it('no env key is also a secret mount', () => {
    const envKeys = uiServerEnv().map((e) => e.split('=')[0]);
    const secretKeys = uiServerSecrets().map((s) => s.split('=')[0]);
    expect(envKeys.filter((k) => secretKeys.includes(k))).toEqual([]);
  });
});
