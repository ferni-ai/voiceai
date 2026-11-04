/**
 * Paired eval for CRISIS_OWN_SCRIPT_NOT_EVIDENCE: the own-script corpus read
 * with the flag off and on, under a prod profile (full-path-profiles.ts).
 * Each row is read through the real turn path (startTurnCrisis) and the
 * classifier alone (startCrisisClassifier, which shares the turn's read).
 * Answer rows (yes, no, a hedge to the script's question) get more reps and
 * must read the same both ways; the report also checks their input is the
 * very object main sends.
 *
 *   USE_VERTEX_AI=true GOOGLE_CLOUD_PROJECT=<project> CRISIS_EVAL_REPS=5 \
 *     CRISIS_EVAL_ANSWER_REPS=20 npx tsx scripts/crisis-eval/own-script-eval.ts > report.md
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
import { inputForRead } from '../../src/services/safety/crisis-own-script.js';
import { PROFILES } from './full-path-profiles.js';
import { retriedGenerate } from './retried-generate.js';

type Kind = 'benign' | 'must' | 'answer' | 'owner';
interface Row {
  kind: Kind;
  script: string;
  earlier: string[];
  latest: string;
}
interface Grid {
  scripts: string[];
  earlier?: string[][];
  latest: string[];
}

const corpus = JSON.parse(
  readFileSync('scripts/crisis-eval/own-script/corpus-2026-11-03.json', 'utf8')
) as {
  scripts: Record<string, string>;
  benign: Grid;
  answers: Grid;
  owner: Grid;
  must: Array<{ script: string; earlier: string[]; latest: string[] }>;
};

const grid = (kind: Kind, g: Grid): Row[] =>
  g.scripts.flatMap((script) =>
    (g.earlier ?? [[]]).flatMap((earlier) =>
      g.latest.map((latest) => ({ kind, script, earlier, latest }))
    )
  );
const rows: Row[] = [
  ...grid('benign', corpus.benign),
  ...corpus.must.flatMap((m) =>
    m.latest.map((latest) => ({ kind: 'must' as const, ...m, latest }))
  ),
  ...grid('answer', corpus.answers),
  ...grid('owner', corpus.owner),
];

const REPS = Number(process.env.CRISIS_EVAL_REPS) || 3;
const ANSWER_REPS = Number(process.env.CRISIS_EVAL_ANSWER_REPS) || REPS;
const repsOf = (r: Row) => (r.kind === 'answer' ? ANSWER_REPS : REPS);
const PROFILE = process.env.CRISIS_SIM_PROFILE || 'prod-2026-11-01';
const { generate, tally } = retriedGenerate();
const ARMS = ['off', 'on'] as const;
const envOf = (arm: string): Record<string, string> => ({
  ...PROFILES[PROFILE],
  CRISIS_CLASSIFIER_TIMEOUT_MS: '10000',
  CRISIS_OWN_SCRIPT_NOT_EVIDENCE: arm,
});
const inputOf = (r: Row) => ({
  latest: r.latest,
  earlier: r.earlier,
  companion: corpus.scripts[r.script],
});

/** Whether the turn's guide (or block) and the classifier alone read risk. */
async function readRow(row: Row, env: Record<string, string>, scope: string) {
  const input = inputOf(row);
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
for (let rep = 0; rep < Math.max(REPS, ANSWER_REPS); rep++) {
  const due = rows.map((r, i) => [r, i] as const).filter(([r]) => rep < repsOf(r));
  for (const [a, arm] of ARMS.entries()) {
    resetCrisisClassifierCache();
    for (let i = 0; i < due.length; i += 20) {
      const batch = due.slice(i, i + 20);
      const got = await Promise.all(
        batch.map(([r, k]) => readRow(r, envOf(arm), `os-${rep}-${a}-${k}`))
      );
      got.forEach((g, j) => reads[a][batch[j][1]].push(g));
    }
  }
}

const hits = (a: number, i: number, key: keyof Read) =>
  reads[a][i].filter((x) => x[key] === true).length;
const count = (a: number, kind: Kind, key: keyof Read) =>
  rows.reduce((n, r, i) => n + (r.kind === kind ? hits(a, i, key) : 0), 0);
const total = (kind: Kind) =>
  rows.filter((r) => r.kind === kind).reduce((n, r) => n + repsOf(r), 0);

console.log(
  `profile ${PROFILE}; reps ${REPS} (answers ${ANSWER_REPS}); counts are reads (row x rep)\n`
);
console.log('| rows | reads | classifier risk off | on | turn guide off | on |');
console.log('|---|---|---|---|---|---|');
for (const kind of ['benign', 'must', 'answer', 'owner'] as const)
  console.log(
    `| ${kind} | ${total(kind)} | ${count(0, kind, 'classifier')} | ${count(1, kind, 'classifier')} | ${count(0, kind, 'guide')} | ${count(1, kind, 'guide')} |`
  );
const answers = rows.filter((r) => r.kind === 'answer');
const changed = answers.filter((r) => {
  const input = inputOf(r);
  return inputForRead(input, envOf('on')) !== input;
});
console.log(
  `\nanswer rows whose input with the flag on is the very object main sends: ${answers.length - changed.length}/${answers.length}` +
    (changed.length
      ? ` (changed: ${changed.map((r) => `${r.script}|${r.latest}`).join(', ')})`
      : '')
);
console.log(
  '\nRows that differ, must-catch rows read lower, benign rows read as risk with the flag on,' +
    ' and every answer and owner row (classifier risk reads off/on, turn guide off/on, of reps):'
);
rows.forEach((r, i) => {
  const c = ARMS.map((_, a) => hits(a, i, 'classifier'));
  const g = ARMS.map((_, a) => hits(a, i, 'guide'));
  const lower = r.kind === 'must' && (c[1] < c[0] || g[1] < g[0]);
  const show = r.kind === 'answer' || r.kind === 'owner' || lower;
  if (show || c[0] !== c[1] || g[0] !== g[1] || (r.kind === 'benign' && c[1] > 0))
    console.log(
      `- ${lower ? 'LOWER ' : ''}[${r.kind}] ${r.script} | ${JSON.stringify(r.earlier)} | ${r.latest}: ${c.join('/')}, ${g.join('/')} of ${repsOf(r)}`
    );
});
const none = ARMS.map((_, a) => reads[a].flat().filter((x) => x.classifier === null).length);
console.log(
  `\nno verdict (off/on): ${none.join('/')}; model calls ${tally.calls}, failures ${tally.failures}`
);
