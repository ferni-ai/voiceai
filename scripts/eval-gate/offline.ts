#!/usr/bin/env tsx
/**
 * Eval gate, offline suites: no model, no network, no secrets. Measures the
 * crisis pattern guard on the four labelled crisis sets and session recall on
 * the golden cases, then compares with evals/baselines/offline.json.
 *
 *   pnpm tsx scripts/eval-gate/offline.ts [--json] [--write-baseline]
 *
 * Exits 1 when a metric moves past its band (see gate-lib.ts). The floors in
 * crisis-guard-eval.test.ts stay as absolute limits; this catches a drop that
 * is still above them (the blind floor sits far below today's value).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { detectCrisis, guardPreResponse } from '../../src/agents/safety/crisis-guard.js';
import { CRISIS_CONTEXTUAL } from '../../src/agents/__tests__/fixtures/crisis-contextual.js';
import { CRISIS_HELDOUT } from '../../src/agents/__tests__/fixtures/crisis-heldout.js';
import { CRISIS_RELAY } from '../../src/agents/__tests__/fixtures/crisis-relay.js';
import { CRISIS_TEST_BLIND } from '../../src/agents/__tests__/fixtures/crisis-test-blind.js';
import {
  GOLDEN_CASES,
  recallAt5,
} from '../../src/memory/__tests__/fixtures/memory-recall-golden-cases.js';
import { report } from './gate-lib.js';

interface Labelled {
  text: string;
  label: 'block' | 'crisis' | 'none';
}

/** Recall over risk lines, benign lines flagged, imminent lines blocked. */
export function patternGuard(cases: readonly Labelled[]) {
  const n = { risk: 0, caught: 0, fp: 0, block: 0, blocked: 0 };
  for (const c of cases) {
    const block = guardPreResponse(c.text).shouldBlock;
    const flagged = block || detectCrisis(c.text).isCrisis;
    if (c.label === 'none') n.fp += Number(flagged);
    else {
      n.risk++;
      n.caught += Number(flagged);
      n.block += Number(c.label === 'block');
      n.blocked += Number(c.label === 'block' && block);
    }
  }
  return { recall: n.caught / n.risk, falsePositives: n.fp, blockRecall: n.blocked / n.block };
}

export function measureOffline(): Record<string, number> {
  const out: Record<string, number> = {};
  const sets = {
    heldout: CRISIS_HELDOUT,
    blind: CRISIS_TEST_BLIND,
    contextual: CRISIS_CONTEXTUAL,
    relay: CRISIS_RELAY,
  } as Record<string, readonly Labelled[]>;
  for (const [name, cases] of Object.entries(sets)) {
    const m = patternGuard(cases);
    out[`crisis_guard.${name}.recall`] = m.recall;
    out[`crisis_guard.${name}.false_positives`] = m.falsePositives;
    if (name === 'heldout' || name === 'blind')
      out[`crisis_guard.${name}.block_recall`] = m.blockRecall;
  }
  const scores = GOLDEN_CASES.map(recallAt5);
  out['session_recall.golden.recall_at_5'] = scores.reduce((a, b) => a + b, 0) / scores.length;
  out['session_recall.golden.cases_perfect'] = scores.filter((s) => s >= 1).length;
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const current = measureOffline();
  if (args.includes('--json')) console.log(JSON.stringify(current, null, 2));
  const baseline = fileURLToPath(new URL('../../evals/baselines/offline.json', import.meta.url));
  process.exit(report(baseline, current, args));
}
