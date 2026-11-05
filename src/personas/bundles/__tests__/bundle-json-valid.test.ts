/**
 * Every JSON file the app reads as content at runtime must parse.
 *
 * Persona bundles and locale files are read with a bare JSON.parse when a
 * session needs them, so a broken file surfaces only in prod, and most loaders
 * then skip it quietly. alex-chen's and jordan-taylor's _story-graph.json each
 * lost a closing `]` in March 2026, and for eight months their bundle runtime
 * failed to start with nothing in CI to say so. Other loaders fall back
 * silently too: the prompt assembler returns null for a bad _assembly.json,
 * greeting atoms and inner-world fall back to defaults, and src/i18n serves
 * en-US in place of a locale that won't parse.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const bundlesDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(bundlesDir, '..', '..', '..');
const localesDir = join(repoRoot, 'src', 'i18n', 'locales');

/** Every *.json under dir, at any depth, dot- and underscore-prefixed names included. */
function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(dir, name))
    .sort();
}

function unparsable(files: string[]): string[] {
  const broken: string[] = [];
  for (const file of files) {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      broken.push(`${relative(repoRoot, file)}: ${(err as Error).message}`);
    }
  }
  return broken;
}

describe('runtime JSON content parses', () => {
  const bundleFiles = jsonFiles(bundlesDir);
  const localeFiles = jsonFiles(localesDir);
  const bundlePaths = bundleFiles.map((f) => relative(bundlesDir, f));

  it('collects dot- and underscore-prefixed files at every depth', () => {
    const dir = mkdtempSync(join(tmpdir(), 'json-glob-'));
    try {
      mkdirSync(join(dir, 'a', '.b', 'c'), { recursive: true });
      for (const name of [
        'top.json',
        '.hidden.json',
        'a/_under.json',
        'a/.b/c/deep.json',
        'a/notes.txt',
      ]) {
        writeFileSync(join(dir, name), '{}');
      }
      expect(jsonFiles(dir).map((f) => relative(dir, f))).toEqual([
        '.hidden.json',
        'a/.b/c/deep.json',
        'a/_under.json',
        'top.json',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('covers the files whose loaders skip a parse error without failing', () => {
    expect(bundleFiles.length).toBeGreaterThan(700);
    expect(bundlePaths.filter((p) => p.endsWith('/_assembly.json')).length).toBeGreaterThanOrEqual(
      7
    );
    expect(bundlePaths).toEqual(
      expect.arrayContaining([
        'alex-chen/content/stories/_story-graph.json',
        'jordan-taylor/content/stories/_story-graph.json',
        'alex-chen/content/prompts/_assembly.json',
        'nayan-patel/content/behaviors/greeting-atoms.json',
        'joel-dickson/content/identity/inner-world.json',
      ])
    );
    expect(localeFiles.map((f) => relative(localesDir, f))).toEqual(
      expect.arrayContaining(['en-US.json', 'zh-Hans.json', 'zh-Hant.json'])
    );
  });

  it('parses every *.json under src/personas/bundles', () => {
    expect(unparsable(bundleFiles)).toEqual([]);
  });

  it('parses every *.json under src/i18n/locales', () => {
    expect(unparsable(localeFiles)).toEqual([]);
  });
});
