/**
 * The policy stays pure: it imports only the shared zone math and its own
 * types, and reads no env and no clock (both come in through the context).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, '../policy.ts'), 'utf8');

describe('messaging policy purity', () => {
  it('imports nothing but utils/time-zone and its own types', () => {
    const info = ts.preProcessFile(source, true, true);
    const specs = info.importedFiles.map((f) => f.fileName);
    expect(specs.length).toBeGreaterThan(0);
    expect([...new Set(specs)].sort()).toEqual(['../../utils/time-zone.js', './types.js']);
  });

  // Any mention of process or globalThis, not just process.env: process['env'], globalThis.process?.env.
  const IMPURE = /\bprocess\b|\bglobalThis\b|Date\.now|new Date\(\s*\)|Math\.random|\brequire\s*\(/;

  it('reads no env, no clock and no randomness', () => {
    expect(source).not.toMatch(IMPURE);
  });

  it.each([
    'process.env.FLAG',
    "process['env']",
    'globalThis.process?.env',
    'Date.now()',
    'new Date( )',
    'Math.random()',
    "require ('fs')",
  ])('the check catches %s', (snippet) => {
    expect(snippet).toMatch(IMPURE);
  });
});
