/**
 * Locate the repo root for CLI commands.
 *
 * CLI code runs in two layouts: from source via tsx (apps/cli/src/<area>/<x>/,
 * five levels below the root) and from the single-file bundle
 * (dist/ferni-bundle/ferni.js, two levels below). A fixed number of `..` is
 * right for only one of them, so walk up to the directory that holds
 * pnpm-workspace.yaml instead, and fall back to the working directory.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}
