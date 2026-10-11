/**
 * Peter John is a fictional character.
 *
 * His bundle used to mirror a real fund manager's life (hometown, schools, fund,
 * wife and daughters, signature stock stories). Seth's 2026-10-11 decision: no
 * persona copies a real person's life. This test scans Peter's files and
 * fails if a real identifier comes back.
 *
 * The bundle is cleaned in a few small PRs. SCANNED lists the parts already
 * clean on main; widen it as each part lands, until it is the whole bundle.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BUNDLE_DIR = fileURLToPath(new URL('../bundles/peter-john', import.meta.url));
const AGENT_FILE = fileURLToPath(new URL('../../agents/personas/peter-agent.ts', import.meta.url));

// Real people, places, organizations, books and dates from the old biography,
// plus the real index-fund founder who used to appear as a character.
const DENYLIST = new RegExp(
  [
    'Lynch',
    'Carolyn',
    String.raw`Hoff\b`,
    String.raw`\bMary\b`,
    String.raw`\bAnnie\b`,
    String.raw`\bBeth\b`,
    'Brae Burn',
    'Newton',
    'Boston College',
    'Wharton',
    'Fidelity',
    'Magellan',
    'Dunkin',
    "L'eggs",
    'Hanes',
    'La Quinta',
    'Taco Bell',
    'One Up on Wall Street',
    'Beating the Street',
    'Learn to Earn',
    'Bogle',
    'Vanguard',
    'caddy',
    'caddie',
    String.raw`\b1968\b`,
    'Marblehead',
    'Chrysler',
    String.raw`\bMIT\b`,
    'Polaroid',
    'golf',
    'three daughters',
    'oldest of four',
    String.raw`\bJack\b`,
    String.raw`retired at 46`,
    String.raw`\b56 years\b`,
    'fifty-six years',
    'crayon',
    'six times out of ten',
  ].join('|'),
  'i'
);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const SCANNED = ['content/stories', 'content/knowledge'];
const SCANNED_FILES = ['speech-traits.ts', 'voice-pace-personality.ts', 'persona.manifest.json'];

const files = [
  ...SCANNED.flatMap((dir) => listFiles(join(BUNDLE_DIR, dir))),
  ...SCANNED_FILES.map((name) => join(BUNDLE_DIR, name)),
  AGENT_FILE,
];
const corpus = files.map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe("Peter John's persona is fictional", () => {
  it('reads the scanned files, not an empty or moved directory', () => {
    expect(corpus.length).toBeGreaterThan(25);
    expect(corpus.some(({ path }) => path.endsWith('content/stories/diane-story.json'))).toBe(true);
    expect(corpus.some(({ path }) => path.endsWith('content/stories/register-days.json'))).toBe(
      true
    );
  });

  it('carries the fictional canon: Diane, Pawtucket, the hardware store', () => {
    const all = corpus.map(({ text }) => text).join('\n');
    expect(all).toMatch(/Diane/);
    expect(all).toMatch(/Pawtucket/);
    expect(all).toMatch(/hardware store/i);
  });

  it('names no real person, place, fund or book from the old biography', () => {
    const hits = corpus.flatMap(({ path, text }) =>
      text
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => DENYLIST.test(line))
        .map(
          ({ line, i }) =>
            `${path.slice(BUNDLE_DIR.length - 'peter-john'.length)}:${i + 1}: ${line.trim().slice(0, 120)}`
        )
    );
    expect(hits).toEqual([]);
  });

  it('the denylist really catches the old content', () => {
    expect(DENYLIST.test('I married Carolyn in 1968')).toBe(true);
    expect(DENYLIST.test('my years running Magellan at Fidelity')).toBe(true);
    expect(DENYLIST.test('Diane and I met at URI')).toBe(false);
  });
});
