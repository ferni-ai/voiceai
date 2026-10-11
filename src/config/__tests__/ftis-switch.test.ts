/**
 * FTIS has one switch, isFtisEnabled() (config/tool-config.ts), read from
 * FTIS_ENABLED. There used to be three isFTISEnabled copies with different
 * parsing, and USE_FTIS as a second name.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isFtisEnabled, resetToolConfig } from '../tool-config.js';

const SRC = join(__dirname, '..', '..');
const NAMES = ['FTIS_ENABLED', 'USE_FTIS'] as const;
const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));

afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
  resetToolConfig();
});

function ftisWith(env: Partial<Record<(typeof NAMES)[number], string>>): boolean {
  for (const n of NAMES) {
    if (env[n] === undefined) delete process.env[n];
    else process.env[n] = env[n];
  }
  resetToolConfig();
  return isFtisEnabled();
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out);
    } else if (/\.ts$/.test(entry) && !/\.(test|spec|d)\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe('FTIS switch', () => {
  it('is off unless FTIS_ENABLED=true', () => {
    expect(ftisWith({})).toBe(false);
    expect(ftisWith({ FTIS_ENABLED: 'false' })).toBe(false);
    expect(ftisWith({ FTIS_ENABLED: 'true' })).toBe(true);
    expect(ftisWith({ FTIS_ENABLED: 'TRUE' })).toBe(true);
  });

  it('ignores USE_FTIS', () => {
    expect(ftisWith({ USE_FTIS: 'true' })).toBe(false);
  });

  it('has one definition and one env reader', () => {
    const files = sourceFiles(SRC).map((file) => ({
      file: relative(SRC, file),
      text: readFileSync(file, 'utf8'),
    }));
    expect(
      files
        .filter((f) => /function is(?:FTIS|Ftis)(?:Enabled|V2OnlyMode)\b/.test(f.text))
        .map((f) => f.file)
    ).toEqual(['config/tool-config.ts']);
    expect(
      files
        .filter((f) => /env(?:\.|\[['"])(?:FTIS_ENABLED|USE_FTIS)\b/.test(f.text))
        .map((f) => f.file)
    ).toEqual(['config/tool-config.ts']);
  });
});
