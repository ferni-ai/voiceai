/**
 * findProjectRoot must work wherever the CLI runs: from source via tsx (CI),
 * where files sit five levels under the root, and from the single-file bundle
 * (dist/ferni-bundle/ferni.js). Counting '..' can only be right for one layout.
 */
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findProjectRoot } from '../services/project-root.js';

describe('findProjectRoot', () => {
  it('finds the workspace root from a deeply nested source file', () => {
    const here = dirname(fileURLToPath(import.meta.url)); // apps/cli/src/__tests__
    expect(findProjectRoot(join(here, '..', 'features', 'ops'))).toBe(join(here, '..', '..', '..', '..'));
  });

  it('finds the root from a bundle directory two levels below it', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ferni-root-')));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const bundleDir = join(root, 'dist', 'ferni-bundle');
    mkdirSync(bundleDir, { recursive: true });
    expect(findProjectRoot(bundleDir)).toBe(root);
  });

  it('falls back to the working directory when no workspace is above it', () => {
    const lone = realpathSync(mkdtempSync(join(tmpdir(), 'ferni-none-')));
    expect(findProjectRoot(lone)).toBe(process.cwd());
  });
});
