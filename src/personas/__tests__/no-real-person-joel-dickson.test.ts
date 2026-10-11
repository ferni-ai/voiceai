/**
 * No-real-person guard for the `joel-dickson` persona.
 *
 * Founder decision (2026-10-11): no persona may copy a real person's life or speak as a
 * real named person. The `joel-dickson` id stays (it is a code id), but the character is
 * now the fictional Nate Holloway. This test fails if any real identifier from the old
 * biography comes back into the bundle, its context builder, or its page scripts.
 *
 * @module personas/__tests__/no-real-person-joel-dickson.test
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const SCANNED_DIRS = [
  'src/personas/bundles/joel-dickson',
  'src/intelligence/context-builders/personas/joel-dickson-insights',
];
const SCANNED_FILES = ['scripts/deploy-joel-page.mts', 'scripts/regen-joel.ts'];

// Persona ids and the code symbols derived from them are kept on purpose; strip them first.
const KEPT_ID_TOKENS =
  /joel-dickson|john-bogle|peter-lynch|joelDickson|JOEL_DICKSON|joel_dickson|johnBogle|JOHN_BOGLE|john_bogle|peterLynch|PETER_LYNCH|peter_lynch/gi;

const REAL_PERSON_DENYLIST = new RegExp(
  [
    'Dickson',
    '\\bJoel\\b',
    'Vanguard',
    'Bogle',
    '\\bJack\\b',
    'Oshkosh',
    'Stanford',
    'VFAM',
    'Planner and (the )?Geek',
    'ClariFi',
    'Valley Forge',
    'Malvern',
    'Wellington',
    'Federal Reserve',
    '\\bthe Fed\\b',
    '\\bFed\\b',
    'foot surger',
    'Lynch',
    'Magellan',
    // Places, family, colleagues and programs from the real biography
    'Wisconsin',
    'Pennsylvania',
    'Philadelphia',
    'West Chester',
    'Chester Springs',
    'Plano',
    '\\bLynn\\b',
    '\\bMichael\\b',
    'Nicole',
    'Susan',
    'Boyer',
    'Schweizer',
    '\\bIan\\b',
    'Isabel',
    'Shoven',
    '\\bMaria\\b',
    'Bruno',
    'Jaconetti',
    'Khang',
    'Buckley',
    'Greenspan',
    'Achilles',
    'racquetball',
    'Saint-R',
    'Advisor.s Alpha',
    'farmette',
    'heart transplant',
    'pad and paper',
    'Congress',
    'valedictorian',
    // Real-person quotes that were spoken as the persona's own words
    'impulse is your enemy',
    'buy the haystack',
    "what you don.t pay for",
    'humble arithmetic',
  ].join('|'),
  'i'
);

const CANON_MARKERS = ['Nate', 'Sioux Falls', 'Walt Sorensen', 'Ellen', 'Maddie'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const scannedPaths = [
  ...SCANNED_DIRS.flatMap((d) => walk(join(repoRoot, d))),
  ...SCANNED_FILES.map((f) => join(repoRoot, f)),
];
const corpus = scannedPaths.map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe('joel-dickson persona is fictional (Nate Holloway)', () => {
  it('reads the whole bundle, context builder and page scripts', () => {
    // 86 bundle files + 7 context-builder files + 2 scripts at the time of writing.
    expect(corpus.length).toBeGreaterThanOrEqual(95);
  });

  it('contains no real-person identifiers', () => {
    const hits: string[] = [];
    for (const { path, text } of corpus) {
      text.split('\n').forEach((line, i) => {
        const m = line.replace(KEPT_ID_TOKENS, '').match(REAL_PERSON_DENYLIST);
        if (m) hits.push(`${path.slice(repoRoot.length)}:${i + 1}: "${m[0]}"`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('carries the fictional canon, so the scan is reading real content', () => {
    const all = corpus.map((c) => c.text).join('\n');
    for (const marker of CANON_MARKERS) {
      expect(all, `canon marker "${marker}" missing`).toContain(marker);
    }
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'src/personas/bundles/joel-dickson/persona.manifest.json'), 'utf8')
    ) as { identity: { id: string; name: string; self_reference: string; aliases: string[] } };
    expect(manifest.identity.id).toBe('joel-dickson');
    expect(manifest.identity.name).toBe('Nate Holloway');
    expect(manifest.identity.self_reference).toBe('Nate');
    expect(manifest.identity.aliases).not.toContain('dr-dickson');
    expect(manifest.identity.aliases).not.toContain('vanguard-mentor');
  });

  it('denylist would catch the old biography (guards against a vacuous regex)', () => {
    expect('I joined Vanguard the year Jack Bogle got his heart transplant.').toMatch(
      REAL_PERSON_DENYLIST
    );
    expect('Stanford PhD, briefed the Fed'.replace(KEPT_ID_TOKENS, '')).toMatch(REAL_PERSON_DENYLIST);
    expect('handoff to john-bogle or peter-lynch'.replace(KEPT_ID_TOKENS, '')).not.toMatch(
      REAL_PERSON_DENYLIST
    );
  });
});
