#!/usr/bin/env node
/**
 * Which model-eval suites can a change move? The model job in eval-gate.yml runs
 * a suite only when a changed file is in that suite's import closure or the data
 * it reads (closures measured with an esbuild metafile of each suite's entry,
 * 2026-10-25). The crisis suite is ~1,260 Flash Lite calls a run, nearly all of
 * the gate's Gemini cost, so it should not run for a docs or UI change.
 *
 * Left out on purpose: plumbing in the closures that cannot change a score
 * (logging, the redis cache, circuit-breaker alerting, the flag manifest). The
 * persona suite's closure is most of the app (~4,200 files, esbuild metafile of
 * scripts/persona-eval/bar.ts, 2026-11-11), so it lists only what puts words in
 * the one-turn text path: the persona bundles and code, the prompt loader and
 * turn reminder, the time and recall notes, the model call and the judges.
 * Left out there: session, tool, memory-store and audio plumbing the text path
 * imports but never reads for a reply, the turn-intelligence note (not
 * replayed), and flag defaults (the flags file pins prod's values). The
 * daily scheduled run measures every suite on main and catches anything this
 * list misses, including drift in the hosted model.
 *
 *   <changed paths, one per line> | node scripts/eval-gate/suites.mjs
 *   prints "crisis_classifier,tool_retrieval", or "" when no suite applies.
 *   A line "*" (change set unknown) selects every suite.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Suite names, as the metric prefixes in evals/baselines/model.json, and
 * persona (evals/baselines/persona.json, run by persona.ts).
 */
export const SUITES = ['semantic_recall', 'crisis_classifier', 'tool_retrieval', 'persona'];

/**
 * A change here can move every suite: the gate itself, shared model config, and
 * the files that pick the installed dependencies. Every suite calls Vertex
 * through an SDK from the lockfile, so a model-client bump changes scores
 * without touching a file in any closure. The agent is the root package, so the
 * root package.json is the manifest that counts; a bump in another workspace
 * package also rewrites pnpm-lock.yaml.
 */
const EVERY_SUITE = [
  /^scripts\/eval-gate\//,
  /^evals\/baselines\/model\.json$/,
  /^\.github\/workflows\/eval-gate\.yml$/,
  /^src\/config\/vertex-flag\.ts$/,
  /^pnpm-lock\.yaml$/,
  /^package\.json$/,
  // catalog, overrides and patched dependencies
  /^pnpm-workspace\.yaml$/,
  // registry and resolution settings
  /^\.npmrc$/,
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
  persona: [
    /^src\/personas\//,
    /^src\/agents\/personas\//,
    /^src\/agents\/model-provider\//,
    /^src\/agents\/shared\/(time-context|honest-actions|phone-safe-tools|quick-shortcuts-real-only|third-party-tools|world-now)\.ts$/,
    /^src\/tools\/handoff\/(chief-of-staff-note|locked-handoffs|locked-teammates|team-by-need-note|teammate-names)\.ts$/,
    /^src\/utils\/minor-care\.ts$/,
    // The turn notes and tool holds turn-request.ts and turn-notes-guarded.ts import
    // (suites.test.mjs lists those imports; each is here or in PERSONA_IMPORTS_EXCUSED).
    /^src\/utils\/caller-name\.ts$/,
    /^src\/agents\/voice-agent-entry\/caller-recognition\.ts$/,
    /^src\/services\/identity\/(owner-write-gate|returning-caller)\.ts$/,
    /^src\/services\/games\/call-game-state\.ts$/,
    /^src\/tools\/domains\/communication\/outreach\/outreach-confirm\.ts$/,
    /^src\/intelligence\/world-model\/temporal\/in-call-load\.ts$/,
    /^src\/memory\/recall\/session-recall\.ts$/,
    /^scripts\/persona-eval\/(bar|bar-lib|roster|canon-judge)\.ts$/,
    /^scripts\/persona-eval\/fixtures\/bar-lines\.json$/,
    /^scripts\/first-call-eval\/vertex\.ts$/,
    /^scripts\/lib\/(judge-model|gemini-billing-labels)\.mjs$/,
    /^evals\/(baselines\/persona|persona-flags)\.json$/,
  ],
};

/**
 * Imports of the two turn-note builders (src/agents/personas/turn-request.ts and
 * turn-notes-guarded.ts) that are not in SUITE_PATHS.persona, and why each cannot
 * move a persona score. Anything else they import must be in the path list.
 */
export const PERSONA_IMPORTS_EXCUSED = {
  'src/config/context-packet-flag.ts': 'a flag read (CONTEXT_PACKET); the value comes from the env',
  'src/config/tool-config.ts': 'only staticCoreToolsEnabled, a flag read (TOOL_CORE_STATIC)',
  'src/utils/safe-logger.ts': 'logging; puts nothing in the request',
  'src/agents/multi-agent/turn-intelligence.ts':
    'the turn-intelligence note, which the one-turn bar does not replay',
  'src/agents/shared/turn-receipt-session.ts':
    'noteReminder records the request for a receipt and returns nothing',
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
