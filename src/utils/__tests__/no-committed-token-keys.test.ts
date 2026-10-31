/**
 * Source scan: no credential store may fall back to a key written in the
 * repo (this repo is public, so such a key protects nothing). A key comes
 * from the environment or the write is refused.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|js|mjs)$/.test(name) && !/\.test\.|\.spec\./.test(name)) out.push(path);
  }
  return out;
}

/** `process.env.<…ENCRYPTION|SEALING|CIPHER…> || '<literal>'` (or ??) on one line. */
const ENV_KEY_WITH_LITERAL =
  /process\.env\.[A-Z0-9_]*(?:ENCRYPTION|SEALING|CIPHER)[A-Z0-9_]*\s*(?:\|\||\?\?)\s*['"`][^'"`]+['"`]/;

describe('no committed token keys', () => {
  const files = sourceFiles(SRC);

  it('scans a real tree', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.endsWith('services/integrations/oauth-token-store.ts'))).toBe(true);
  });

  it('no encryption key env var falls back to a string literal', () => {
    const hits = files.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${relative(SRC, f)}:${i + 1}` }))
        .filter(({ line }) => ENV_KEY_WITH_LITERAL.test(line))
        .map(({ at }) => at)
    );
    expect(hits).toEqual([]);
  });

  it('the credential stores derive no key of their own', () => {
    for (const rel of [
      'services/integrations/oauth-token-store.ts',
      'services/webhooks/webhook-config-store.ts',
      'services/webhooks/webhook-sealing.ts',
    ]) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      expect(text, rel).not.toMatch(
        /createCipheriv|scryptSync|process\.env\.\w*(?:ENCRYPTION|SALT)/
      );
    }
  });

  it('privacy-crypto (smart_home secrets) refuses to encrypt in production without its key', async () => {
    const savedKey = process.env.DATA_ENCRYPTION_KEY;
    const savedEnv = process.env.NODE_ENV;
    try {
      delete process.env.DATA_ENCRYPTION_KEY;
      process.env.NODE_ENV = 'production';
      const { encryptSensitive } = await import('../../services/platform/privacy-crypto.js');
      await expect(encryptSensitive('lifx-token', 'u/smart_home/lifx/token')).rejects.toThrow(
        'DATA_ENCRYPTION_KEY must be set in production'
      );
      process.env.DATA_ENCRYPTION_KEY = 'test-only-data-key';
      await expect(encryptSensitive('lifx-token', 'aad')).resolves.toMatch(/^enc_/);
    } finally {
      if (savedKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
      else process.env.DATA_ENCRYPTION_KEY = savedKey;
      process.env.NODE_ENV = savedEnv;
    }
  });
});
