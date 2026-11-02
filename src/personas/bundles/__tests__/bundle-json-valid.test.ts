/**
 * Every JSON file the app reads as content at runtime must parse.
 *
 * Persona bundles and locale files are read with a bare JSON.parse when a
 * session needs them, so a broken file surfaces only in prod. alex-chen's and
 * jordan-taylor's _story-graph.json each lost a closing `]` in March 2026, and
 * for eight months their bundle runtime failed to start with nothing in CI to
 * say so.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const bundlesDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(bundlesDir, '..', '..', '..');
const localesDir = join(repoRoot, 'src', 'i18n', 'locales');

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

describe('runtime content JSON', () => {
  const bundleFiles = jsonFiles(bundlesDir);
  const localeFiles = jsonFiles(localesDir);

  it('finds the bundle content, every story graph, and the locales', () => {
    const storyGraphs = bundleFiles.filter((f) => f.endsWith('_story-graph.json'));
    expect(bundleFiles.length).toBeGreaterThan(100);
    expect(storyGraphs.map((f) => relative(bundlesDir, f).split('/')[0])).toEqual(
      expect.arrayContaining(['alex-chen', 'ferni', 'jordan-taylor', 'maya-santos'])
    );
    expect(localeFiles.map((f) => relative(localesDir, f))).toEqual(
      expect.arrayContaining(['en-US.json', 'es.json'])
    );
  });

  it('parses every *.json under src/personas/bundles', () => {
    expect(unparsable(bundleFiles)).toEqual([]);
  });

  it('parses every *.json under src/i18n/locales', () => {
    expect(unparsable(localeFiles)).toEqual([]);
  });
});
