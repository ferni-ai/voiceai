/**
 * The web server reads the owner's address from OWNER_EMAIL (config/owner-email.ts).
 * The repo is public, so the address lives only in Secret Manager (`owner-email`)
 * and reaches the server as a secret mount (secrets.txt), never as a literal env value.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENV_FILE, SECRETS_FILE, uiServerEnv, uiServerSecrets } from './ui-deploy-env.js';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('owner email secret mount', () => {
  it('the production web deploy mounts OWNER_EMAIL from Secret Manager', () => {
    expect(uiServerSecrets()).toContain('OWNER_EMAIL=owner-email:latest');
  });

  it('never as a plain env var', () => {
    expect(uiServerEnv().filter((v) => v.startsWith('OWNER_EMAIL='))).toEqual([]);
  });

  it('no Gmail address is written into the deploy files', () => {
    for (const p of ['.github/workflows/deploy-production.yml', ENV_FILE, SECRETS_FILE]) {
      expect(read(p)).not.toMatch(/@gmail\.com/i);
    }
  });
});
