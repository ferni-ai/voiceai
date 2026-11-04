/**
 * Extended persona content: the optional files that give a persona its inner
 * world, quirks, stories and nuance. A bundle without them still runs; the
 * features that read them just stay off. That used to be silent, so a persona
 * shipped without its content looked the same in the logs as a complete one.
 */
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../../utils/safe-logger.js';

/**
 * Relative to the bundle root: the nine files BundleRuntimeEngine.initialize()
 * loads through the bundle's getters, then the three loadInnerWorld() reads.
 */
export const EXTENDED_CONTENT_FILES = [
  'content/voice/expressions.json',
  'content/behaviors/situational-responses.json',
  'content/behaviors/relationship-stages.json',
  'content/behaviors/memory-patterns.json',
  'content/behaviors/persona-modes.json',
  'content/stories/_story-graph.json',
  'content/voice/micro-expressions.json',
  'content/behaviors/contextual-nuances.json',
  'content/behaviors/conflict-handling.json',
  'content/identity/inner-world.json',
  'content/identity/sensory-world.json',
  'content/behaviors/quirks.json',
] as const;

const warnedPersonas = new Set<string>();

/**
 * Warns once per persona per process when its bundle lacks extended content
 * files, naming the missing ones. Later calls for the same persona do nothing,
 * so this is safe on paths that run every turn.
 */
export async function warnMissingExtendedContentOnce(
  personaId: string,
  bundlePath: string
): Promise<void> {
  if (warnedPersonas.has(personaId)) return;
  warnedPersonas.add(personaId);

  const absent = await Promise.all(
    EXTENDED_CONTENT_FILES.map(async (file) => {
      try {
        await access(join(bundlePath, file));
        return false;
      } catch (err) {
        return (err as NodeJS.ErrnoException).code === 'ENOENT';
      }
    })
  );
  const missing = EXTENDED_CONTENT_FILES.filter((_, i) => absent[i]);
  if (missing.length > 0) {
    getLogger().warn(
      { personaId, missing },
      'Persona bundle is missing extended content; the features that read it stay off'
    );
  }
}

/** Test-only: forget which personas have already been warned about. */
export function resetMissingContentWarningsForTesting(): void {
  warnedPersonas.clear();
}

/**
 * Reads an optional JSON file. Returns undefined when it can't be used: a
 * missing file silently (warnMissingExtendedContentOnce reports those), any
 * other read or parse failure with a debug log naming the file.
 */
export async function readOptionalJson<T>(path: string, label: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      getLogger().debug({ path, error: String(err) }, `Failed to load ${label}`);
    }
    return undefined;
  }
}
