/**
 * privacy-crypto throws in production without DATA_ENCRYPTION_KEY and
 * IDENTIFIER_HASH_SECRET (smart-home credentials, developer MCP servers, OAuth
 * clients). The boot check names them when a process lacks them, and on
 * 2026-10-21 it did for the web server: no Cloud Run service mounted them.
 * The voice agent reads what this server seals, so both hold the same two
 * Secret Manager secrets. Every secret the boot check requires is mounted here.
 */
import { describe, expect, it } from 'vitest';
import { REQUIRED_PRODUCTION_SECRETS } from '../../utils/token-key-fingerprint-boot.js';
import { uiServerEnv, uiServerSecrets } from './ui-deploy-env.js';

const MOUNTS: Record<(typeof REQUIRED_PRODUCTION_SECRETS)[number], string> = {
  DATA_ENCRYPTION_KEY: 'data-encryption-key:latest',
  IDENTIFIER_HASH_SECRET: 'identifier-hash-secret:latest',
};

describe('privacy-crypto secrets on the production web server', () => {
  it.each([...REQUIRED_PRODUCTION_SECRETS])('mounts %s from Secret Manager', (name) => {
    expect(uiServerSecrets()).toContain(`${name}=${MOUNTS[name]}`);
  });

  it('never as a plain env var', () => {
    const env = uiServerEnv().join('\n');
    for (const name of REQUIRED_PRODUCTION_SECRETS) {
      expect(env).not.toMatch(new RegExp(`^${name}=`, 'm'));
    }
  });
});
