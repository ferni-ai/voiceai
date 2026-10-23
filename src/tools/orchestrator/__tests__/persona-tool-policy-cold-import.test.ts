/**
 * The manifest read timeout (MANIFEST_READ_TIMEOUT_MS) covers the bundle load
 * only. On a cold start (every CI run) the personas module import alone can take
 * longer than the timeout; when the timer wrapped it, "reads the real manifests"
 * failed after ~2 s with no forbids, 3 runs in 6. Here the import is held until
 * the clock is well past the timeout, then released: the policy must still apply.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => {
  let release = (): void => undefined;
  const imported = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { imported, release: () => release() };
});
vi.mock('../../../personas/index.js', async (importOriginal) => {
  await gate.imported; // a cold, slow import
  return importOriginal<object>();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('a slow personas import (a cold start) does not count against the read timeout', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-cold-'));
  const src = join(process.cwd(), 'src/personas/bundles/joel-dickson/persona.manifest.json');
  const manifest = JSON.parse(readFileSync(src, 'utf-8')) as {
    identity: { id: string };
    tools: { forbidden: string[] };
  };
  manifest.identity.id = 'fixture-cold-import';
  manifest.tools.forbidden = ['tellJoke'];
  mkdirSync(join(dir, 'fixture-cold-import'));
  writeFileSync(
    join(dir, 'fixture-cold-import', 'persona.manifest.json'),
    JSON.stringify(manifest)
  );
  vi.stubEnv('PERSONA_PATHS', dir);
  vi.stubEnv('PERSONA_TOOL_POLICY', 'on');
  const policy = await import('../persona-tool-policy.js');

  vi.useFakeTimers();
  const read = policy.personaToolPolicy('fixture-cold-import');
  await vi.advanceTimersByTimeAsync(policy.MANIFEST_READ_TIMEOUT_MS * 2); // still importing
  vi.useRealTimers();
  gate.release();

  expect((await read)?.forbidden).toEqual(['tellJoke']);
});
