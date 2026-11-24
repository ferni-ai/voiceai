/**
 * Intro lines use each teammate's pronouns from persona-pronouns.ts (#1431).
 *
 * The coordinator's intro lines called Alex "they" ("Let me get Alex - they're amazing
 * at this") while the canon says he, and the shared handoff lines called Jordan "them"
 * and Alex "she". A caller heard one teammate called three things. So every line that
 * introduces, suggests or hands to a teammate is checked against getPersonaPronouns:
 * a line that names one teammate may only use that teammate's pronouns after the name.
 * Change a pronoun in persona-pronouns.ts and this fails until the lines follow it.
 *
 * The lines: the manifests' handoff and team phrases, the bundles' handoff setups and
 * team-coordination phrases, and the string literals of the code that speaks handoffs
 * (banter, team dynamics, team config fallbacks, the handoff tools, team unlocks).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { getPersonaPronouns } from '../persona-pronouns.js';

const ROOT = process.cwd();
const BUNDLES = join(ROOT, 'src/personas/bundles');

/** How lines name each teammate, by canonical id. */
const NAMES: Record<string, string> = {
  ferni: 'ferni',
  peter: 'peter-john',
  alex: 'alex-chen',
  maya: 'maya-santos',
  jordan: 'jordan-taylor',
  nayan: 'nayan-patel',
  henry: 'john-bogle',
  nate: 'joel-dickson',
};

const THIRD_PERSON: Record<string, 'subject' | 'object' | 'possessive'> = {
  he: 'subject',
  she: 'subject',
  they: 'subject',
  him: 'object',
  them: 'object',
  his: 'possessive',
  their: 'possessive',
  her: 'object', // object or possessive: both are "her"
  himself: 'object',
  herself: 'object',
  themselves: 'object',
};

/** "he's" → "he", "Alex's" → "alex". */
const bare = (word: string): string => word.toLowerCase().replace(/'(s|ll|re|ve|d)$/, '');

/**
 * Pronouns in `line` that don't belong to the one teammate it names, after the name.
 * Empty when the line names no teammate or more than one (it can't say whose they are).
 */
function wrongPronouns(line: string): string[] {
  const words = (line.match(/[a-z]+(?:['’][a-z]+)?/gi) ?? []).map((w) => bare(w.replace('’', "'")));
  const named = [...new Set(words.filter((w) => Object.hasOwn(NAMES, w)))];
  if (named.length !== 1) return [];
  const { subject, object, possessive } = getPersonaPronouns(NAMES[named[0]]);
  const own = new Set([subject, object, possessive, `${object}self`, `${object}selves`]);
  return words
    .slice(words.indexOf(named[0]) + 1)
    .filter((w) => Object.hasOwn(THIRD_PERSON, w) && !own.has(w));
}

/**
 * Lines whose pronoun after the name means someone or something else, by exact text.
 */
const NOT_THE_TEAMMATE = new Map<string, string>([
  [
    'Peter has stories. <break time="200ms"/>A lot of them. <break time="150ms"/>They\'re all good.',
    'them/they: the stories',
  ],
  [
    'You\'ll love Peter. <break time="200ms"/>He\'s got stories for days. <break time="150ms"/>And they\'re actually good.',
    'they: the stories',
  ],
  [
    "Alex is going to change how you communicate. He's brilliant at helping people say what they mean and mean what they say. You've earned this introduction.",
    'they: the people Alex helps',
  ],
  [
    'There is someone I deeply respect... a sage. But Nayan only speaks to those who have proven their commitment to growth. Keep showing up.',
    'their: "those" who have proven it',
  ],
  ['Honoring the moments... Jordan knows how to make them matter.', 'them: the moments'],
]);

// ---------------------------------------------------------------------------
// Where intro lines live
// ---------------------------------------------------------------------------

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Every string under `node`, skipping keys in `skip` (trigger word lists, not lines). */
function strings(node: unknown, skip = new Set<string>()): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap((n) => strings(n, skip));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => (skip.has(k) ? [] : strings(v, skip)));
  }
  return [];
}

const field = (node: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined),
    node
  );

function bundleLines(): Array<{ line: string; at: string }> {
  const out: Array<{ line: string; at: string }> = [];
  for (const id of readdirSync(BUNDLES)) {
    if (id.startsWith('.')) continue;
    const dir = join(BUNDLES, id);
    const at = (file: string): string => `${id}/${file}`;
    let manifest: unknown;
    try {
      manifest = readJson(join(dir, 'persona.manifest.json'));
    } catch {
      continue; // not a bundle folder
    }
    for (const node of [
      field(manifest, 'handoff', 'introduction_from_coordinator'),
      field(manifest, 'handoff', 'entrance_phrases'),
      field(manifest, 'handoff', 'exit_phrases'),
      field(manifest, 'team', 'handoff_phrases'),
    ]) {
      strings(node).forEach((line) => out.push({ line, at: at('persona.manifest.json') }));
    }
    const behaviors = join(dir, 'content/behaviors');
    const read = (file: string): unknown => {
      try {
        return readJson(join(behaviors, file));
      } catch {
        return undefined;
      }
    };
    strings(field(read('team-stories.json'), 'team_handoff_setups')).forEach((line) =>
      out.push({ line, at: at('team-stories.json team_handoff_setups') })
    );
    strings(read('team-coordination.json'), new Set(['triggers'])).forEach((line) =>
      out.push({ line, at: at('team-coordination.json') })
    );
  }
  return out;
}

/** The code that speaks handoffs and introductions. */
const CODE = [
  'src/services/team-engagement/banter.ts',
  'src/services/team-engagement/intelligent-banter.ts',
  'src/personas/shared/team-dynamics.ts',
  'src/personas/shared/team-chemistry.ts',
  'src/personas/team/team-config.ts',
  'src/agents/personas/ferni-agent.ts',
  'src/agents/personas/peter-agent.ts',
  'src/agents/personas/alex-agent.ts',
  'src/agents/personas/maya-agent.ts',
  'src/agents/personas/jordan-agent.ts',
  'src/agents/personas/nayan-agent.ts',
  'src/agents/shared/conversational-audio-cache.ts',
  'src/tools/semantic-router/tool-definitions/handoff.semantic.ts',
  'src/services/social/team-unlocks.ts',
  'src/intelligence/context-builders/personas/ferni-coordinator-insights.ts',
];

/** Every line of every string literal and template piece in a file. */
function literalLines(file: string): Array<{ line: string; at: string }> {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const out: Array<{ line: string; at: string }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      const row = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      node.text.split('\n').forEach((line, i) => out.push({ line, at: `${file}:${row + i}` }));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('teammate pronouns in intro lines', () => {
  it('flags a pronoun that disagrees with persona-pronouns.ts, for every teammate', () => {
    expect(wrongPronouns("Let me get Alex - they're amazing at this.")).toEqual(['they']);
    expect(wrongPronouns("Let me get Alex. He's amazing at this.")).toEqual([]);
    expect(wrongPronouns("Let me get Alex. She's scary efficient.")).toEqual(['she']);
    expect(wrongPronouns('Jordan is going to LOVE this! Let me bring them in.')).toEqual(['them']);
    expect(wrongPronouns("This is Jordan's wheelhouse. Planning is her thing.")).toEqual([]);
    expect(wrongPronouns("Maya's perfect for this. He won't judge.")).toEqual(['he']);
    expect(wrongPronouns('Let me get Ferni back. She will wrap up.')).toEqual(['she']);
    expect(wrongPronouns('Nayan should take this. They know.')).toEqual(['they']);
    expect(wrongPronouns('Peter knows his stuff.')).toEqual([]);
    expect(wrongPronouns('Nate has real wisdom. Let me get them.')).toEqual(['them']);
  });

  it('reads the pronouns from persona-pronouns.ts, not from the test', () => {
    for (const [name, id] of Object.entries(NAMES)) {
      const { subject } = getPersonaPronouns(id);
      expect(subject, `${name} is in the canon`).not.toBe('they');
      const other = subject === 'he' ? 'she' : 'he';
      expect(wrongPronouns(`Let me get ${name}. ${subject} is great.`), name).toEqual([]);
      expect(wrongPronouns(`Let me get ${name}. ${other} is great.`), name).toEqual([other]);
    }
  });

  it('ignores a line naming no teammate or two, and pronouns before the name', () => {
    expect(wrongPronouns('Let me bring them in.')).toEqual([]);
    expect(wrongPronouns('Maya and Alex both love this. They will help.')).toEqual([]);
    expect(wrongPronouns('For decisions and how they connect, Nate has wisdom.')).toEqual([]);
  });

  it('every intro line uses the named teammate’s pronouns', () => {
    const lines = [...bundleLines(), ...CODE.flatMap(literalLines)];
    expect(lines.length).toBeGreaterThan(500);
    const offenders = lines
      .filter(({ line }) => wrongPronouns(line).length > 0 && !NOT_THE_TEAMMATE.has(line.trim()))
      .map(({ line, at }) => `${at}: [${wrongPronouns(line).join(',')}] ${line.trim()}`);
    expect(offenders).toEqual([]);
  });

  it('keeps each exemption pointing at a line that still exists', () => {
    const all = new Set(
      [...bundleLines(), ...CODE.flatMap(literalLines)].map(({ line }) => line.trim())
    );
    for (const line of NOT_THE_TEAMMATE.keys()) expect(all.has(line), line).toBe(true);
  });
});
