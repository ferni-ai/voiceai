#!/usr/bin/env node
/**
 * Which model-eval suites can a change move? The model job in eval-gate.yml runs
 * a suite only when a changed file is in that suite's import closure or the data
 * it reads (closures measured with an esbuild metafile of each suite's entry,
 * 2026-10-25). The crisis suite is ~1,260 Flash Lite calls a run, nearly all of
 * the gate's Gemini cost, so it should not run for a docs or UI change.
 *
 * Left out on purpose: plumbing in the closures that cannot change a score
 * (logging, the redis cache, circuit-breaker alerting, the flag manifest) and
 * the lockfile. The daily scheduled run measures every suite on main and
 * catches anything this list misses, including drift in the hosted model.
 *
 *   <changed paths, one per line> | node scripts/eval-gate/suites.mjs
 *   prints "crisis_classifier,tool_retrieval", or "" when no suite applies.
 *   A line "*" (change set unknown) selects every suite.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Suite names, as the metric prefixes in evals/baselines/model.json. */
export const SUITES = ['semantic_recall', 'crisis_classifier', 'tool_retrieval'];

/** A change here can move every suite: the gate itself and shared model config. */
const EVERY_SUITE = [
  /^scripts\/eval-gate\//,
  /^evals\/baselines\/model\.json$/,
  /^\.github\/workflows\/eval-gate\.yml$/,
  /^src\/config\/vertex-flag\.ts$/,
];

export const SUITE_PATHS = {
  semantic_recall: [
    /^src\/memory\/vectors\//,
    /^src\/memory\/recall\//,
    /^scripts\/memory-eval\//,
    /^src\/utils\/embedding-api-error\.ts$/,
  ],
  crisis_classifier: [
    /^src\/services\/safety\//,
    /^src\/agents\/__tests__\/fixtures\/crisis-/,
    // Not imported by the classifier, but it is the crisis lane and changes
    // rarely (3 PRs in the week to 10-25), so measure rather than argue.
    /^src\/agents\/safety\//,
    /^src\/config\/(gemini-config|model-provider-config|realtime-model|thinking-defaults)\.ts$/,
    /^src\/utils\/(text-utils|phrase-match|safety-whole-word)\.ts$/,
  ],
  tool_retrieval: [
    /^src\/tools\/retrieval\//,
    /^src\/tools\/semantic-router\//,
    /^scripts\/tool-retrieval\/router-examples\.ts$/,
  ],
};

/** The suites a change to `files` can move, in SUITES order. */
export function suitesFor(files) {
  const any = (patterns) => files.some((f) => patterns.some((re) => re.test(f)));
  if (files.includes('*') || any(EVERY_SUITE)) return [...SUITES];
  return SUITES.filter((s) => any(SUITE_PATHS[s]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = readFileSync(0, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  console.log(suitesFor(files).join(','));
}
