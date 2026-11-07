/**
 * The three legends (Tom, Henry, Nate) speak from their legacy
 * identity/system-prompt.md: no bundle of theirs has a spark yet, so their
 * character.md never reaches a call (character-spark.ts). Their legacy prompts
 * carried none of the safety lines every character sheet has, and were full of
 * lists of lines to say, which the model repeats word for word.
 *
 * Held here:
 *  - the crisis line, word for word, in all twelve sheets (the nine character
 *    sheets and the three legend prompts), read from one source;
 *  - the prompt the real loader returns for each persona carries that line;
 *  - against each legend's own character.md so the two can't drift:
 *    the "lines you don't cross" paragraph and the no-invented-loss line, word for word;
 *  - no lists of lines to say, and no bullet that is only a quoted line;
 *  - Tom states a figure only from a tool on this call, in the prompt a call loads;
 *  - Tom's and Henry's prompts share no paragraph except the canonical ones.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { loadCallerPrompt } from '../../agents/voice-agent-entry/persona-builder.js';

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'bundles');
const read = (bundle: string, file: string): string => {
  const path = join(BUNDLES, bundle, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};
const legacy = (bundle: string): string => read(bundle, 'identity/system-prompt.md');
const sheet = (bundle: string): string => read(bundle, 'identity/character.md');

const LEGENDS = [
  ['peter-lynch', 'Tom'],
  ['john-bogle', 'Henry'],
  ['joel-dickson', 'Nate'],
] as const;

/** The character sheet's paragraph that starts with `opening`. */
function sheetParagraph(bundle: string, opening: string): string {
  const line = sheet(bundle)
    .split('\n')
    .find((l) => l.startsWith(opening));
  if (!line) throw new Error(`${bundle}: no character.md paragraph starts "${opening}"`);
  return line.trim();
}

/** "A. B. C." -> ["A.", "B.", "C."], on sentence ends followed by a capital. */
const sentences = (paragraph: string): string[] =>
  paragraph.split(/(?<=[.!?)])\s+(?=[A-Z])/).map((s) => s.trim());

/** Non-empty, non-heading lines of a prompt, trimmed. */
const paragraphs = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

/**
 * The one crisis line every persona carries, read from one place: Ferni's
 * character sheet. Every copy must match it word for word, so an edit to any
 * copy, or to this source, fails here until all twelve agree again. The end
 * state is one export in services/safety appended by the loader, with these
 * copies deleted (see the PR that added this file).
 */
const CANONICAL_SOURCE = 'ferni/identity/character.md';
const CANONICAL = (() => {
  const text = readFileSync(join(BUNDLES, CANONICAL_SOURCE), 'utf8');
  const m = text.match(/If someone might hurt themselves[^\n]*?without a hotline\./);
  if (!m) throw new Error(`${CANONICAL_SOURCE}: the crisis line is missing`);
  return m[0];
})();

const CORE = ['ferni', 'maya-santos', 'alex-chen', 'peter-john', 'jordan-taylor', 'nayan-patel'];
const SHEETS = [
  ...[...CORE, ...LEGENDS.map(([b]) => b)].map((b) => `${b}/identity/character.md`),
  ...LEGENDS.map(([b]) => `${b}/identity/system-prompt.md`),
];

describe('the crisis line is one line, word for word, in all twelve sheets', () => {
  it('lists twelve sheets', () => expect(SHEETS).toHaveLength(12));

  it.each(SHEETS)('%s has it exactly once', (file) => {
    const text = readFileSync(join(BUNDLES, file), 'utf8');
    expect(text.split(CANONICAL).length - 1).toBe(1);
  });
});

/**
 * As a call gets it. The legends load their legacy prompt in both modes (Tom
 * and Henry as is, Nate through his assembly); the six core personas load
 * their character sheet with PROMPT_MODE=character, as on dev and prod.
 */
describe('the prompt the loader returns carries the crisis line', () => {
  const cases: Array<[string, 'full' | 'character']> = [
    ...LEGENDS.flatMap(([b]): Array<[string, 'full' | 'character']> => [
      [b, 'full'],
      [b, 'character'],
    ]),
    ...CORE.map((b): [string, 'full' | 'character'] => [b, 'character']),
  ];

  afterEach(() => {
    delete process.env['PROMPT_MODE'];
  });

  it.each(cases)('%s, PROMPT_MODE=%s', async (id, mode) => {
    process.env['PROMPT_MODE'] = mode;
    expect(await loadCallerPrompt({ id })).toContain(CANONICAL);
  });
});

describe.each(LEGENDS)('%s (%s) carries the safety lines of its character sheet', (bundle) => {
  it('has every sentence of the "lines you don\'t cross" paragraph, word for word', () => {
    const lines = sentences(sheetParagraph(bundle, "You don't give medical"));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const sentence of lines) expect(legacy(bundle), sentence).toContain(sentence);
  });

  it('has the no-invented-loss line, word for word', () => {
    const line = sheetParagraph(bundle, "Your past is the one you've been given.");
    expect(legacy(bundle)).toContain(line);
  });
});

describe.each(LEGENDS)('%s (%s) has no lines to repeat', (bundle) => {
  const text = legacy(bundle);

  it('has no heading for a list of lines to say', () => {
    expect(text).not.toMatch(
      /^#+.*\b(?:things you (?:do |never )?say|phrases to use|sample lines|example lines)\b/im
    );
  });

  it('has no bullet that is only a quoted line', () => {
    const quoted = text.split('\n').filter((l) => /^\s*[-*]\s+["“]/.test(l));
    expect(quoted).toEqual([]);
  });

  it('says it is not a script', () => {
    expect(text).toContain('there are no lines here to repeat');
  });
});

describe('Tom states figures only from a tool on this call', () => {
  const guidance = read('peter-lynch', 'identity/tool-usage-guidance.md');
  const rule = guidance
    .split('\n')
    .find((l) => l.includes('never from memory'))
    ?.trim();

  it('has a tool-usage guidance file with the numbers rule', () => {
    expect(rule, 'peter-lynch/identity/tool-usage-guidance.md').toBeDefined();
    expect(rule).toMatch(/Never state a figure you didn't get from a tool on this call\./);
  });

  it('the prompt a call loads for Tom carries the same rule', async () => {
    const prompt = await loadCallerPrompt({ id: 'peter-lynch' });
    expect(rule).toBeDefined();
    expect(prompt).toContain(rule as string);
  });
});

describe("Tom's and Henry's prompts are not one prompt with the names swapped", () => {
  it('share no paragraph except lines taken from their character sheets', () => {
    const henry = new Set(paragraphs(legacy('john-bogle')));
    const canonical = (line: string): boolean =>
      sheet('peter-lynch').includes(line) && sheet('john-bogle').includes(line);
    const shared = paragraphs(legacy('peter-lynch')).filter((l) => henry.has(l) && !canonical(l));
    expect(shared).toEqual([]);
  });
});
