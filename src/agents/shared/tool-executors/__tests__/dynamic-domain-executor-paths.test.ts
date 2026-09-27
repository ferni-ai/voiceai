/**
 * Every DOMAIN_MODULES path is resolved relative to the executor file. They
 * were written one directory short ('../../tools/...' from
 * agents/shared/tool-executors/ lands in agents/tools/, which does not exist),
 * so every import failed, was logged at debug level, and the executor loaded 0
 * domains. This pins that each path points at a real module.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOMAIN_MODULES } from '../dynamic-domain-executor.js';

const executorDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('DOMAIN_MODULES', () => {
  it('maps at least one domain', () => {
    expect(Object.keys(DOMAIN_MODULES).length).toBeGreaterThan(0);
  });

  it('points every domain at a module that exists', () => {
    const missing = Object.entries(DOMAIN_MODULES)
      .filter(([, p]) => !existsSync(resolve(executorDir, p).replace(/\.js$/, '.ts')))
      .map(([name, p]) => `${name} -> ${p}`);
    expect(missing).toEqual([]);
  });
});

describe('dynamic domain executor loads real tools', () => {
  it('finds tool ids once the domains import', async () => {
    const { getDynamicToolIds, resetDynamicExecutor } = await import('../dynamic-domain-executor.js');
    resetDynamicExecutor();
    const ids = await getDynamicToolIds();
    expect(ids.length).toBeGreaterThan(50);
  }, 120_000);
});
