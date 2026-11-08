/**
 * Reading persona bundle content files, and loading them so that one bad file
 * costs only its own content.
 */
import { readFile } from 'fs/promises';
import { getLogger } from '../../utils/safe-logger.js';

/** How long one content type may take to load before the runtime goes on without it. */
const CONTENT_LOAD_TIMEOUT_MS = 5000;

/**
 * Read and parse a JSON file. A parse error names the file in its message and
 * on `.path` (as fs errors do): JSON.parse alone gives only a position.
 */
export async function loadJsonFile<T>(path: string): Promise<T> {
  const content = await readFile(path, 'utf-8');
  try {
    return JSON.parse(content) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw Object.assign(new SyntaxError(`${message} (in ${path})`, { cause: err }), { path });
  }
}

/**
 * Await one content load, yielding null instead of failing or hanging.
 *
 * A load that rejects (a file that isn't valid JSON, an unreadable file) is
 * logged at error level with the file and yields null. The runtime loads all
 * its content types side by side, so a rejection that escaped here would fail
 * every one of them: for eight months alex-chen and jordan-taylor ran with no
 * bundle runtime because one _story-graph.json was missing a `]`.
 */
export async function loadContentOrNull<T>(
  load: Promise<T | null> | undefined,
  personaId: string,
  operation: string,
  timeoutMs = CONTENT_LOAD_TIMEOUT_MS
): Promise<T | null> {
  if (!load) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      getLogger().warn({ personaId, operation }, 'Content load timed out');
      resolve(null);
    }, timeoutMs);
  });
  const loaded = load.then(
    (result) => result ?? null,
    (err: unknown) => {
      getLogger().error(
        {
          personaId,
          operation,
          file: (err as { path?: unknown } | null)?.path,
          error: err instanceof Error ? err.message : String(err),
        },
        'Content failed to load; continuing without it'
      );
      return null;
    }
  );

  try {
    return await Promise.race([loaded, timedOut]);
  } finally {
    // Settled either way: a load that finished must not log "timed out" later.
    clearTimeout(timer);
  }
}
