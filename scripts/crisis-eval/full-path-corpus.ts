/**
 * The full-path simulator's calls (full-path-sim.ts): the multi-turn corpora in
 * scripts/crisis-eval/corpus/, plus every labelled single-turn case in the repo
 * as a call of one scored turn, its earlier lines and Ferni's line as context.
 *
 * A corpus file: {"set", "description", "calls": [{"id", "shape", "opening"?,
 * "turns": [{"text", "label", "ferni"?}]}]}. `opening` lines are context only;
 * every turn is scored. `ferni` is what Ferni said after that turn, whatever
 * the gate did, for shapes that need a given line on the call (a denial after a
 * 988 line, an answer to a direct safety question). All text is
 * fictional: made-up names, 555-01xx numbers.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { labelledCases, type Case } from './labelled-cases.js';
import type { TurnLabel } from './full-path-summary.js';

export interface SimTurn {
  text: string;
  label: TurnLabel;
  ferni?: string;
}

export interface SimCallSpec {
  id: string;
  set: string;
  shape: string;
  opening: Array<{ who: 'caller' | 'ferni'; text: string }>;
  turns: SimTurn[];
}

/** Ferni's reply when the gate lets the model answer. No word here is on any risk list. */
export const NEUTRAL_REPLIES = [
  'Okay, I hear you. Tell me more about that.',
  'That makes sense. What are you thinking for the rest of the day?',
  'Sure thing, I can help with that. What would you like first?',
  'Got it, thanks for telling me. How did that go?',
] as const;

export const CORPUS_DIR = 'scripts/crisis-eval/corpus';
const LABELS: readonly TurnLabel[] = ['must-catch', 'must-not-alarm', 'either'];

/** Problems with one corpus file's calls; empty when it is well formed. */
export function corpusProblems(calls: readonly SimCallSpec[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of calls) {
    if (!/^[a-z0-9-]+$/.test(c.id))
      problems.push(`${c.id}: id must be lower-case words and digits`);
    if (ids.has(c.id)) problems.push(`${c.id}: duplicate id`);
    ids.add(c.id);
    if (!c.shape) problems.push(`${c.id}: no shape`);
    if (c.turns.length === 0) problems.push(`${c.id}: no turns`);
    for (const t of c.turns) {
      if (!t.text?.trim()) problems.push(`${c.id}: empty turn`);
      if (!LABELS.includes(t.label)) problems.push(`${c.id}: bad label ${String(t.label)}`);
    }
    // Phone numbers only in the fictional 555-01xx range.
    for (const text of [...c.turns.map((t) => t.text), ...c.opening.map((o) => o.text)]) {
      for (const n of text.match(/\d[\d -]{6,}\d/g) ?? []) {
        if (!/^555[ -]?01\d\d$/.test(n.replace(/\s+/g, ' ').trim()))
          problems.push(`${c.id}: number outside 555-01xx: ${n}`);
      }
    }
  }
  return problems;
}

/** Every corpus file in CORPUS_DIR, validated. Throws on a malformed file. */
export function loadCorpora(dir = CORPUS_DIR): SimCallSpec[] {
  const out: SimCallSpec[] = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      set: string;
      calls: Array<Omit<SimCallSpec, 'set' | 'opening'> & { opening?: SimCallSpec['opening'] }>;
    };
    const calls = raw.calls.map((c) => ({ ...c, set: raw.set, opening: c.opening ?? [] }));
    const problems = corpusProblems(calls);
    if (problems.length) throw new Error(`${file}:\n${problems.join('\n')}`);
    out.push(...calls);
  }
  return out;
}

/**
 * A labelled single-turn case as a call: its earlier lines, each answered by a
 * neutral Ferni line (the reply gate reads caller words up to Ferni's last
 * line), Ferni's own line last when the case has one, then the scored turn.
 */
export function callOfCase(c: Case): SimCallSpec {
  const v = c.variants[0];
  const opening: SimCallSpec['opening'] = [];
  v.earlier.forEach((line, i) => {
    opening.push({ who: 'caller', text: line });
    const last = i === v.earlier.length - 1;
    opening.push({
      who: 'ferni',
      text: last && v.companion ? v.companion : NEUTRAL_REPLIES[i % NEUTRAL_REPLIES.length],
    });
  });
  if (v.earlier.length === 0 && v.companion) opening.push({ who: 'ferni', text: v.companion });
  return {
    id: c.id,
    set: c.set,
    shape: `single-${c.label === 'none' ? 'benign' : 'risk'}`,
    opening,
    turns: [{ text: v.latest, label: c.label === 'none' ? 'must-not-alarm' : 'must-catch' }],
  };
}

/** Everything the simulator runs, filtered by CRISIS_EVAL_SETS when set. */
export function allCalls(sets: string[] | null): SimCallSpec[] {
  const calls = [...loadCorpora(), ...labelledCases().map(callOfCase)];
  return sets ? calls.filter((c) => sets.includes(c.set)) : calls;
}
