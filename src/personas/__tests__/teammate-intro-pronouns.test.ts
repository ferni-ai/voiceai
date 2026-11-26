/**
 * Teammates are called by their pronouns from persona-pronouns.ts (#1431). The one checker
 * for teammate pronouns in persona content (it replaces ferni-pronouns.test.ts).
 *
 * The coordinator's intro lines called Alex "they" ("Let me get Alex - they're amazing
 * at this") while the canon says he, the shared handoff lines called Jordan "them" and
 * Alex "she", and teammates' lines called Ferni "she". A caller heard one teammate called
 * three things. Each third-person pronoun is checked against the teammate named last
 * before it (getPersonaPronouns), so a line naming two teammates checks each pronoun
 * against the nearer name. Under a teammate's own key ("alex": [...] in team-stories.json,
 * "suggest_jordan" in predictive-intelligence.json) that teammate is named from the start.
 * Change a pronoun in persona-pronouns.ts and this fails until the lines follow it.
 *
 * What it scans, exactly:
 * - every pronoun, in the manifests' handoff and team phrases; each bundle's
 *   team-coordination.json, team-awareness.json and team-stories.json; the suggest_*
 *   entries of predictive-intelligence.json; and the string literals of the CODE files
 *   below (banter, team dynamics and chemistry, team config, the persona agents, the
 *   handoff tools, team unlocks, coordinator insights, handoff intelligence, team
 *   engagement);
 * - he/she/him/her/his/himself/herself only, in every other content/behaviors/*.json of
 *   every bundle (there "they" is nearly always the caller, so it is not checked);
 * - he/she/him/her/his/himself/herself after Ferni's name, on every line of every .json and
 *   .md file under the bundles (what ferni-pronouns.test.ts checked).
 * "They" after "Maya and Alex" is theirs, and a "they" after "someone" or "people" is that
 * person's. A teammate addressed by name inside a quote ("'Maya, not everything needs a
 * system.' He's right.") is not who the pronoun means, and a capitalised word mid-sentence
 * ("Daniel", "Mom", "Red Sox") ends the teammate's reach; a capital starting a sentence does
 * not, and SSML tags are dropped first so "<break .../>Should" starts one. Lines where the
 * pronoun after a name means something else are listed by exact text in NOT_THE_TEAMMATE.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const THIRD_PERSON = new Set([
  'he',
  'she',
  'they',
  'him',
  'them',
  'his',
  'their',
  'her',
  'himself',
  'herself',
  'themselves',
]);
const GENDERED = new Set(['he', 'she', 'him', 'his', 'her', 'himself', 'herself']);
/** "They" after "Maya and Alex" is both of them. */
const PLURAL = new Set(['they', 'them', 'their', 'themselves']);
/** After these, "they" is that person ("Maya helped someone. By the end they were laughing"). */
const SOMEONE = new Set(['someone', 'somebody', 'people', 'everyone', 'anyone']);

type Scope = 'all' | 'gendered';

/** "he's" → "he", "Alex's" → "alex". */
const bare = (word: string): string => word.toLowerCase().replace(/'(s|ll|re|ve|d)$/, '');

const isName = (w: string | undefined): w is string => w !== undefined && Object.hasOwn(NAMES, w);

/** A name said to someone in a quote ("'Alex, sometimes...", "..., Maya.'") names no one. */
const VOCATIVE = new RegExp(
  `(['"‘“]\\s*)(${Object.keys(NAMES).join('|')}),|,\\s*(${Object.keys(NAMES).join('|')})(?=[.!?'"’”])`,
  'gi'
);

/**
 * Pronouns in `line` that don't belong to the teammate named last before them.
 *
 * @param who - the teammate the line is about before it names anyone (its JSON key)
 */
function misgendered(
  line: string,
  scope: Scope = 'all',
  who?: string
): Array<{ name: string; word: string }> {
  // SSML and other markup ("<break time=\"200ms\"/>Should I", "<emphasis>") is not speech:
  // left in, "/>" hides that the next word starts a sentence and ends the name's reach.
  const text = line
    .replace(/<[^<>]*>/g, ' ')
    .replace(VOCATIVE, (_m, open: string | undefined) => open ?? '');
  const tokens = [...text.matchAll(/[a-z]+(?:['\u2019][a-z]+)?/gi)].map((m) => ({
    w: bare(m[0].replace('\u2019', "'")),
    // "Daniel", "Mom", "Red Sox" mid-sentence: someone (or something) else is now meant
    other:
      /^[A-Z][a-z]+$/.test(m[0]) && !/(^|[.!?:'"\u2018\u201c(]\s*)$/.test(text.slice(0, m.index)),
  }));
  const words = tokens.map((t) => t.w);
  const out: Array<{ name: string; word: string }> = [];
  let name = who;
  let plural = false;
  words.forEach((w, i) => {
    if (tokens[i].other && !isName(w) && w !== 'i') name = undefined;
    if (isName(w)) {
      name = w;
      plural =
        (words[i - 1] === 'and' && isName(words[i - 2])) ||
        (words[i + 1] === 'and' && isName(words[i + 2]));
      return;
    }
    if (SOMEONE.has(w)) plural = true;
    if (name === undefined || !THIRD_PERSON.has(w)) return;
    if ((scope === 'gendered' && !GENDERED.has(w)) || (plural && PLURAL.has(w))) return;
    const { subject, object, possessive } = getPersonaPronouns(NAMES[name]);
    const own = new Set([subject, object, possessive, `${object}self`, `${object}selves`]);
    if (!own.has(w)) out.push({ name, word: w });
  });
  return out;
}

const wrongPronouns = (line: string, scope: Scope = 'all', who?: string): string[] =>
  misgendered(line, scope, who).map((m) => m.word);

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
  [
    "Peter told me you're making decisions. Let's talk through how to communicate them.",
    'them: the decisions',
  ],
  [
    "Nayan reminds me why celebrations matter. They're not just parties - they're markers.",
    'they: the celebrations',
  ],
  [
    "Nayan told me once that the best milestones aren't achieved\u2014they're lived. I wrote that down. I look at it before big planning sessions.",
    'they: the milestones',
  ],
  [
    "She called me out once for getting too excited about data. Said 'Peter, they're a person, not a spreadsheet.' She was right. Doesn't happen often that someone's right when I'm wrong about data. But she was.",
    'they: the caller behind the data',
  ],
  [
    "He sees in decades. I see in data points. But somehow when we combine them... it's like seeing in 3D.",
    'them: the two views',
  ],
  [
    "Ferni brings the why, Peter brings the what. They often finish each other's thoughts on goals.",
    'they: Ferni and Peter',
  ],
]);

// ---------------------------------------------------------------------------
// Where the lines live
// ---------------------------------------------------------------------------

interface Line {
  readonly line: string;
  readonly at: string;
  readonly scope: Scope;
  readonly who?: string;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** The teammate a JSON key is about: "alex", "alex-chen", "suggest_alex". */
const keyName = (key: string): string | undefined =>
  Object.keys(NAMES).find((n) => key === n || key === NAMES[n] || key.endsWith(`_${n}`));

/** Every string under `node` with the teammate key above it, skipping trigger word lists. */
function strings(node: unknown, who?: string): Array<{ text: string; who?: string }> {
  if (typeof node === 'string') return [{ text: node, who }];
  if (Array.isArray(node)) return node.flatMap((n) => strings(n, who));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) =>
      k === 'triggers' ? [] : strings(v, keyName(k) ?? who)
    );
  }
  return [];
}

const field = (node: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined),
    node
  );

/** Team files: every pronoun is checked. */
const TEAM_FILES = new Set(['team-coordination.json', 'team-awareness.json', 'team-stories.json']);

function bundleLines(): Line[] {
  const out: Line[] = [];
  for (const id of readdirSync(BUNDLES)) {
    if (id.startsWith('.')) continue;
    const dir = join(BUNDLES, id);
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
      for (const { text } of strings(node)) {
        out.push({ line: text, at: `${id}/persona.manifest.json`, scope: 'all' });
      }
    }
    const behaviors = join(dir, 'content/behaviors');
    let files: string[];
    try {
      files = readdirSync(behaviors).filter((f) => f.endsWith('.json'));
    } catch {
      files = []; // a bundle with no behaviors folder
    }
    for (const file of files) {
      for (const { text, who } of strings(readJson(join(behaviors, file)))) {
        const suggest = file === 'predictive-intelligence.json' && who !== undefined;
        const scope = TEAM_FILES.has(file) || suggest ? 'all' : 'gendered';
        // A key names the teammate only in the team files: elsewhere "off_duty_alex" holds
        // lines about Alex's mom, so the line starts with no one named.
        out.push({
          line: text,
          at: `${id}/${file}`,
          scope,
          who: scope === 'all' ? who : undefined,
        });
      }
    }
  }
  return out;
}

/** The code that speaks handoffs, introductions and teammates' lines about each other. */
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
  'src/services/coaching/handoff-intelligence.ts',
  'src/services/engagement/team-engagement.ts',
];

/** Every line of every string literal and template piece in a file. */
function literalLines(file: string): Line[] {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const out: Line[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      const row = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      node.text
        .split('\n')
        .forEach((line, i) => out.push({ line, at: `${file}:${row + i}`, scope: 'all' }));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Every line of every .json and .md file under the bundles, raw. */
function bundleFileLines(dir = BUNDLES): Line[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : bundleFileLines(path);
    if (!/\.(json|md)$/.test(e.name)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .map((line, i) => ({
        line,
        at: `${path.slice(BUNDLES.length + 1)}:${i + 1}`,
        scope: 'gendered' as const,
      }));
  });
}

const offending = (lines: Line[], only?: string): string[] =>
  lines
    .filter(({ line }) => !NOT_THE_TEAMMATE.has(line.trim()))
    .map((l) => ({ ...l, bad: misgendered(l.line, l.scope, l.who) }))
    .map((l) => ({ ...l, bad: only ? l.bad.filter((b) => b.name === only) : l.bad }))
    .filter(({ bad }) => bad.length > 0)
    .map(({ line, at, bad }) => `${at}: [${bad.map((b) => b.word).join(',')}] ${line.trim()}`);

describe('teammate pronouns', () => {
  it('flags a pronoun that disagrees with persona-pronouns.ts, for every teammate', () => {
    expect(wrongPronouns("Let me get Alex - they're amazing at this.")).toEqual(['they']);
    expect(wrongPronouns("Let me get Alex. He's amazing at this.")).toEqual([]);
    expect(wrongPronouns("Let me get Alex. She's scary efficient.")).toEqual(['she']);
    expect(wrongPronouns('Jordan is going to LOVE this! Let me bring them in.')).toEqual(['them']);
    expect(wrongPronouns("This is Jordan's wheelhouse. Planning is her thing.")).toEqual([]);
    expect(wrongPronouns("Maya's perfect for this. He won't judge.")).toEqual(['he']);
    expect(wrongPronouns('Let me get Ferni back. She will wrap up.')).toEqual(['she']);
    expect(wrongPronouns('"Let me bring Ferni in, she knows where everyone can help."')).toEqual([
      'she',
    ]);
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

  it('checks each pronoun against the nearer of two names', () => {
    expect(
      wrongPronouns(
        'Jordan flagged some deadlines. Alex could help get things scheduled, want me to bring them in?'
      )
    ).toEqual(['them']);
    expect(
      wrongPronouns('Jordan flagged some deadlines. Alex could help, want me to bring him in?')
    ).toEqual([]);
    expect(wrongPronouns("Alex and I balance each other. They're all structure.")).toEqual([
      'they',
    ]);
    expect(wrongPronouns('Maya called. Alex said she was right.')).toEqual(['she']);
  });

  it('starts a line under a teammate key with that teammate named', () => {
    expect(wrongPronouns('She has this plant named Susan.', 'all', 'alex')).toEqual(['she']);
    expect(wrongPronouns('He has this plant named Susan.', 'all', 'alex')).toEqual([]);
    expect(keyName('suggest_jordan')).toBe('jordan');
    expect(keyName('alex-chen')).toBe('alex');
    expect(keyName('proud_moments')).toBeUndefined();
  });

  it('ignores pronouns before a name, for two names, after "someone", and for a quoted name', () => {
    expect(wrongPronouns('Let me bring them in.')).toEqual([]);
    expect(wrongPronouns('Maya and Alex both love this. They will help.')).toEqual([]);
    expect(wrongPronouns('For decisions and how they connect, Nate has wisdom.')).toEqual([]);
    expect(wrongPronouns('Maya helped someone last week. By the end they were laughing.')).toEqual(
      []
    );
    expect(
      wrongPronouns(
        "Six years with Daniel. 'Not everything needs to be optimized, Maya.' He's right."
      )
    ).toEqual([]);
    expect(wrongPronouns("Peter's Red Sox predictions. Doesn't stop him making them.")).toEqual([]);
    expect(wrongPronouns('Saturday is when I call Mom. She asks if I ate.', 'all', 'alex')).toEqual(
      []
    );
    expect(wrongPronouns("Maya called me out. Said 'Alex, slow down.' She was right.")).toEqual([]);
  });

  it('reads past SSML: every wrong line of team-dynamics.ts on main (63651f21b4) is flagged', () => {
    // The 14 lines main called Alex and Jordan "they" in. A tag before a sentence used to
    // hide that sentence's start, so the capital after it ended the name's reach.
    const MAIN_TEAM_DYNAMICS: Array<[number, string, string[]]> = [
      [
        53,
        'I trust Alex completely. <break time="200ms"/>When they handle something, it\'s handled.',
        ['they'],
      ],
      [
        54,
        'Alex will take care of you. <break time="200ms"/>Seriously, they\'re the best.',
        ['they'],
      ],
      [
        63,
        'You want enthusiasm? <break time="200ms"/>Jordan\'s got it. <break time="150ms"/>They genuinely love planning.',
        ['they'],
      ],
      [64, 'Jordan\'s the best. <break time="200ms"/>They\'ll make this fun, I promise.', ['they']],
      [
        85,
        'Jordan\'s got energy! <break time="200ms"/>Planning type. <break time="150ms"/>You\'ll like them.',
        ['them'],
      ],
      [
        105,
        'Jordan\'s energy is contagious. <break time="200ms"/>Planning becomes fun with them.',
        ['them'],
      ],
      [
        119,
        'Alex is SO efficient. <break time="200ms"/>In a good way. <break time="150ms"/>They\'ll handle it.',
        ['they'],
      ],
      [161, 'Alex can help with this! <break time="200ms"/>Let me bring them in.', ['them']],
      [169, 'Jordan is going to LOVE this! <break time="200ms"/>Let me bring them in.', ['them']],
      [
        194,
        'Jordan\'s excited for you! <break time="200ms"/>They told me about your plans.',
        ['they'],
      ],
      [278, 'Alex could handle this. <break time="200ms"/>Want me to bring them in?', ['them']],
      [279, 'Sounds like an Alex question. <break time="200ms"/>Should I get them?', ['them']],
      [
        286,
        'Jordan would love to help with this! <break time="200ms"/>Want me to get them?',
        ['them'],
      ],
      [287, 'Ooh, this is Jordan\'s thing! <break time="200ms"/>Should I bring them in?', ['them']],
    ];
    for (const [row, line, words] of MAIN_TEAM_DYNAMICS) {
      expect(wrongPronouns(line), `team-dynamics.ts:${row}`).toEqual(words);
    }
    expect(wrongPronouns('Jordan\'s excited! <break time="200ms"/>She told me.')).toEqual([]);
    expect(wrongPronouns('Alex? <emphasis level="strong">Yes.</emphasis> She\'s on it.')).toEqual([
      'she',
    ]);
  });

  it('checks only he and she outside the team files: "they" there is the caller', () => {
    expect(wrongPronouns('Alex notices: are they stressed?', 'gendered')).toEqual([]);
    expect(
      wrongPronouns('Alex celebrates through action. Her wins are quick.', 'gendered')
    ).toEqual(['her']);
  });

  it('every intro, team and code line uses the named teammate’s pronouns', () => {
    const lines = [...bundleLines(), ...CODE.flatMap(literalLines)];
    expect(lines.filter((l) => l.scope === 'all').length).toBeGreaterThan(1000);
    expect(lines.filter((l) => l.scope === 'gendered').length).toBeGreaterThan(5000);
    expect(offending(lines)).toEqual([]);
  });

  it('never calls Ferni anything but his pronouns, on any bundle line', () => {
    const lines = bundleFileLines();
    expect(lines.length).toBeGreaterThan(10000);
    expect(offending(lines, 'ferni')).toEqual([]);
  });

  it('keeps each exemption pointing at a line that still exists', () => {
    const all = new Set(
      [...bundleLines(), ...CODE.flatMap(literalLines)].map(({ line }) => line.trim())
    );
    for (const line of NOT_THE_TEAMMATE.keys()) expect(all.has(line), line).toBe(true);
  });
});
