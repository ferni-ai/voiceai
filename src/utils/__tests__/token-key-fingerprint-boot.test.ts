import { afterEach, describe, expect, it, vi } from 'vitest';

const info = vi.fn();
const error = vi.fn();
vi.mock('../safe-logger.js', () => ({
  createLogger: () => ({ info, debug: vi.fn(), warn: vi.fn(), error }),
  getLogger: () => ({ info, debug: vi.fn(), warn: vi.fn(), error }),
}));

describe('token key fingerprint at boot', () => {
  const saved = process.env.LOG_HASH_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.LOG_HASH_SECRET;
    else process.env.LOG_HASH_SECRET = saved;
  });

  it('logs the kid line once on import, without the key', async () => {
    delete process.env.OAUTH_ENCRYPTION_KEY;
    process.env.LOG_HASH_SECRET = 'fixture-boot-key';
    await import('../token-key-fingerprint-boot.js');
    const { tokenKeyIdLine } = await import('../token-at-rest.js');
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(tokenKeyIdLine());
    expect(String(info.mock.calls[0][0])).toMatch(
      /^token_at_rest_kid=[0-9a-f]{8} source=LOG_HASH_SECRET$/
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('fixture-boot-key');
  });

  it('both entry points import it', async () => {
    const { readFileSync } = await import('node:fs');
    for (const entry of ['src/agent.ts', 'src/servers/api/index.ts']) {
      expect(readFileSync(entry, 'utf8')).toContain('utils/token-key-fingerprint-boot.js');
    }
  });

  it('names the encryption secrets a production process lacks, never their values', async () => {
    const { missingProductionSecrets } = await import('../token-key-fingerprint-boot.js');
    expect(missingProductionSecrets({ NODE_ENV: 'production' })).toEqual([
      'DATA_ENCRYPTION_KEY',
      'IDENTIFIER_HASH_SECRET',
    ]);
    expect(missingProductionSecrets({ NODE_ENV: 'production', DATA_ENCRYPTION_KEY: 'x' })).toEqual([
      'IDENTIFIER_HASH_SECRET',
    ]);
    expect(
      missingProductionSecrets({
        NODE_ENV: 'production',
        DATA_ENCRYPTION_KEY: 'x',
        IDENTIFIER_HASH_SECRET: 'y',
      })
    ).toEqual([]);
    expect(missingProductionSecrets({ NODE_ENV: 'development' })).toEqual([]);
  });

  it('logs the missing names at error level at boot in production', async () => {
    vi.resetModules();
    error.mockClear();
    const saved = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.LOG_HASH_SECRET = 'fixture-boot-key'; // token key present
    process.env.DATA_ENCRYPTION_KEY = 'fixture-data-key';
    delete process.env.IDENTIFIER_HASH_SECRET;
    try {
      await import('../token-key-fingerprint-boot.js');
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][0]).toEqual({ missing: ['IDENTIFIER_HASH_SECRET'] });
      expect(JSON.stringify(error.mock.calls)).not.toContain('fixture-data-key');
    } finally {
      process.env = saved;
    }
  });
});
