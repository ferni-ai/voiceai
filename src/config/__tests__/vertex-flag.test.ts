import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useVertexAI } from '../vertex-flag.js';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') sourceFiles(path, out);
    } else if (/\.ts$/.test(entry) && !/\.(test|spec|d)\.ts$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe('useVertexAI', () => {
  it('is on unless USE_VERTEX_AI is "false", as prod and dev run', () => {
    expect(useVertexAI({})).toBe(true);
    expect(useVertexAI({ USE_VERTEX_AI: 'true' })).toBe(true);
    expect(useVertexAI({ USE_VERTEX_AI: 'false' })).toBe(false);
  });

  it('is the only place src/ reads the Vertex switch', () => {
    const readers = sourceFiles(SRC)
      .filter((file) => !file.endsWith(join('config', 'vertex-flag.ts')))
      .filter((file) =>
        /env(?:\.|\[['"])USE_VERTEX_AI\b/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(SRC, file));
    expect(readers).toEqual([]);
  });
});
