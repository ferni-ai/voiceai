import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveProjectRoot } from '../project-root.js';

function fakeRepo(): { root: string; moduleUrl: string } {
  const root = mkdtempSync(join(tmpdir(), 'ferni-root-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  const dir = join(root, 'apps', 'cli', 'src', 'features', 'ops');
  mkdirSync(dir, { recursive: true });
  return { root, moduleUrl: pathToFileURL(join(dir, 'perf.ts')).href };
}

describe('resolveProjectRoot', () => {
  const saved = process.env.FERNI_PROJECT_ROOT;
  afterEach(() => {
    if (saved === undefined) delete process.env.FERNI_PROJECT_ROOT;
    else process.env.FERNI_PROJECT_ROOT = saved;
  });

  it('finds the workspace root from a nested module, however deep', () => {
    delete process.env.FERNI_PROJECT_ROOT;
    const { root, moduleUrl } = fakeRepo();
    expect(resolveProjectRoot(moduleUrl)).toBe(root);
  });

  it('prefers FERNI_PROJECT_ROOT', () => {
    process.env.FERNI_PROJECT_ROOT = '/somewhere/else';
    expect(resolveProjectRoot(fakeRepo().moduleUrl)).toBe('/somewhere/else');
  });

  it('uses the working directory in the SEA binary', () => {
    delete process.env.FERNI_PROJECT_ROOT;
    expect(resolveProjectRoot('file:///ferni-sea-binary/index.js')).toBe(process.cwd());
  });

  it('resolves this repo from a real feature module', () => {
    delete process.env.FERNI_PROJECT_ROOT;
    const url = new URL('../../features/ops/perf.ts', import.meta.url).href;
    expect(resolveProjectRoot(url)).toBe(new URL('../../../../../', import.meta.url).pathname.replace(/\/$/, ''));
  });
});
