/**
 * Paired eval for CRISIS_OWN_SCRIPT_NOT_EVIDENCE: the own-script corpus read
 * with the flag off and on, under a prod profile (full-path-profiles.ts).
 * Each row is read through the real turn path (startTurnCrisis) and the
 * classifier alone (startCrisisClassifier, which shares the turn's read).
 *
 *   USE_VERTEX_AI=true GOOGLE_CLOUD_PROJECT=<project> CRISIS_EVAL_REPS=3 \
 *     npx tsx scripts/crisis-eval/own-script-eval.ts > report.md
 *
 * Calls the model; a manual tool, never part of the test suite. The corpus is
 * fictional, so rows are printed with their words.
 */

import { readFileSync } from 'node:fs';
import { startTurnCrisis } from '../../src/agents/processors/turn-processor/turn-crisis.js';
import { guardFromDetection } from '../../src/agents/safety/crisis-guard.js';
import {
  resetCrisisClassifierCache,
  startCrisisClassifier,
} from '../../src/services/safety/crisis-classifier.js';
import { PROFILES } from './full-path-profiles.js';
import { retriedGenerate } from './retried-generate.js';

interface Row {
  kind: 'benign' | 'must';
  script: string;
  earlier: string[];
  latest: string;
}

const corpus = JSON.parse(
  readFileSync('scripts/crisis-eval/own-script-2026-11-03.json', 'utf8')
) as {
  scripts: Record<string, string>;
  benign: { scripts: string[]; earlier: string[][]; latest: string[] };
  must: Array<{ script: string; earlier: string[]; latest: string[] }>;
};

const rows: Row[] = [
  ...corpus.benign.scripts.flatMap((script) =>
    corpus.benign.earlier.flatMap((earlier) =>
      corpus.benign.latest.map((latest) => ({ kind: 'benign' as const, script, earlier, latest }))
    )
  ),
  ...corpus.must.flatMap((m) =>
    m.latest.map((latest) => ({ kind: 'must' as const, ...m, latest }))
  ),
];

// CRISIS_EVAL_SCRIPTS=asked,screen keeps only the rows after those scripts.
const only = process.env.CRISIS_EVAL_SCRIPTS?.split(',');
if (only) rows.splice(0, rows.length, ...rows.filter((r) => only.includes(r.script)));
const REPS = Number(process.env.CRISIS_EVAL_REPS) || 3;
const PROFILE = process.env.CRISIS_SIM_PROFILE || 'prod-2026-11-01';
const { generate, tally } = retriedGenerate();
const ARMS = ['off', 'on'] as const;

/** Whether the turn's guide (or block) and the classifier alone read risk. */
async function readRow(row: Row, env: Record<string, string>, scope: string) {
  const input = { latest: row.latest, earlier: row.earlier, companion: corpus.scripts[row.script] };
  const turn = startTurnCrisis(
    row.latest,
    { recentTranscripts: [...row.earlier, row.latest], lastAgentResponse: input.companion },
    { sessionId: scope, env, generate }
  );
  const run = startCrisisClassifier(input, { pattern: 'none', env, generate, call: scope });
  const [crisis, verdict] = await Promise.all([turn.resolve(), run?.verdict ?? null]);
  const guide = guardFromDetection(crisis).shouldBlock || crisis.isCrisis;
  const classifier = verdict ? verdict.risk !== 'none' : null;
  return { guide, classifier };
}

type Read = Awaited<ReturnType<typeof readRow>>;
const reads = ARMS.map(() => rows.map((): Read[] => []));
for (let rep = 0; rep < REPS; rep++) {
  for (const [a, arm] of ARMS.entries()) {
    resetCrisisClassifierCache();
    const env: Record<string, string> = {
      ...PROFILES[PROFILE],
      CRISIS_CLASSIFIER_TIMEOUT_MS: '10000',
      CRISIS_OWN_SCRIPT_NOT_EVIDENCE: arm,
    };
    for (let i = 0; i < rows.length; i += 20) {
      const batch = rows.slice(i, i + 20);
      const got = await Promise.all(
        batch.map((r, j) => readRow(r, env, `os-${rep}-${a}-${i + j}`))
      );
      got.forEach((g, j) => reads[a][i + j].push(g));
    }
  }
}

const count = (a: number, kind: Row['kind'], key: keyof Read) =>
  rows.reduce(
    (n, r, i) => n + (r.kind === kind ? reads[a][i].filter((x) => x[key] === true).length : 0),
    0
  );
const total = (kind: Row['kind']) => rows.filter((r) => r.kind === kind).length * REPS;
console.log(`profile ${PROFILE}; reps ${REPS}; counts are reads (row x rep)\n`);
console.log('| rows | reads | classifier risk off | on | turn guide off | on |');
console.log('|---|---|---|---|---|---|');
for (const kind of ['benign', 'must'] as const)
  console.log(
    `| ${kind} | ${total(kind)} | ${count(0, kind, 'classifier')} | ${count(1, kind, 'classifier')} | ${count(0, kind, 'guide')} | ${count(1, kind, 'guide')} |`
  );
console.log(
  '\nRows that differ, must-catch rows read lower, or benign rows read as risk with the flag on' +
    ' (classifier risk reads off/on, turn guide off/on):'
);
rows.forEach((r, i) => {
  const c = ARMS.map((_, a) => reads[a][i].filter((x) => x.classifier).length);
  const g = ARMS.map((_, a) => reads[a][i].filter((x) => x.guide).length);
  const lower = r.kind === 'must' && (c[1] < REPS || g[1] < g[0]);
  if (c[0] !== c[1] || g[0] !== g[1] || lower || (r.kind === 'benign' && c[1] > 0))
    console.log(
      `- ${lower ? 'LOWER ' : ''}[${r.kind}] ${r.script} | ${JSON.stringify(r.earlier)} | ${r.latest}: ${c.join('/')}, ${g.join('/')}`
    );
});
const none = ARMS.map((_, a) => reads[a].flat().filter((x) => x.classifier === null).length);
console.log(
  `\nno verdict (off/on): ${none.join('/')}; model calls ${tally.calls}, failures ${tally.failures}`
);
