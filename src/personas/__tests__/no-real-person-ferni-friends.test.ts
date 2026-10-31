/**
 * Ferni's closest friends are invented characters: Lyle, Owen, Boyd, Marty and
 * Hollis. The names they carried before 2026-10-31 belonged to real people and
 * are retired for good.
 *
 * The retired names are held only as SHA-256 hashes of the lower-case name, so
 * this public repo never spells them out. Every word in the corpus is hashed
 * and checked against that list; a failure reports only file:line.
 *
 * Scanned: the whole Ferni persona bundle, the persona and voice evals, the
 * universe pages that retell his life, and the spoken-share modules. Left out,
 * by exact path only: the legacy persona alias (owned by the persona-rename
 * work) and the evals' local, git-ignored run output. A caller's own contacts
 * live outside this corpus and are not affected.
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { HELP_ASKS } from '../../agents/personas/ferni-asks-help.js';
import { LIFE_THREADS } from '../../agents/personas/ferni-life-threads.js';
import { GROUNDED_DAY_DETAILS } from '../../agents/personas/ferni-self-share.js';
import {
  HOT_TAKES,
  MICRO_STORIES,
} from '../../intelligence/context-builders/personas/spontaneous-vulnerability.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUNDLE = 'src/personas/bundles/ferni';

const FRIENDS = ['Lyle', 'Owen', 'Boyd', 'Marty', 'Hollis'];

/** SHA-256 of each retired friend name, lower-cased. Add to this list; never remove. */
const RETIRED_NAME_HASHES: ReadonlySet<string> = new Set([
  '12a303c224c250d07c81691de6e0fd74699ce6bd78c234057de70413a58457cf',
  '31611159e7e6ff7843ea4627745e89225fc866621cfcfdbd40871af4413747cc',
  '484ae24edd22ea09a58edc2b6c58ee2b5f3879e3b267838a8726366f255fd4b9',
  '78e0b1fdb55ecbc60a8da0168ce87daa0e7ba2b44ffa0cf61a8f0a6c5b423d7a',
  '9aa1f9e22f8dcb06fed923951e8620c365e0bb13bb761fe9f01fbfbcfdf3a227',
]);

/** Scanned whole, relative to the repo root. */
const SCANNED_DIRS = [BUNDLE, 'scripts/persona-eval', 'scripts/voice-eval'];
const SCANNED_FILES = [
  'brand/universe-bible.html',
  'apps/website/design-system-portal/src/pages/universe.njk',
];
/** Exact paths left out of the scan. Never a pattern. */
const EXCLUDED: ReadonlySet<string> = new Set([
  `${BUNDLE}/content/knowledge/team-orchestration.md`, // legacy persona alias
  `${BUNDLE}/persona.manifest.json`, // legacy persona alias
  'scripts/voice-eval/out', // git-ignored local run output
]);

const sha256 = (word: string): string => createHash('sha256').update(word).digest('hex');

/** The words in `text` whose lower-case SHA-256 is in `hashes` ("Name's" counts, "Namesake" does not). */
function deniedWordsIn(text: string, hashes: ReadonlySet<string>): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => hashes.has(sha256(w)));
}

/** Every scanned file under `root`, as a root-relative path. */
function corpusFiles(root: string): string[] {
  const walk = (rel: string): string[] => {
    if (EXCLUDED.has(rel) || !existsSync(join(root, rel))) return [];
    const entries = readdirSync(join(root, rel), { withFileTypes: true });
    return entries.flatMap((e) => {
      const child = `${rel}/${e.name}`;
      if (EXCLUDED.has(child)) return [];
      return e.isDirectory() ? walk(child) : [child];
    });
  };
  return [
    ...SCANNED_DIRS.flatMap(walk),
    ...SCANNED_FILES.filter((f) => existsSync(join(root, f))),
  ];
}

/** "path:line" for every line of a scanned file under `root` that holds a denied word. */
function hitsUnder(root: string, hashes: ReadonlySet<string>): string[] {
  return corpusFiles(root).flatMap((rel) =>
    readFileSync(join(root, rel), 'utf8')
      .split('\n')
      .flatMap((line, i) => (deniedWordsIn(line, hashes).length ? [`${rel}:${i + 1}`] : []))
  );
}

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

describe("Ferni's friends are invented", () => {
  it('scans the whole bundle, the evals and the universe pages', () => {
    const files = corpusFiles(REPO_ROOT);
    for (const rel of [
      `${BUNDLE}/identity/character-own-life.md`,
      `${BUNDLE}/identity/biography.md`,
      `${BUNDLE}/content/behaviors/backstory-dynamic.json`,
      `${BUNDLE}/content/stories/brazil-joy.json`,
      `${BUNDLE}/content/identity/inner-world.json`,
      `${BUNDLE}/content/prompts/_assembly.json`,
      'scripts/persona-eval/canon-judge.ts',
      'brand/universe-bible.html',
    ]) {
      expect(files).toContain(rel);
    }
    expect(files.some((f) => f.startsWith('scripts/voice-eval/'))).toBe(true);
    expect(spoken.length).toBeGreaterThan(10);
  });

  it('every excluded path still exists, except the optional local eval output', () => {
    for (const rel of EXCLUDED) {
      if (rel === 'scripts/voice-eval/out') continue;
      expect(existsSync(join(REPO_ROOT, rel))).toBe(true);
    }
  });

  it('names the invented friends in his people list and own-life sheet', () => {
    const people = JSON.parse(
      readFileSync(join(REPO_ROOT, BUNDLE, 'identity/people.json'), 'utf8')
    ) as { names: string[] };
    for (const name of FRIENDS) expect(people.names).toContain(name);
    const ownLife = readFileSync(join(REPO_ROOT, BUNDLE, 'identity/character-own-life.md'), 'utf8');
    for (const name of FRIENDS) expect(ownLife).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it('none of the retired names comes back', () => {
    const spokenHits = spoken.flatMap(({ path, text }) =>
      text
        .split('\n')
        .flatMap((line, i) =>
          deniedWordsIn(line, RETIRED_NAME_HASHES).length ? [`${path}:${i + 1}`] : []
        )
    );
    expect([...hitsUnder(REPO_ROOT, RETIRED_NAME_HASHES), ...spokenHits]).toEqual([]);
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

  // Mutation check on a temp copy of the repo layout. The retired names can't be
  // written here, so a stand-in word is added to the denied hashes and planted in
  // the copy: the same hash match the real names go through.
  describe('a planted retired name turns the scan red', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ferni-friends-'));
    afterAll(() => rmSync(tmp, { recursive: true, force: true }));
    const denied = new Set([...RETIRED_NAME_HASHES, sha256('zorvik')]);

    const plant = (rel: string): string => {
      const root = mkdtempSync(join(tmp, 'root-'));
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      copyFileSync(join(REPO_ROOT, rel), join(root, rel));
      expect(hitsUnder(root, denied)).toEqual([]);
      writeFileSync(join(root, rel), `${readFileSync(join(root, rel), 'utf8')}\nZorvik's call\n`);
      return root;
    };

    it.each([
      `${BUNDLE}/content/stories/brazil-joy.json`,
      `${BUNDLE}/content/identity/inner-world.json`,
      `${BUNDLE}/content/prompts/_assembly.json`,
      'scripts/persona-eval/canon-judge.ts',
    ])('%s', (rel) => {
      const root = plant(rel);
      const lines = readFileSync(join(root, rel), 'utf8').split('\n').length;
      expect(hitsUnder(root, denied)).toEqual([`${rel}:${lines - 1}`]);
    });

    it.each([...EXCLUDED].filter((rel) => rel !== 'scripts/voice-eval/out'))(
      'the excluded %s stays out',
      (rel) => {
        const root = plant(rel);
        expect(hitsUnder(root, denied)).toEqual([]);
      }
    );
  });
});
