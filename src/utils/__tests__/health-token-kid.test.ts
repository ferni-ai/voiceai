import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { handleHealthEndpoint } from '../ddos-protection.js';
import { tokenKeyId } from '../token-encryption.js';

describe('/health reports the token key id', () => {
  const saved = process.env.LOG_HASH_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.LOG_HASH_SECRET;
    else process.env.LOG_HASH_SECRET = saved;
  });

  it('includes tokenKid and its source, never the key', () => {
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
    expect(JSON.parse(body)).toEqual({
      status: 'ok',
      service: 'bogle-ui',
      tokenKid: tokenKeyId(),
      tokenKeySource: 'LOG_HASH_SECRET',
    });
    expect(tokenKeyId()).toMatch(/^[0-9a-f]{8}$/);
    expect(body).not.toContain('fixture-health-key');
  });
});
