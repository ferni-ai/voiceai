/**
 * Ferni is he/him (Seth, 2026-10-11). Strings in code reach callers and the
 * model too: teammates' praise in team-dynamics.ts ("You can talk to Ferni
 * about anything. She gets it."), the gossip line, and tool descriptions
 * ("Have Ferni personally call a friend to introduce herself"). This checks
 * every string literal in src/**\/*.ts, line by line, the way the bundle check
 * does. Tests are left out: their titles reach no one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const FEMININE = /\b(?:she|her|hers|herself)\b/i;

/** A line that names Ferni and uses a feminine pronoun almost always means Ferni. */
const callsFerniShe = (line: string): boolean => /\bFerni\b/.test(line) && FEMININE.test(line);

/** Lines that name Ferni and a woman who isn't Ferni. */
const NOT_FERNI = new Set(['Enroll my wife so she can use Ferni too']);

const isTest = (path: string): boolean =>
  /(?:^|\/)(?:__tests__|tests)\//.test(path) || /\.(?:test|spec)\.ts$/.test(path);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(path);
    return e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Every line of every string literal and template piece in a file. */
function literalLines(path: string): { line: string; at: number }[] {
  const text = readFileSync(path, 'utf8');
  if (!text.includes('Ferni')) return [];
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  const out: { line: string; at: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      const at = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      node.text.split('\n').forEach((line, i) => out.push({ line, at: at + i }));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('Ferni pronouns in code strings', () => {
  it('flags a string that calls Ferni "she", and passes one that says "he"', () => {
    expect(callsFerniShe('You can talk to Ferni about anything. She gets it.')).toBe(true);
    expect(callsFerniShe('Have Ferni personally call a friend to introduce herself.')).toBe(true);
    expect(callsFerniShe('You can talk to Ferni about anything. He gets it.')).toBe(false);
  });

  it('never refers to Ferni as she/her in a string literal', () => {
    const files = sourceFiles(SRC).filter((f) => !isTest(relative(SRC, f)));
    expect(files.length).toBeGreaterThan(3000);
    const offenders = files.flatMap((file) =>
      literalLines(file)
        .filter(({ line }) => callsFerniShe(line) && !NOT_FERNI.has(line.trim()))
        .map(({ line, at }) => `${relative(SRC, file)}:${at}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
