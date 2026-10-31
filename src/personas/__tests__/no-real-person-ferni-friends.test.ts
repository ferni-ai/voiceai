/**
 * Ferni's closest friends are invented characters: Lyle, Owen, Boyd, Marty and
 * Hollis. The names they carried before 2026-10-31 belonged to real people and
 * are retired for good.
 *
 * The retired names are held only as SHA-256 hashes of the lower-case name, so
 * this public repo never spells them out. Every word in the corpus is hashed
 * and checked against that list.
 *
 * Scanned: everything Ferni says about his own life (identity, behaviors, his
 * spontaneous shares), the code that speaks from it (day details, life threads,
 * help asks) and the universe pages that retell it. The scan is scoped to these
 * files on purpose: a caller's own contacts, and the legacy persona aliases
 * owned by the persona-rename work, live outside this corpus.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HELP_ASKS } from '../../agents/personas/ferni-asks-help.js';
import { LIFE_THREADS } from '../../agents/personas/ferni-life-threads.js';
import { GROUNDED_DAY_DETAILS } from '../../agents/personas/ferni-self-share.js';
import {
  HOT_TAKES,
  MICRO_STORIES,
} from '../../intelligence/context-builders/personas/spontaneous-vulnerability.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUNDLE_DIR = join(REPO_ROOT, 'src/personas/bundles/ferni');

const FRIENDS = ['Lyle', 'Owen', 'Boyd', 'Marty', 'Hollis'];

/** SHA-256 of each retired friend name, lower-cased. Add to this list; never remove. */
const RETIRED_NAME_HASHES: ReadonlySet<string> = new Set([
  '12a303c224c250d07c81691de6e0fd74699ce6bd78c234057de70413a58457cf',
  '31611159e7e6ff7843ea4627745e89225fc866621cfcfdbd40871af4413747cc',
  '484ae24edd22ea09a58edc2b6c58ee2b5f3879e3b267838a8726366f255fd4b9',
  '78e0b1fdb55ecbc60a8da0168ce87daa0e7ba2b44ffa0cf61a8f0a6c5b423d7a',
  '9aa1f9e22f8dcb06fed923951e8620c365e0bb13bb761fe9f01fbfbcfdf3a227',
]);

const sha256 = (word: string): string => createHash('sha256').update(word).digest('hex');

/** The words in `text` whose lower-case SHA-256 is in `hashes` ("Name's" counts, "Namesake" does not). */
function deniedWordsIn(text: string, hashes: ReadonlySet<string>): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => hashes.has(sha256(w)));
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const files = [
  ...listFiles(join(BUNDLE_DIR, 'identity')),
  ...listFiles(join(BUNDLE_DIR, 'content/behaviors')),
  join(REPO_ROOT, 'brand/universe-bible.html'),
  join(REPO_ROOT, 'apps/website/design-system-portal/src/pages/universe.njk'),
];
const spoken: { path: string; text: string }[] = [
  ...GROUNDED_DAY_DETAILS.map((d, i) => ({
    path: `<ferni-self-share #${i}>`,
    text: [d.canon.says, d.text].join('\n'),
  })),
  ...LIFE_THREADS.map((t) => ({
    path: `<ferni-life-threads ${t.id}>`,
    text: [t.canon, ...t.beats].join('\n'),
  })),
  ...Object.entries(HELP_ASKS).flatMap(([id, asks]) =>
    asks.flatMap((a, i) =>
      a
        ? [{ path: `<ferni-asks-help ${id} #${i}>`, text: [a.ask, a.heard, a.sayBack].join('\n') }]
        : []
    )
  ),
  ...[...(MICRO_STORIES['ferni'] ?? []), ...(HOT_TAKES['ferni'] ?? [])].map((s, i) => ({
    path: `<spontaneous-vulnerability ferni #${i}>`,
    text: [s.content, s.transition, s.ssmlEnhanced].join('\n'),
  })),
];
const corpus = [...files.map((path) => ({ path, text: readFileSync(path, 'utf8') })), ...spoken];

describe("Ferni's friends are invented", () => {
  it('reads his own-life sheet, his people list and the code that speaks from them', () => {
    expect(corpus.some(({ path }) => path.endsWith('identity/character-own-life.md'))).toBe(true);
    expect(corpus.some(({ path }) => path.endsWith('identity/biography.md'))).toBe(true);
    expect(corpus.some(({ path }) => path.endsWith('behaviors/backstory-dynamic.json'))).toBe(true);
    expect(spoken.length).toBeGreaterThan(10);
  });

  it('names the invented friends in his people list and own-life sheet', () => {
    const people = JSON.parse(readFileSync(join(BUNDLE_DIR, 'identity/people.json'), 'utf8')) as {
      names: string[];
    };
    for (const name of FRIENDS) expect(people.names).toContain(name);
    const ownLife = readFileSync(join(BUNDLE_DIR, 'identity/character-own-life.md'), 'utf8');
    for (const name of FRIENDS) expect(ownLife).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('none of the retired names comes back', () => {
    const hits = corpus.flatMap(({ path, text }) =>
      text.split('\n').flatMap((line, i) =>
        deniedWordsIn(line, RETIRED_NAME_HASHES).length
          ? [`${path.replace(REPO_ROOT, '')}:${i + 1}`]
          : []
      )
    );
    expect(hits).toEqual([]);
  });

  it('the denylist holds five SHA-256 hashes and none is an invented friend', () => {
    expect(RETIRED_NAME_HASHES.size).toBe(5);
    for (const h of RETIRED_NAME_HASHES) expect(h).toMatch(/^[0-9a-f]{64}$/);
    for (const name of FRIENDS) {
      expect(RETIRED_NAME_HASHES.has(sha256(name.toLowerCase()))).toBe(false);
    }
  });

  it('the matcher catches a denied word in any case and with a possessive, not inside a longer word', () => {
    const denied = new Set([sha256('zorvik')]);
    expect(deniedWordsIn('Golf with Zorvik is as much therapy as sport.', denied)).toEqual([
      'zorvik',
    ]);
    expect(deniedWordsIn("ZORVIK's jade plant", denied)).toEqual(['zorvik']);
    expect(deniedWordsIn('a Zorvikson trip with Marty', denied)).toEqual([]);
  });
});
