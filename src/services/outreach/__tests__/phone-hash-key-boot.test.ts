/**
 * The boot line that lets voice and web be checked for the same LOG_HASH_SECRET: both log
 * phoneHashKeyVersion (a fingerprint, never the secret). A different secret in one process means
 * a held call's phone# record never matches the inbound text's lookup.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const info = vi.fn();
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { info, debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { createLogger: () => logger, getLogger: () => logger };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  info.mockClear();
});

describe('LOG_HASH_SECRET fingerprint at boot', () => {
  it('logs phoneHashKeyVersion on import, never the secret', async () => {
    vi.stubEnv('LOG_HASH_SECRET', 'synthetic-boot-secret');
    await import('../phone-hash-key-boot.js');
    const { phoneHashKeyVersion } = await import('../checkin-replies.js');
    const version = phoneHashKeyVersion();
    expect(version).toMatch(/:[0-9a-f]{8}$/);
    expect(info).toHaveBeenCalledWith(
      { phoneHashKeyVersion: version },
      'LOG_HASH_SECRET fingerprint'
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('synthetic-boot-secret');
  });

  it('two secrets give two fingerprints; no secret says unset', async () => {
    const { phoneHashKeyVersion } = await import('../checkin-replies.js');
    expect(phoneHashKeyVersion({ LOG_HASH_SECRET: 'a' })).not.toBe(
      phoneHashKeyVersion({ LOG_HASH_SECRET: 'b' })
    );
    vi.stubEnv('LOG_HASH_SECRET', '');
    await import('../phone-hash-key-boot.js');
    expect(info).toHaveBeenCalledWith(
      { phoneHashKeyVersion: 'unset' },
      'LOG_HASH_SECRET fingerprint'
    );
  });

  it('the voice agent and the web server both import it', () => {
    for (const entry of ['src/agent.ts', 'src/servers/api/index.ts']) {
      expect(readFileSync(entry, 'utf8')).toContain('services/outreach/phone-hash-key-boot.js');
    }
  });
});
