/**
 * PERSONA_CANON_FACTS (persona-canon-facts.ts). Two halves:
 *
 * The canon judge: every value in a bundle's identity/canon-facts.json must
 * still agree with the bundle's own sources, so a later edit to a biography,
 * character sheet or behaviors file that contradicts it fails here. Prod calls
 * 2026-10-24: Ferni's pets changed four ways in thirty seconds; Jordan said she
 * has no gender, then that she is with Sam.
 *
 * The wiring: with the flag on, the live prompt (loadCallerPrompt ->
 * loadSystemPrompt) ends with the facts line, in both prompt modes; off, it is
 * the prompt exactly as it was.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { loadCallerPrompt } from '../../agents/voice-agent-entry/persona-builder.js';
import {
  CANON_BUNDLES,
  CANON_FACTS_FILE,
  CANON_FACTS_TOKENS,
  NONE_MENTIONED,
  ONLY_IF_ASKED,
  canonFactsLine,
  withCanonFacts,
  type CanonFacts,
} from '../persona-canon-facts.js';
import { getPersonaPronouns } from '../persona-pronouns.js';

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'bundles');
const read = (bundle: string, file: string): string => {
  const path = join(BUNDLES, bundle, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};
const facts = (bundle: string): CanonFacts => JSON.parse(read(bundle, CANON_FACTS_FILE));
/** The bundle's canon.json (self-recall.ts), or {}. */
const canon = (bundle: string): Record<string, string> =>
  JSON.parse(read(bundle, 'identity/canon.json') || '{}');

/** Where a persona's life is written down. */
const SOURCES = [
  'identity/biography-core.md',
  'identity/character.md',
  'identity/core-identity.md',
  'identity/biography.md',
  'identity/character-own-life.md',
  'identity/system-prompt.md',
];
const sourceLines = (bundle: string): string[] => [
  ...SOURCES.flatMap((f) => read(bundle, f).split('\n')),
  ...Object.values(canon(bundle)),
];

const STOP = new Set('the and your you her his with about are was for who has'.split(' '));
const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean)
  );
/** The words a value says something with. */
const keywords = (value: string): string[] =>
  [...words(value)].filter((w) => w.length >= 3 && !STOP.has(w));
/** Proper names in a value, outside parentheses: "Sam (Samantha)" -> ["Sam"]. */
const names = (value: string): string[] =>
  value.replace(/\([^)]*\)/g, '').match(/\b[A-Z][a-z]+\b/g) ?? [];
const known = (value: string): boolean => value !== NONE_MENTIONED;

/** Every string under a "core_references" key in a behaviors file. */
function coreReferences(json: unknown): string[] {
  if (!json || typeof json !== 'object') return [];
  return Object.entries(json).flatMap(([key, value]) =>
    key === 'core_references' && Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string')
      : coreReferences(value)
  );
}

describe.each(CANON_BUNDLES)('canon facts for %s agree with its sources', (bundle) => {
  const f = facts(bundle);

  it('has every fact, and work is always given', () => {
    for (const key of ['pronouns', 'age', 'partner', 'pets', 'home', 'work'] as const) {
      expect(typeof f[key], key).toBe('string');
    }
    expect(known(f.work)).toBe(true);
  });

  it('pronouns match persona-pronouns.ts', () => {
    const p = getPersonaPronouns(bundle);
    expect(f.pronouns).toBe(`${p.subject}/${p.object}`);
  });

  it('each given fact is said, word for word, on one line of the bundle', () => {
    const lines = sourceLines(bundle).map(words);
    for (const key of ['age', 'partner', 'pets', 'home', 'heritage', 'work'] as const) {
      const value = f[key];
      if (value === undefined || !known(value) || value === 'none') continue;
      const wanted = keywords(value);
      expect(wanted.length, key).toBeGreaterThan(0);
      const said = lines.some((line) => wanted.every((w) => line.has(w)));
      expect(said, `${key}: "${value}" is on no source line`).toBe(true);
    }
  });

  it('names its partner, pets and home the same way in biography-core.md and character.md', () => {
    for (const value of [f.partner, f.pets, f.home].filter(known)) {
      for (const name of names(value)) {
        expect(read(bundle, 'identity/biography-core.md'), name).toMatch(
          new RegExp(`\\b${name}\\b`)
        );
        expect(read(bundle, 'identity/character.md'), name).toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
  });

  it('pets: "none" is written down; "none mentioned" means no source gives one', () => {
    const text = SOURCES.slice(0, 3)
      .map((file) => read(bundle, file))
      .join('\n');
    if (f.pets === 'none') expect(text).toMatch(/\bno pets\b/i);
    if (!known(f.pets)) {
      expect(text).not.toMatch(
        /\b(?:my|your|our)\s+(?:\w+\s+)?(?:dogs?|cats?|pets?|pupp(?:y|ies))\b/i
      );
    }
  });

  it("agrees with canon.json's age and wife", () => {
    const c = canon(bundle);
    if (c.age) expect(keywords(f.age).every((w) => words(c.age).has(w))).toBe(true);
    if (c.wife) expect(keywords(f.partner).every((w) => words(c.wife).has(w))).toBe(true);
  });

  it("agrees with the behaviors file's core references (partner and pets)", () => {
    const text = read(bundle, 'content/behaviors/emotional-intelligence.json');
    const refs = text ? coreReferences(JSON.parse(text)) : [];
    if (refs.length === 0) return;
    for (const name of [...names(f.partner), ...names(f.pets)]) {
      expect(
        refs.some((r) => r.includes(name)),
        `${name} in core_references`
      ).toBe(true);
    }
    // "Sam - girlfriend 4 years": whoever a reference names as the partner is the canon partner.
    for (const ref of refs) {
      const m = ref.match(
        /^([A-Z]\w+)\s*-\s*(?:girlfriend|boyfriend|partner|wife|husband|married)\b/
      );
      if (m) expect(f.partner, ref).toContain(m[1]);
    }
  });

  it(`renders as one line under ${CANON_FACTS_TOKENS} tokens, without "none mentioned"`, () => {
    const line = canonFactsLine(f);
    expect(line).not.toContain('\n');
    expect(line).not.toContain(NONE_MENTIONED);
    expect(Math.ceil(line.length / 4)).toBeLessThan(CANON_FACTS_TOKENS);
    expect(line).toContain(f.pronouns);
    for (const name of names(f.partner)) expect(line).toContain(name);
  });

  it('every persona has an age and a home on its line (2026-10-25 canon pass)', () => {
    expect(known(f.age), 'age').toBe(true);
    expect(known(f.home), 'home').toBe(true);
    const line = canonFactsLine(f);
    expect(line).toContain(`age ${f.age}`);
    expect(line).toContain(`home: ${f.home}`);
  });
});

/** Files that quote what callers say ("I need to say sorry to my partner"), not the persona. */
const CALLER_TEXT = /function-calling-specialty|tool-usage-guidance|knowledge\/|methodologies\//;

/** Every text file in a bundle the persona speaks from, as [path inside the bundle, text]. */
function bundleFiles(bundle: string): Array<[string, string]> {
  const root = join(BUNDLES, bundle);
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.(?:md|json|ts)$/.test(f) && !CALLER_TEXT.test(f))
    .map((f): [string, string] => [f, readFileSync(join(root, f), 'utf8')]);
}

/**
 * The product owner's canon calls (2026-10-25), held across every file in the
 * bundle, not just the identity sources: a prod call audit heard Ferni's pets
 * change four ways in thirty seconds and Maya's heritage differ file to file.
 * A quoted caller line ("after 'my dog died'") is not a claim, hence (?<!').
 */
describe('canon calls hold in every file of the bundle', () => {
  const CONFLICTS: Array<[bundle: string, claim: RegExp, why: string]> = [
    [
      'ferni',
      /(?<!')\b(?:my|our)\s+(?:\w+\s+)?(?:dogs?|cats?|pets?|pupp(?:y|ies)|kittens?)\b|\bI (?:have|had) an? (?:\w+ )?(?:dog|cat|pet)\b/i,
      'Ferni has no pets',
    ],
    [
      'maya-santos',
      /\bFilipin[oa] roots\b|(?<!Filipino-)\bBrazilian (?:heritage|roots)\b|\bI'm (?:Filipin[oa]|Brazilian)-American\b/,
      'Maya is Filipino-Brazilian, never one side alone',
    ],
    [
      'maya-santos',
      /\bLola\W+my cat\b|\bLola\b[^.]*\bShe's a cat\b/i,
      'Lola is her grandmother, not a cat',
    ],
    [
      'maya-santos',
      /\bmy husband\b|can't keep a dating relationship/i,
      'Daniel is her partner of six years',
    ],
    [
      'peter-john',
      /\bI'm (?:80|eighty)\b|\b(?:80|eighty) years old\b/i,
      'Peter is in his late seventies',
    ],
    ['alex-chen', /(?<!')\bmy (?:partner|girlfriend|boyfriend|wife|husband)\b/i, 'Alex is single'],
  ];

  it.each(CONFLICTS)('%s: %s is said nowhere (%s)', (bundle, claim) => {
    const hits = bundleFiles(bundle).flatMap(([file, text]) =>
      text
        .split('\n')
        .filter((line) => claim.test(line))
        .map((line) => `${file}: ${line.trim().slice(0, 120)}`)
    );
    expect(hits).toEqual([]);
  });

  it("Maya's own story files name both sides of her family", () => {
    for (const file of [
      'biography-core.md',
      'character.md',
      'core-identity.md',
      'system-prompt.md',
    ]) {
      const text = read('maya-santos', `identity/${file}`);
      expect(text, file).toMatch(/Philippines|Filipin/);
      expect(text, file).toMatch(/Brazil/);
    }
  });

  it("renders the calls: Maya's heritage, Ferni without pets, Peter in his late seventies", () => {
    expect(canonFactsLine(facts('maya-santos'))).toContain(
      'heritage: Filipino-Brazilian, California raised;'
    );
    expect(facts('ferni').pets).toBe('none');
    expect(canonFactsLine(facts('ferni'))).toContain('pets: none;');
    expect(canonFactsLine(facts('peter-john'))).toContain('age late seventies;');
    for (const b of CANON_BUNDLES.filter((x) => x !== 'maya-santos')) {
      expect(canonFactsLine(facts(b)), b).not.toContain('heritage:');
    }
  });
});

describe('the facts line in the live persona prompt', () => {
  afterEach(() => {
    delete process.env['PERSONA_CANON_FACTS'];
    delete process.env['PROMPT_MODE'];
  });

  // canon.json: "Don't bring her up unprompted, and speak of her in the past tense."
  it("Nayan's line says his late wife comes up only if asked, in the past tense", () => {
    const nayan = canonFactsLine(facts('nayan-patel'));
    expect(nayan).toContain(`partner: Jyoti, your wife, died six years ago ${ONLY_IF_ASKED};`);
    expect(ONLY_IF_ASKED).toMatch(/only if asked/);
    expect(ONLY_IF_ASKED).toMatch(/past tense/);
    for (const b of CANON_BUNDLES.filter((x) => x !== 'nayan-patel')) {
      expect(canonFactsLine(facts(b)), b).not.toContain(ONLY_IF_ASKED);
    }
  });

  const jordan = canonFactsLine(facts('jordan-taylor'));
  it("says Jordan's pronouns, partner and dog", () => {
    expect(jordan).toContain('she/her');
    expect(jordan).toContain('Sam (Samantha)');
    expect(jordan).toContain('Compass');
    expect(jordan).toContain("Don't invent other pets, partners or homes.");
  });

  it('off: withCanonFacts hands back the very prompt it was given', async () => {
    expect(await withCanonFacts('jordan-taylor', 'PROMPT', {})).toBe('PROMPT');
    const off = { PERSONA_CANON_FACTS: 'off' };
    expect(await withCanonFacts('jordan-taylor', 'PROMPT', off)).toBe('PROMPT');
  });

  it('on: a persona without canon facts (a legend) is unchanged', async () => {
    const env = { PERSONA_CANON_FACTS: 'on' };
    expect(await withCanonFacts('joel-dickson', 'PROMPT', env)).toBe('PROMPT');
  });

  describe.each(['full', 'character'])('PROMPT_MODE=%s', (mode) => {
    it.each(CANON_BUNDLES)('%s: on ends with its line; off is the prompt without it', async (b) => {
      process.env['PROMPT_MODE'] = mode;
      const off = await loadCallerPrompt(b);
      expect(off).not.toContain('Facts about you that never change');
      process.env['PERSONA_CANON_FACTS'] = 'on';
      const on = await loadCallerPrompt(b);
      expect(on).toBe(`${off.trimEnd()}\n\n${canonFactsLine(facts(b))}\n`);
    });
  });
});
