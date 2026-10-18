import { afterEach, describe, expect, it, vi } from 'vitest';

const info = vi.fn();
vi.mock('../safe-logger.js', () => ({
  createLogger: () => ({ info, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getLogger: () => ({ info, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

describe('token key fingerprint at boot', () => {
  const saved = process.env.LOG_HASH_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.LOG_HASH_SECRET;
    else process.env.LOG_HASH_SECRET = saved;
  });

  it('logs the fingerprint line once on import, without the key', async () => {
    delete process.env.OAUTH_ENCRYPTION_KEY;
    process.env.LOG_HASH_SECRET = 'fixture-boot-key';
    await import('../token-key-fingerprint-boot.js');
    const { tokenKeyFingerprintLine } = await import('../token-at-rest.js');
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(tokenKeyFingerprintLine());
    expect(String(info.mock.calls[0][0])).toMatch(
      /^token_at_rest_key_fp=[0-9a-f]{8} source=LOG_HASH_SECRET$/
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('fixture-boot-key');
  });

  it('both entry points import it', async () => {
    const { readFileSync } = await import('node:fs');
    for (const entry of ['src/agent.ts', 'src/servers/api/index.ts']) {
      expect(readFileSync(entry, 'utf8')).toContain('utils/token-key-fingerprint-boot.js');
    }
  });
});
