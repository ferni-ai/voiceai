/**
 * The user token sent to marketplace tools is an HMAC keyed by
 * MARKETPLACE_HMAC_SECRET. Unset, signing refuses and the tool is never called:
 * the old fallback key was committed to this public repo.
 */
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/safe-logger.js', () => {
  const noop = () => undefined;
  const logger = { debug: noop, info: noop, warn: noop, error: noop, child: () => logger };
  return { getLogger: () => logger, createLogger: () => logger };
});

const { anonymizeUserId } = await import('../auth/index.js');
const { executeHttpTool } = await import('../executor/http-executor.js');

const manifest = {
  id: 'tool-1',
  version: '1.0.0',
  execution: { runtime: { endpoint: 'https://tools.example.com/run' } },
} as unknown as Parameters<typeof executeHttpTool>[0];
const context = { userId: 'user-1', agentId: 'ferni' } as unknown as Parameters<
  typeof executeHttpTool
>[2];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('anonymizeUserId', () => {
  it('refuses to sign without MARKETPLACE_HMAC_SECRET', () => {
    vi.stubEnv('MARKETPLACE_HMAC_SECRET', '');
    expect(() => anonymizeUserId('user-1', 'tool-1')).toThrow(
      expect.objectContaining({ code: 'MARKETPLACE_HMAC_UNAVAILABLE' })
    );
  });

  it('is the HMAC-SHA256 of userId:toolId under the secret, per tool and per secret', () => {
    vi.stubEnv('MARKETPLACE_HMAC_SECRET', 'fixture-secret-a');
    const expected = createHmac('sha256', 'fixture-secret-a')
      .update('user-1:tool-1')
      .digest('base64url')
      .slice(0, 32);
    const token = anonymizeUserId('user-1', 'tool-1');
    expect(token).toBe(`anon_${expected}`);
    expect(anonymizeUserId('user-1', 'tool-2')).not.toBe(token);
    vi.stubEnv('MARKETPLACE_HMAC_SECRET', 'fixture-secret-b');
    expect(anonymizeUserId('user-1', 'tool-1')).not.toBe(token);
  });
});

describe('executeHttpTool without MARKETPLACE_HMAC_SECRET', () => {
  it('rejects before anything is fetched', async () => {
    vi.stubEnv('MARKETPLACE_HMAC_SECRET', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(executeHttpTool(manifest, {}, context, {} as never, 5000)).rejects.toThrow(
      /MARKETPLACE_HMAC_SECRET/
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
