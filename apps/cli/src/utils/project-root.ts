/**
 * The repository root, found by walking up to pnpm-workspace.yaml.
 *
 * Commands used to count parent directories by hand ("dirname(dirname(__dirname))",
 * "join(__dirname, '..', '..', ...)"). When the CLI moved under apps/cli, 19
 * of 47 counts went wrong: features/* resolved to apps/cli/src, so the bundle
 * check never found a bundle and the frontend persona generator looked for
 * apps/cli/src/commands/src/personas (2026-10-01). Walking up can't miscount.
 * FERNI_PROJECT_ROOT overrides; with no workspace above (a packaged binary),
 * the current directory.
 *
 * @module cli/utils/project-root
 */
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function findProjectRoot(from: string = dirname(fileURLToPath(import.meta.url))): string {
  if (process.env.FERNI_PROJECT_ROOT) return process.env.FERNI_PROJECT_ROOT;
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dirname(dir) === dir) return process.cwd();
  }
}
