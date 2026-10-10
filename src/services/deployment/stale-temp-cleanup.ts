import { readdirSync, statSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const STALE_TEMP_PREFIX = 'ferni-';
const STALE_TEMP_AGE_MS = 60 * 60 * 1000;

/**
 * Deletes the agent's own leftover temp files: `ferni-*` regular files older
 * than an hour. Never the whole temp dir: it is shared with other processes
 * (and, on a dev machine, the developer), and live calls use files under it.
 * Directories are skipped because caches such as ferni-cache live in them.
 *
 * @returns the number of files removed
 */
export function removeStaleTempFiles(
  dir: string = tmpdir(),
  now: number = Date.now(),
  maxAgeMs: number = STALE_TEMP_AGE_MS
): number {
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(STALE_TEMP_PREFIX)) continue;
    const path = join(dir, name);
    try {
      const stats = statSync(path);
      if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
        unlinkSync(path);
        removed++;
      }
    } catch {
      // Removed by its owner between readdir and stat/unlink
    }
  }
  return removed;
}
