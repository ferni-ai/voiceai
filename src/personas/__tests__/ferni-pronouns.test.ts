/**
 * Ferni is he/him (Seth, 2026-10-11). Teammates' handoff and team-awareness
 * lines said "Let me bring Ferni in—she..." and "That's Ferni - she cares...",
 * so a caller could hear Ferni called "she" by Maya and "he" by Ferni himself.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BUNDLES = join(process.cwd(), 'src/personas/bundles');
const FEMININE = /\b(?:she|her|hers|herself)\b/i;

/** A line that names Ferni and uses a feminine pronoun almost always means Ferni. */
const callsFerniShe = (line: string): boolean => /\bFerni\b/.test(line) && FEMININE.test(line);

function contentFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : contentFiles(path);
    return /\.(json|md)$/.test(e.name) ? [path] : [];
  });
}

describe('Ferni pronouns in persona bundles', () => {
  it('flags a line that calls Ferni "she", and passes one that says "he"', () => {
    expect(callsFerniShe('"Let me bring Ferni in—she knows where everyone can help."')).toBe(true);
    expect(callsFerniShe('"Ferni coordinates the team. She\'s good at the big picture."')).toBe(
      true
    );
    expect(callsFerniShe('"Let me bring Ferni in—he knows where everyone can help."')).toBe(false);
  });

  it('never refers to Ferni as she/her', () => {
    const files = contentFiles(BUNDLES);
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, at: `${file.slice(BUNDLES.length + 1)}:${i + 1}` }))
        .filter(({ line }) => callsFerniShe(line))
        .map(({ line, at }) => `${at}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
