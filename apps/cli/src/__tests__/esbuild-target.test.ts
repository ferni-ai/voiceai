import { transform } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { ESBUILD_SUPPORTED, ESBUILD_TARGET } from '../commands/build/esbuild-target.js';

const SOURCE = "import data from './seed-data.json' with { type: 'json' };\nexport default data;\n";

describe('server build esbuild target', () => {
  it('keeps the JSON import attribute Node requires', async () => {
    const out = await transform(SOURCE, {
      loader: 'ts',
      format: 'esm',
      target: ESBUILD_TARGET,
      supported: ESBUILD_SUPPORTED,
    });
    expect(out.code).toMatch(/with\s*\{\s*type:\s*"json"\s*\}/);
  });

  it('would drop it without the supported override (why the override exists)', async () => {
    const out = await transform(SOURCE, { loader: 'ts', format: 'esm', target: ESBUILD_TARGET });
    expect(out.code).not.toMatch(/with\s*\{/);
  });
});
