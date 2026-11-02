/**
 * A persona bundle that lacks extended content says so, once.
 *
 * Without its extended content (inner world, quirks, story graph, nuance…) a
 * persona still runs; the features that read those files just stay off. That
 * was silent, so a bundle shipped with none of it looked like a complete one.
 * Now the runtime warns once per persona per process, naming the missing
 * files, through the REAL logger (the global setup mocks safe-logger; this
 * unmocks it and reads back the JSON lines it writes to stderr).
 */
import { cp, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../../../utils/safe-logger.js');

const { loadBundle } = await import('../loader.js');
const { BundleRuntimeEngine } = await import('../runtime.js');
const { EXTENDED_CONTENT_FILES, resetMissingContentWarningsForTesting } =
  await import('../extended-content.js');

const MESSAGE = 'Persona bundle is missing extended content; the features that read it stay off';
const sourceBundle = join(dirname(fileURLToPath(import.meta.url)), '..', 'maya-santos');
const REMOVED = [
  'content/behaviors/persona-modes.json',
  'content/identity/inner-world.json',
  'content/behaviors/quirks.json',
];

interface LogLine {
  level?: number;
  msg?: string;
  personaId?: string;
  missing?: string[];
}

let written: string[];
let dir: string;

/** The missing-content warnings the real logger wrote. */
function missingContentWarnings(): LogLine[] {
  return written
    .join('')
    .split('\n')
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogLine];
      } catch {
        return [];
      }
    })
    .filter((line) => line.msg === MESSAGE);
}

async function removeFiles(): Promise<void> {
  await Promise.all(REMOVED.map(async (file) => unlink(join(dir, file))));
}

async function startRuntime() {
  const engine = new BundleRuntimeEngine(await loadBundle(dir));
  await engine.initialize();
  return engine;
}

beforeAll(async () => {
  // initialize() imports this; load it before stderr is captured.
  await import('../../../conversation/index.js');
});

beforeEach(async () => {
  resetMissingContentWarningsForTesting();
  dir = await mkdtemp(join(tmpdir(), 'bundle-missing-content-'));
  await cp(sourceBundle, dir, { recursive: true });
  written = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('missing extended content', () => {
  it('warns once, at warn level, naming exactly the missing files', async () => {
    await removeFiles();
    await startRuntime();

    const warnings = missingContentWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ level: 40, personaId: 'maya-santos' });
    expect([...(warnings[0].missing ?? [])].sort()).toEqual([...REMOVED].sort());
  });

  it('does not warn again for the same persona in the same process', async () => {
    await removeFiles();
    const engine = await startRuntime();
    await engine.loadInnerWorld();
    await engine.loadInnerWorld();
    await startRuntime();

    expect(missingContentWarnings()).toHaveLength(1);
  });

  it('stays quiet for a complete bundle', async () => {
    await startRuntime();
    expect(EXTENDED_CONTENT_FILES.length).toBe(12);
    expect(missingContentWarnings()).toEqual([]);
  });

  it('leaves an unparsable file to the existing debug path, not the missing list', async () => {
    await writeFile(join(dir, 'content/behaviors/quirks.json'), '{ "caught_doing": [');
    const engine = await startRuntime();

    expect(missingContentWarnings()).toEqual([]);
    expect(engine.getCaughtDoing()).toBeNull();
  });
});
