import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleHealthEndpoint } from '../ddos-protection.js';
import { tokenKeyId } from '../token-encryption.js';

/**
 * The public /health is unauthenticated: a key-derived id there would let
 * anyone fingerprint the token key and watch for rotations. The kid is in the
 * boot log only (token_at_rest_kid=...).
 */
describe('public /health and the token key', () => {
  const saved = process.env.LOG_HASH_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.LOG_HASH_SECRET;
    else process.env.LOG_HASH_SECRET = saved;
  });

  it('carries no token key fields, kid or key', () => {
    delete process.env.OAUTH_ENCRYPTION_KEY;
    process.env.LOG_HASH_SECRET = 'fixture-health-key';
    let body = '';
    const res = {
      writeHead: () => res,
      end: (b: string) => (body = b),
    } as unknown as ServerResponse;
    const req = {
      headers: {},
      socket: { remoteAddress: '10.0.0.1' },
    } as unknown as IncomingMessage;
    expect(handleHealthEndpoint(req, res, '/health', 'bogle-ui')).toBe(true);
    expect(JSON.parse(body)).toEqual({ status: 'ok', service: 'bogle-ui' });
    expect(body).not.toMatch(/token|kid/i);
    expect(body).not.toContain(tokenKeyId());
    expect(body).not.toContain('fixture-health-key');
  });
});
