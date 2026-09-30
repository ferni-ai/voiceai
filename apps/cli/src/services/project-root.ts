/**
 * Repo root for CLI modules.
 *
 * Modules used to count `..` from their own directory, which broke every time a
 * file moved (features/* resolved to apps/cli/src). This resolves the same way
 * from anywhere:
 *   1. FERNI_PROJECT_ROOT, if set
 *   2. the working directory, in the bundled SEA binary (no source tree)
 *   3. the nearest ancestor of the calling module holding pnpm-workspace.yaml
 *   4. the working directory, as a last resort
 */

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

/** Pass the caller's `import.meta.url`. */
export function resolveProjectRoot(moduleUrl: string): string {
  if (process.env.FERNI_PROJECT_ROOT) return process.env.FERNI_PROJECT_ROOT;
  if (moduleUrl.includes('ferni-sea-binary')) return process.cwd();

  let dir = dirname(fileURLToPath(moduleUrl));
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}
