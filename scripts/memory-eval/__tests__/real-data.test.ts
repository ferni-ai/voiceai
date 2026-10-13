import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertVertexOnly, isInside, writePrivate } from '../real-data.js';

const vertex = { GOOGLE_CLOUD_PROJECT: 'johnb-2025' } as NodeJS.ProcessEnv;

describe('assertVertexOnly', () => {
  it('passes only when no OpenAI fallback can be reached', () => {
    expect(() => assertVertexOnly(vertex)).not.toThrow();
    expect(() => assertVertexOnly({ ...vertex, USE_VERTEX_AI: 'true' })).not.toThrow();
  });

  it('refuses an OpenAI key, consumer Gemini, or no project, and names each', () => {
    expect(() => assertVertexOnly({ ...vertex, OPENAI_API_KEY: 'sk-x' })).toThrow(/OPENAI_API_KEY/);
    expect(() => assertVertexOnly({ ...vertex, USE_VERTEX_AI: 'false' })).toThrow(
      /USE_VERTEX_AI=false/
    );
    expect(() => assertVertexOnly({})).toThrow(/GOOGLE_CLOUD_PROJECT is unset/);
  });
});

describe('isInside', () => {
  const root = resolve('/work/voiceai');

  it('is true for the root and paths under it, false for siblings and parents', () => {
    expect(isInside(root, root)).toBe(true);
    expect(isInside(join(root, 'scripts/x'), root)).toBe(true);
    expect(isInside('/work/voiceai-private', root)).toBe(false);
    expect(isInside('/work', root)).toBe(false);
  });

  it('does not take a directory named "..x" for a parent', () => {
    expect(isInside(join(root, '..x'), root)).toBe(true);
  });
});

describe('writePrivate', () => {
  it('writes a file readable only by its owner, even over an existing looser file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'real-data-'));
    const file = join(dir, 'cases.json');
    writePrivate(file, '[]');
    expect(readFileSync(file, 'utf8')).toBe('[]');
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});
