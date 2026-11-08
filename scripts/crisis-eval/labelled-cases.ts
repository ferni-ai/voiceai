/**
 * The repo's labelled crisis sets, one caller turn per case, shared by the
 * single-turn replay (replay-turns.ts) and the full-path simulator
 * (full-path-sim.ts). Labels: block or crisis is risk, none is benign.
 */

import { readFileSync } from 'node:fs';
import { CRISIS_CONTEXTUAL } from '../../src/agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../src/agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_TEST_BLIND } from '../../src/agents/__tests__/fixtures/crisis-test-blind.js';
import { CRISIS_TEST_CASES } from '../../src/services/superhuman/validation/crisis-test-cases.js';

export interface Turn {
  latest: string;
  earlier: string[];
  companion?: string;
}

export interface Case {
  id: string;
  set: string;
  label: 'block' | 'crisis' | 'none';
  variants: Turn[];
  private?: boolean;
}

const labelled = (
  set: string,
  rows: Array<{ text: string; label: string; earlier?: string[]; companion?: string }>
): Case[] =>
  rows.map((r, i) => ({
    id: `${set}-${i}`,
    set,
    label: r.label as Case['label'],
    variants: [{ latest: r.text, earlier: r.earlier ?? [], companion: r.companion }],
  }));

const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

/** Every labelled set in the repo (about 291 risk and 201 benign cases). */
export function labelledCases(): Case[] {
  return [
    ...labelled('dev', CRISIS_HELDOUT),
    ...labelled('blind', CRISIS_TEST_BLIND),
    ...labelled('context', CRISIS_CONTEXTUAL),
    ...labelled('redteam', json('scripts/crisis-eval/redteam-2026-10-05.json')),
    ...labelled('gloomy', json('scripts/crisis-eval/gloomy-ferni-2026-10-11.json')),
    // Synthetic: everyday call business (none) and risk next to it (positives).
    ...labelled(
      'everyday',
      json('src/agents/__tests__/fixtures/crisis-everyday-call-2026-10-17.json')
    ),
    ...labelled(
      'bth',
      CRISIS_TEST_CASES.filter((c) => typeof c.expectedResult.shouldDetect === 'boolean').map(
        (c) => ({
          text: c.input,
          label: c.expectedResult.shouldDetect ? 'crisis' : 'none',
        })
      )
    ),
  ];
}

/** CRISIS_EVAL_SETS=a,b keeps only those sets; unset keeps all. */
export function selectedSets(
  env: Record<string, string | undefined> = process.env
): string[] | null {
  return env.CRISIS_EVAL_SETS?.split(',').filter(Boolean) ?? null;
}
