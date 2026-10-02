/**
 * The conversation, memory and intelligence layers must reach Gemini through
 * the shared client (getGeminiClient / getGenerativeModel), which uses Vertex on
 * the agent. @google/generative-ai only speaks to the Gemini API with
 * GOOGLE_API_KEY: when that key was invalid on the agent, deep extraction, the
 * knowledge-graph extractors, link detection and retrieval reranking all failed
 * while calls themselves kept working.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const GUARDED = ['agents', 'memory', 'intelligence'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('Gemini access in the live agent layers', () => {
  it('does not use the API-key-only @google/generative-ai SDK', () => {
    const offenders = GUARDED.flatMap((dir) => sourceFiles(join(SRC, dir)))
      .filter((file) => readFileSync(file, 'utf8').includes("'@google/generative-ai'"))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
