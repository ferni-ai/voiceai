#!/usr/bin/env node
/**
 * Generate the design-system outputs this app consumes, which are no longer
 * committed: design-system/dist (imported via @design-system/*) and
 * public/design-system (tokens.css, component CSS, assets, sounds).
 *
 * Runs before dev/build/typecheck/lint/test so a fresh checkout (CI, Docker)
 * works with npm and pnpm alike. Both generators are deterministic and fast.
 */

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const designSystem = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../design-system');

for (const script of ['build.js', 'build-assets.js']) {
  try {
    execFileSync(process.execPath, [path.join(designSystem, script)], { stdio: 'pipe' });
  } catch (error) {
    process.stderr.write(`design-system/${script} failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`);
    process.exit(1);
  }
}
