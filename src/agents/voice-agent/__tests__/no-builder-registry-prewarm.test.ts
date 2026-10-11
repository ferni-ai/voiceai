/**
 * Session start used to import all 179 context-builder registry modules
 * (core/loader → BUILDER_IMPORTS). Nothing on the live turn runs those
 * builders, so the import only cost ~140 ms and ~20 MB per job process.
 * This keeps the agent code from loading the registry again.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const AGENTS = join(__dirname, '..', '..');
const REGISTRY_LOADER = /context-builders\/core\/loader(?:\.js)?['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('context-builder registry prewarm', () => {
  it('scans the agent sources', () => {
    const files = sourceFiles(AGENTS).map((f) => relative(AGENTS, f));
    expect(files).toContain(join('voice-agent', 'session-init-handler.ts'));
  });

  it('no agent module imports the registry loader', () => {
    const importers = sourceFiles(AGENTS)
      .filter((file) => REGISTRY_LOADER.test(readFileSync(file, 'utf8')))
      .map((file) => relative(AGENTS, file));
    expect(importers).toEqual([]);
  });
});
