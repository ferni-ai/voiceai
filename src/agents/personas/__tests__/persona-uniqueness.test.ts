/**
 * Persona uniqueness ratchet (#1430): how many sentences of each persona's
 * prompt are copied, word for word, from another persona's.
 *
 * The 2026-10-15 audit found a shared style layer pasted into every
 * character file, so the teammates read as one author with the names swapped.
 *
 * What is measured: the prompt the real loader builds, loadSystemPrompt
 * (prompt-loader.ts) in PROMPT_MODE=character, as dev and prod run. BASE_ENV
 * matches dev's boot settings; FLAG_SETS takes the union over the two flags
 * that swap persona-owned files (PERSONA_SPARK, PROMPT_HONEST_ACTIONS), so the
 * gate holds whichever way either is set. Sentences found in bundles/shared/*
 * are subtracted: one copy loaded for everyone by design. Only sentences that
 * appear in the persona's own bundle files are kept, so prompt text injected
 * by code (persona .ts builders, withCanonFacts, troubles-talk) is out of
 * scope, and a test fails if any loaded sentence is neither owned nor shared.
 *
 * The metric: a persona's sentences of 10+ words (normalised, deduplicated)
 * that also appear in another persona's measured prompt. Sentences in
 * persona-uniqueness-allowlist.json are shared on purpose and don't count;
 * each entry carries its reason. It holds the crisis rule and its boundary,
 * the no-invented-loss rule, the advice limit, the false action and live-fact
 * claim rules, and the director-note contract.
 *
 * Ratchet: SHARED_PINS holds each persona's shared-sentence count. A rise
 * fails, and so does a pin above the actual count: a PR that removes shared
 * sentences lowers the pin in the same PR. Percentages, 6-gram Jaccard and the
 * voice_agent (full context) prompt are printed for information only.
 * GOAL (the issue's end state): every persona under 5% shared.
 *
 * Handoff lines are not in this prompt. The pool a later slice reworks:
 * team.handoff_phrases (receive, to_coordinator) in each persona.manifest.json,
 * agents/multi-agent/handoff-brief.ts departureLine and family-table.ts
 * familyDeparture, services/team-engagement/banter.ts, and each bundle's
 * content/behaviors/entrances.json. (handoff.entrance_phrases and
 * handoff.exit_phrases in the manifests have no runtime reader.)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadSystemPrompt } from '../prompt-loader.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLES = join(HERE, '../../../personas/bundles');
const ALLOWLIST_FILE = join(HERE, 'persona-uniqueness-allowlist.json');

/** The issue's target: under 5% of a persona's sentences shared. */
const GOAL_PCT = 5;

/** Shared-sentence count per persona, pinned on 2026-11-23. */
const SHARED_PINS: Record<string, number> = {
  'alex-chen': 22,
  ferni: 18,
  'joel-dickson': 9,
  'john-bogle': 9,
  'jordan-taylor': 22,
  'maya-santos': 24,
  'nayan-patel': 21,
  'peter-john': 23,
  seth: 0,
};

const MIN_WORDS = 10;

/**
 * The character-mode prompt as dev runs it (boot EFFECTIVE_SETTINGS, 2026-11-23):
 * slip guard on, code-injected canon facts and troubles talk off, the cascade
 * pipeline (getModelProvider caches it and it decides whether tool guidance loads).
 */
const BASE_ENV: Record<string, string | undefined> = {
  PROMPT_MODE: 'character',
  VOICE_PIPELINE: 'cartesia-cascade',
  FERNI_PERSONA_SLIP_GUARD: 'on',
  PERSONA_CANON_FACTS: undefined,
  TROUBLES_TALK: undefined,
};

/**
 * Two flags swap persona-owned files in or out: PERSONA_SPARK (the spark sheets;
 * off, joel and john have no sheet and load their full prompt) and
 * PROMPT_HONEST_ACTIONS (tool-usage-guidance.honest.md instead of the plain one).
 * A persona's measured text is the union over all four settings, so the gate
 * covers what dev loads today (spark off, honest on) and stays honest when
 * either flag flips, on dev or prod.
 */
const FLAG_SETS: ReadonlyArray<Record<string, string>> = [
  { PERSONA_SPARK: 'off', PROMPT_HONEST_ACTIONS: 'on' },
  { PERSONA_SPARK: 'on', PROMPT_HONEST_ACTIONS: 'on' },
  { PERSONA_SPARK: 'on', PROMPT_HONEST_ACTIONS: 'off' },
  { PERSONA_SPARK: 'off', PROMPT_HONEST_ACTIONS: 'off' },
];

interface AllowEntry {
  sentence: string;
  reason: string;
}

/** Every persona bundle (a folder with a manifest; .templates and shared are not personas). */
function personas(): string[] {
  return readdirSync(BUNDLES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'shared')
    .filter((d) => existsSync(join(BUNDLES, d.name, 'persona.manifest.json')))
    .map((d) => d.name)
    .sort();
}

function jsonStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(jsonStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(jsonStrings);
  return [];
}

/** All text in a folder's .md and .json files (JSON as its string values). */
function folderText(dir: string): string {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    if (entry.name.endsWith('.md')) out.push(readFileSync(path, 'utf8'));
    else if (entry.name.endsWith('.json')) {
      try {
        out.push(jsonStrings(JSON.parse(readFileSync(path, 'utf8'))).join('\n'));
      } catch {
        out.push(readFileSync(path, 'utf8'));
      }
    }
  }
  return out.join('\n\n');
}

/** Markdown to plain segments: one per line or table cell, markup stripped. */
function segments(markdown: string): string[] {
  return markdown
    .replace(/```[a-z]*\n?/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .split(/\n|\|/)
    .map((line) =>
      line
        .replace(/^\s*(#{1,6}|[-*+>]|\d+[.)])\s+/, '')
        .replace(/\*\*|__|`/g, '')
        .trim()
    )
    .filter(Boolean);
}

/** Lower-case, straight quotes, single spaces, no wrapping quotes, brackets or end punctuation. */
function normalise(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^["'(\s*_-]+/, '')
    .replace(/["')\s*_.!?;:,]+$/, '');
}

const wordCount = (s: string): number => s.split(' ').filter((w) => /[a-z0-9]/.test(w)).length;

/** A text's sentences of MIN_WORDS+ words, normalised and deduplicated. */
function sentences(text: string): Set<string> {
  const out = new Set<string>();
  for (const segment of segments(text)) {
    for (const piece of segment.split(/(?<=[.!?])["')”’]?\s+/)) {
      const s = normalise(piece);
      if (wordCount(s) >= MIN_WORDS) out.add(s);
    }
  }
  return out;
}

function ngrams(sents: Iterable<string>, n: number): Set<string> {
  const out = new Set<string>();
  for (const s of sents) {
    const words = s
      .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  const union = a.size + b.size - both;
  return union === 0 ? 0 : both / union;
}

interface Uniqueness {
  persona: string;
  sentences: number;
  shared: number;
  /** shared / sentences, in percent to one decimal (information only). */
  sharePct: number;
  /** Shared sentence count with each other persona. */
  pairs: Record<string, number>;
  /** Highest 6-gram Jaccard against any other persona, in percent. */
  maxJaccard6Pct: number;
}

/** Each persona's measured sentences against every other's. */
function measure(sets: Record<string, Set<string>>, allow: ReadonlySet<string>): Uniqueness[] {
  const all = Object.entries(sets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, set]) => ({ name, set, grams: ngrams(set, 6) }));
  return all.map((me) => {
    const others = all.filter((o) => o.name !== me.name);
    const mine = [...me.set].filter((s) => !allow.has(s));
    const pairs: Record<string, number> = {};
    let shared = 0;
    for (const s of mine) {
      const holders = others.filter((o) => o.set.has(s));
      for (const o of holders) pairs[o.name] = (pairs[o.name] ?? 0) + 1;
      if (holders.length > 0) shared++;
    }
    const maxJ = Math.max(0, ...others.map((o) => jaccard(me.grams, o.grams)));
    return {
      persona: me.name,
      sentences: mine.length,
      shared,
      sharePct: mine.length === 0 ? 0 : Math.round((shared / mine.length) * 1000) / 10,
      pairs,
      maxJaccard6Pct: Math.round(maxJ * 1000) / 10,
    };
  });
}

function table(rows: Uniqueness[], pins = true): string {
  const names = rows.map((r) => r.persona);
  const short = (n: string): string => (n.split('-')[0] ?? n).slice(0, 6);
  const head = ['persona', 'sents', 'shared', ...(pins ? ['pin'] : []), 'share%', 'jac6%'];
  const lines = rows.map((r) => [
    r.persona,
    String(r.sentences),
    String(r.shared),
    ...(pins ? [String(SHARED_PINS[r.persona] ?? '-')] : []),
    r.sharePct.toFixed(1),
    r.maxJaccard6Pct.toFixed(1),
    ...names.map((q) => (q === r.persona ? '.' : String(r.pairs[q] ?? 0))),
  ]);
  const grid = [[...head, ...names.map(short)], ...lines];
  const widths = grid[0]?.map((_, i) => Math.max(...grid.map((l) => (l[i] ?? '').length))) ?? [];
  return grid.map((l) => l.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ')).join('\n');
}

const sharedSentences = sentences(folderText(join(BUNDLES, 'shared')));

/** Loaded sentences that come from the persona's own files and not from shared/. */
function ownedSentences(loaded: string, own: string, shared: ReadonlySet<string>): Set<string> {
  const mine = sentences(own);
  return new Set([...sentences(loaded)].filter((s) => mine.has(s) && !shared.has(s)));
}

/** Why a persona's count breaks the ratchet, or null when it holds. */
function ratchetBreak(persona: string, shared: number, pin: number | undefined): string | null {
  if (pin === undefined) return `${persona} has no pin: add '${persona}': ${shared}`;
  if (shared > pin) return `${persona} shares ${shared} sentences, above its pin ${pin}`;
  if (shared < pin) return `${persona} now shares ${shared}: lower its pin from ${pin}`;
  return null;
}

/** Loaded sentences from neither the persona's own files nor shared/: text the metric can't see. */
function droppedSentences(loaded: string, own: string, shared: ReadonlySet<string>): string[] {
  const mine = sentences(own);
  return [...sentences(loaded)].filter((s) => !mine.has(s) && !shared.has(s));
}

interface Measured {
  sets: Record<string, Set<string>>;
  /** persona -> loaded sentences the owned/shared split could not place. */
  dropped: Record<string, string[]>;
}

/** What the model sees of each persona's own text: loaded, theirs, and not from shared/. */
async function measuredSets(): Promise<Measured> {
  const measured = await Promise.all(
    personas().map(async (p) => {
      const loaded = await loadSystemPrompt(p);
      const own = folderText(join(BUNDLES, p));
      return [
        p,
        ownedSentences(loaded, own, sharedSentences),
        droppedSentences(loaded, own, sharedSentences),
      ] as const;
    })
  );
  return {
    sets: Object.fromEntries(measured.map(([p, set]) => [p, set])),
    dropped: Object.fromEntries(measured.map(([p, , d]) => [p, d])),
  };
}

/** Per persona, the union of its measured sentences under every flag set. */
async function unionOverFlagSets(base: Record<string, string | undefined>): Promise<Measured> {
  const out: Measured = { sets: {}, dropped: {} };
  for (const flags of FLAG_SETS) {
    const tag = Object.entries(flags)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    const restore = withEnv({ ...base, ...flags });
    try {
      const m = await measuredSets();
      for (const [p, set] of Object.entries(m.sets)) {
        out.sets[p] = new Set([...(out.sets[p] ?? []), ...set]);
      }
      for (const [p, d] of Object.entries(m.dropped)) {
        out.dropped[p] = [...(out.dropped[p] ?? []), ...d.map((s) => `[${tag}] ${s}`)];
      }
    } finally {
      restore();
    }
  }
  return out;
}

const allowEntries = JSON.parse(readFileSync(ALLOWLIST_FILE, 'utf8')) as AllowEntry[];
const allow = new Set(allowEntries.map((e) => normalise(e.sentence)));

function withEnv(env: Record<string, string | undefined>): () => void {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const apply = (values: Record<string, string | undefined>): void => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  apply(env);
  return () => apply(saved);
}

describe('persona uniqueness (#1430)', () => {
  let sets: Record<string, Set<string>> = {};
  let dropped: Record<string, string[]> = {};
  let rows: Uniqueness[] = [];
  let fullRows: Uniqueness[] = [];

  beforeAll(async () => {
    const full = await unionOverFlagSets({ ...BASE_ENV, PROMPT_MODE: undefined });
    fullRows = measure(full.sets, allow);
    ({ sets, dropped } = await unionOverFlagSets(BASE_ENV));
    rows = measure(sets, allow);
  }, 120_000);

  afterAll(() => {
    process.stdout.write(
      `\nPersona shared sentences, PROMPT_MODE=character (${MIN_WORDS}+ words; goal < ${GOAL_PCT}%)\n` +
        `columns after jac6%: sentences shared with that persona\n${table(rows)}\n\n` +
        `For information: voice_agent prompt (PROMPT_MODE unset)\n${table(fullRows, false)}\n\n`
    );
  });

  const rowFor = (p: string): Uniqueness => {
    const row = rows.find((r) => r.persona === p);
    if (!row) throw new Error(`no row for ${p}`);
    return row;
  };

  it('measures the loaded prompt of every persona', () => {
    expect(rows.map((r) => r.persona)).toEqual(personas());
    for (const r of rows) expect(r.sentences, r.persona).toBeGreaterThan(0);
  });

  it('places every loaded sentence as owned or shared, so nothing escapes the count', () => {
    // A loader reformat or new code-injected text would otherwise silently undercount.
    for (const p of personas()) expect(dropped[p] ?? [], p).toEqual([]);
  });

  it('pins every persona', () => {
    expect(Object.keys(SHARED_PINS).sort()).toEqual(personas());
  });

  it.each(personas())('%s: shared-sentence count equals its pin', (p) => {
    expect(ratchetBreak(p, rowFor(p).shared, SHARED_PINS[p])).toBeNull();
  });

  it('every allowlist entry has a reason and is shared by two loaded prompts', () => {
    for (const entry of allowEntries) {
      expect(entry.reason.trim().length, entry.sentence).toBeGreaterThan(10);
      const s = normalise(entry.sentence);
      expect(wordCount(s), entry.sentence).toBeGreaterThanOrEqual(MIN_WORDS);
      const holders = Object.values(sets).filter((set) => set.has(s)).length;
      expect(holders, `stale allowlist entry: ${entry.sentence}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('persona uniqueness metric', () => {
  const filler = 'and then one more ordinary clause so this runs past ten words';

  it('counts a sentence two personas share, and only for 10+ words', () => {
    const texts = {
      a: `Only mine and nobody else has this sentence ${filler}. Short shared line.`,
      b: `Something entirely different lives in this file ${filler}. Short shared line.`,
      c: `**Let me hand you back to the team now ${filler}.**`,
      d: `- Let me hand you back to the team now ${filler}!`,
    };
    const rows = measure(
      Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, sentences(v)])),
      new Set()
    );
    expect(rows.map((r) => [r.persona, r.sentences, r.shared])).toEqual([
      ['a', 1, 0],
      ['b', 1, 0],
      ['c', 1, 1],
      ['d', 1, 1],
    ]);
    expect(rows.map((r) => r.pairs)).toEqual([{}, {}, { d: 1 }, { c: 1 }]);
  });

  it("keeps only loaded sentences from the persona's own files, minus shared/", () => {
    const own = `Mine and loaded and nobody shares it ${filler}. Pasted from shared ${filler}.`;
    const loaded = `${own} Injected by code into the prompt ${filler}.`;
    const shared = sentences(`Pasted from shared ${filler}.`);
    expect([...ownedSentences(loaded, own, shared)]).toEqual([
      normalise(`Mine and loaded and nobody shares it ${filler}`),
    ]);
  });

  it('ratchet breaks on a rise, a stale pin and a missing pin', () => {
    expect(ratchetBreak('a', 3, 3)).toBeNull();
    expect(ratchetBreak('a', 4, 3)).toMatch(/above its pin 3/);
    expect(ratchetBreak('a', 2, 3)).toMatch(/lower its pin/);
    expect(ratchetBreak('a', 2, undefined)).toMatch(/no pin/);
  });

  it('does not count an allowlisted sentence', () => {
    const line = sentences(`If you are in danger call for help right away ${filler}.`);
    const rows = measure({ a: line, b: line }, new Set(line));
    expect(rows.map((r) => r.shared)).toEqual([0, 0]);
  });
});
