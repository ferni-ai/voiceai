import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFrontend, parseViteVars, repoViteVars } from '../web-build-env.js';

const LIST = JSON.stringify([
  { name: 'VITE_CAPTIONS_V2', value: 'true' },
  { name: 'VITE_CAPTIONS_BREATH', value: 'true' },
  { name: 'CI_RUNNER', value: 'ubuntu-latest' },
  { name: 'VITE_VENMO_HANDLE', value: 'example-handle' },
]);

describe('parseViteVars', () => {
  it('keeps only VITE_* variables', () => {
    expect(parseViteVars(LIST)).toEqual({
      VITE_CAPTIONS_V2: 'true',
      VITE_CAPTIONS_BREATH: 'true',
      VITE_VENMO_HANDLE: 'example-handle',
    });
  });

  it('skips rows without a string name and value', () => {
    expect(parseViteVars(JSON.stringify([{ name: 'VITE_X' }, { value: 'true' }]))).toEqual({});
  });
});

describe('repoViteVars', () => {
  it('reads the variables through gh', () => {
    let ran = '';
    const vars = repoViteVars((cmd) => {
      ran = cmd;
      return LIST;
    });
    expect(ran).toBe('gh variable list --repo ferni-ai/voiceai --json name,value');
    expect(vars.VITE_CAPTIONS_V2).toBe('true');
  });

  it('throws instead of building with the flags off when gh fails', () => {
    expect(() =>
      repoViteVars(() => {
        throw new Error('not logged in');
      })
    ).toThrow(/caption and Venmo flags ship as off.*not logged in/);
  });
});

describe('repoViteVars with no VITE_* variables', () => {
  it('throws rather than building with every flag off', () => {
    expect(() => repoViteVars(() => JSON.stringify([{ name: 'CI_RUNNER', value: 'x' }]))).toThrow(
      /No VITE_\* variables/
    );
  });
});

describe('buildFrontend', () => {
  it('runs npm run build with the repo variables in its env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-build-env-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: "node -e \"require('fs').writeFileSync('out.txt', process.env.VITE_CAPTIONS_V2)\"",
        },
      })
    );
    buildFrontend(dir, { VITE_CAPTIONS_V2: 'true' });
    expect(readFileSync(join(dir, 'out.txt'), 'utf-8')).toBe('true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lets the repo value win over a local VITE_* env, so a manual deploy matches CI', () => {
    vi.stubEnv('VITE_CAPTIONS_V2', 'false');
    const dir = mkdtempSync(join(tmpdir(), 'web-build-env-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: "node -e \"require('fs').writeFileSync('out.txt', process.env.VITE_CAPTIONS_V2)\"",
        },
      })
    );
    buildFrontend(dir, { VITE_CAPTIONS_V2: 'true' });
    expect(readFileSync(join(dir, 'out.txt'), 'utf-8')).toBe('true');
  });
});
