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

import { CRISIS_ADJUDICATOR_PROMPT } from '../../services/safety/crisis-adjudicator.js';

const SRC = join(process.cwd(), 'src');
const FEMININE = /\b(?:she|her|hers|herself)\b/i;

/** A line that names Ferni and uses a feminine pronoun almost always means Ferni. */
const callsFerniShe = (line: string): boolean => /\bFerni\b/.test(line) && FEMININE.test(line);

/**
 * Lines that name Ferni and a woman who isn't Ferni. The crisis adjudicator's
 * risk list quotes a caller ("tell her I'm sorry") about someone else.
 */
const ADJUDICATOR_RISK_LINE = CRISIS_ADJUDICATOR_PROMPT.split('\n').find((l) =>
  l.includes('"tell her I\'m sorry"')
);
const NOT_FERNI = new Set(
  ['Enroll my wife so she can use Ferni too', ADJUDICATOR_RISK_LINE?.trim()].filter(Boolean)
);

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

  it('exempts only the adjudicator line that quotes a caller about someone else', () => {
    expect(ADJUDICATOR_RISK_LINE).toContain('"tell her I\'m sorry"');
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
  }, 120_000);
});

/**
 * The web app's comments and copy said "her" too (avatar-sidekicks.ui.ts,
 * the pending-action card, the responsive CSS header). Those comments are
 * what the next person copies into a prompt or a string, so the web source is
 * checked as well: "Ferni" followed by a feminine pronoun in the same
 * sentence, across line breaks and comment leaders.
 */
const WEB_SRC = join(process.cwd(), 'apps', 'web', 'src');
const FERNI_THEN_SHE = /\bFerni\b[^.!?]{0,160}?\b(?:she|her|hers|herself)\b/gi;

/** Matches that name Ferni and then a woman who isn't Ferni. */
const WEB_NOT_FERNI = new Set(['Ferni calls mom to say good morning → comes back with "She']);

/** Comment leaders stripped and whitespace collapsed, so a sentence can span lines. */
const flatten = (text: string): string =>
  text.replace(/^[ \t]*(?:\/\*\*?|\*\/?|\/\/)/gm, ' ').replace(/\s+/g, ' ');

function webFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : webFiles(path);
    return /\.(?:ts|css)$/.test(e.name) && !e.name.endsWith('.d.ts') && !isTest(path) ? [path] : [];
  });
}

describe('Ferni pronouns in apps/web/src', () => {
  it('flags "Ferni ... she/her" in one sentence, and passes "he" or a new sentence', () => {
    const hits = (s: string): string[] => flatten(s).match(FERNI_THEN_SHE) ?? [];
    expect(hits(' * Ferni shows what action she wants to take')).toHaveLength(1);
    expect(
      hits(' * Give Ferni awareness by connecting to\n * health data that helps her')
    ).toHaveLength(1);
    expect(hits(' * Ferni shows what action he wants to take')).toEqual([]);
    expect(hits('Ferni introduces Maya. She is great with habits.')).toEqual([]);
  });

  it('never calls Ferni she/her in web source or comments', () => {
    const files = webFiles(WEB_SRC);
    expect(files.length).toBeGreaterThan(200);
    const offenders = files.flatMap((file) =>
      (flatten(readFileSync(file, 'utf8')).match(FERNI_THEN_SHE) ?? [])
        .filter((hit) => !WEB_NOT_FERNI.has(hit))
        .map((hit) => `${relative(WEB_SRC, file)}: ${hit}`)
    );
    expect(offenders).toEqual([]);
  });

  it('avatar-sidekicks.ui.ts describes Ferni as he/him', () => {
    const text = readFileSync(join(WEB_SRC, 'ui', 'avatar-sidekicks.ui.ts'), 'utf8');
    expect(text).toMatch(/beside him/);
    expect(text.match(/\b(?:she|her|hers|herself)\b/gi) ?? []).toEqual([]);
  });
});
