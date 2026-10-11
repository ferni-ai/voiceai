/**
 * The Financial Legends personas are fictional characters inspired by public
 * investing ideas: john-bogle is Henry Caldwell, peter-lynch is Tom Brannigan.
 * No file scanned here may name the real people they were once modeled on, or
 * their family, employers, funds, books or signature quotes.
 *
 * Persona ids stay stable, so id tokens are stripped before matching.
 *
 * @module personas/__tests__/no-real-person-legends-bogle-lynch.test
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundle = (id: string): string => fileURLToPath(new URL(`../bundles/${id}`, import.meta.url));

/** What is scanned, and a canon marker that proves the scan read real content. */
const TARGETS: Array<{ id: string; root: string; markerFile: string; marker: string }> = [
  {
    id: 'john-bogle',
    root: bundle('john-bogle'),
    markerFile: 'persona.manifest.json',
    marker: 'Henry Caldwell',
  },
];
/** Files each target holds today; fewer means the scan missed files. */
const MIN_FILES = 20;

// Persona ids are stable keys, not names, and so are the exported speech-trait
// symbols other modules import by name (johnBogleSpeechTraits,
// JOHN_BOGLE_SPEECH_CONFIG...). `handoff-to-jack` is a shared chime asset
// (design-system/assets/sounds) named for a legacy brand color.
const ALLOWED_TOKENS =
  /john-bogle|peter-lynch|joel-dickson|handoff-to-jack|\b(john_?bogle|peter_?lynch)(_?speech_?\w*)\b/gi;

const DENYLIST = new RegExp(
  [
    'Bogle',
    '\\bJack\\b',
    'Vanguard',
    'Wellington',
    'Princeton',
    'Valley Forge',
    'haystack',
    'humble arithmetic',
    'Lynch',
    'Magellan',
    'Fidelity',
    'Carolyn',
    'Marblehead',
    'Boston College',
    'Wharton',
    'Dunkin',
    "L'eggs",
    'Hanes',
    'La Quinta',
    'Taco Bell',
    'One Up on Wall Street',
    'Beating the Street',
    'Learn to Earn',
    '\\$14 ?B',
    'Dickson',
    '\\bJoel\\b',
    // Also removed from these bundles: other real-life details and quotes.
    'Montclair',
    'heart transplant',
    'Bogle.s Folly',
    'first index fund',
    'patron saint',
    'Little Book of Common Sense',
    'impulse is your enemy',
    "you get what you don't pay for",
    'enemy of a good plan',
    'giant distraction',
    'Chrysler',
    'Iacocca',
    'Home Depot',
    'Rothchild',
    'any idiot',
    'voting machine',
    'Behind every stock is a company',
    'Know what you own',
    '\\b1977\\b',
    '\\b29(\\.2)?%',
    'Mark Pro',
    'meet-bogle',
  ].join('|'),
  'i'
);

function listFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => listFiles(join(path, name)));
}

const files = TARGETS.flatMap((t) => listFiles(t.root));
const contents = new Map(files.map((f) => [f, readFileSync(f, 'utf-8')]));

describe('fictional legends: no real-person identifiers', () => {
  it('scans every file of every target', () => {
    const bundles = TARGETS.filter((t) => t.markerFile);
    expect(files.length).toBeGreaterThanOrEqual(bundles.length * MIN_FILES);
  });

  it('reads real persona content (fictional canon markers are present)', () => {
    for (const t of TARGETS) {
      const text = contents.get(t.markerFile ? join(t.root, t.markerFile) : t.root);
      expect(text, t.id).toContain(t.marker);
    }
  });

  it('keeps persona ids stable', () => {
    for (const t of TARGETS.filter((target) => target.markerFile)) {
      const manifest = JSON.parse(readFileSync(join(t.root, t.markerFile), 'utf-8')) as {
        identity: { id: string };
      };
      expect(manifest.identity.id).toBe(t.id);
    }
  });

  it('the denylist catches a real identifier (guards against a vacuous regex)', () => {
    expect(DENYLIST.test('I ran Magellan at Fidelity'.replace(ALLOWED_TOKENS, ''))).toBe(true);
    expect(DENYLIST.test('handoff to john-bogle'.replace(ALLOWED_TOKENS, ''))).toBe(false);
    expect(DENYLIST.test('export johnBogleSpeechTraits'.replace(ALLOWED_TOKENS, ''))).toBe(false);
    expect(DENYLIST.test('I am John Bogle'.replace(ALLOWED_TOKENS, ''))).toBe(true);
  });

  it('no file names a real person, family member, employer, book or quote', () => {
    const hits: string[] = [];
    for (const [file, text] of contents) {
      text.split('\n').forEach((line, i) => {
        const match = line.replace(ALLOWED_TOKENS, '').match(DENYLIST);
        if (match) hits.push(`${file}:${i + 1}: ${match[0]}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
