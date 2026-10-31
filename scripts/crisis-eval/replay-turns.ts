/**
 * Replay caller turns through the real turn crisis path (startTurnCrisis, live
 * classifier, the production Gemini client) under four arms: the agreement
 * gate off/on, crossed with the everyday rules off/on. Each case is read
 * CRISIS_EVAL_REPS times (default 3): the model is not deterministic.
 *
 *   USE_VERTEX_AI=true GOOGLE_CLOUD_PROJECT=<project> \
 *     npx tsx scripts/crisis-eval/replay-turns.ts [turns.jsonl] > report.md
 *
 * The optional JSONL holds real turns kept outside the repo, one per line:
 * {"id", "variants": [{"latest", "earlier", "companion"}]}, all labelled none.
 * A case's variants are read under one call scope, as the reply gate and the
 * turn pipeline read one turn. The repo's labelled sets are always replayed.
 * Output names cases by id or set, never by the caller's words for the JSONL.
 */

import { readFileSync } from 'node:fs';
import { startTurnCrisis } from '../../src/agents/processors/turn-processor/turn-crisis.js';
import { guardFromDetection } from '../../src/agents/safety/crisis-guard.js';
import { resetCrisisClassifierCache } from '../../src/services/safety/crisis-classifier.js';
import { labelledCases, selectedSets, type Case, type Turn } from './labelled-cases.js';
import { retriedGenerate } from './retried-generate.js';

type Level = 'none' | 'soft' | 'guide' | 'block';
const RANK: Record<Level, number> = { none: 0, soft: 1, guide: 2, block: 3 };

const REPS = Number(process.env.CRISIS_EVAL_REPS) || 3;
const { generate, tally } = retriedGenerate();

const cases: Case[] = labelledCases();
if (process.argv[2]) {
  for (const line of readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line) as { id: string; variants: Turn[] };
    cases.push({ id: row.id, set: 'prod', label: 'none', variants: row.variants, private: true });
  }
}

const only = selectedSets();
if (only) cases.splice(0, cases.length, ...cases.filter((c) => only.includes(c.set)));

const ARMS = [
  { name: 'gate off', env: {} },
  { name: 'gate on', env: { CRISIS_AGREEMENT_GATE: 'on' } },
  { name: 'gate off + rules', env: { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' } },
  {
    name: 'gate on + rules',
    env: { CRISIS_AGREEMENT_GATE: 'on', CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' },
  },
];

async function replay(
  c: Case,
  env: Record<string, string | undefined>,
  scope: string
): Promise<Level> {
  const turns = c.variants.map((v) =>
    startTurnCrisis(
      v.latest,
      { recentTranscripts: [...v.earlier, v.latest], lastAgentResponse: v.companion },
      { sessionId: scope, env, generate }
    )
  );
  let worst: Level = 'none';
  for (const t of turns) {
    const [crisis, soft] = await Promise.all([t.resolve(), t.softCheck()]);
    const level: Level = guardFromDetection(crisis).shouldBlock
      ? 'block'
      : crisis.isCrisis
        ? 'guide'
        : soft
          ? 'soft'
          : 'none';
    if (RANK[level] > RANK[worst]) worst = level;
  }
  return worst;
}

// outcomes[arm][case id] = one level per rep
const outcomes = ARMS.map(() => new Map<string, Level[]>());
for (let rep = 0; rep < REPS; rep++) {
  for (const [a, arm] of ARMS.entries()) {
    resetCrisisClassifierCache(); // a rep never reuses another rep's reads
    const env = {
      CRISIS_CLASSIFIER_MODE: 'live',
      CRISIS_CLASSIFIER_TIMEOUT_MS: '10000',
      ...arm.env,
    };
    for (let i = 0; i < cases.length; i += 30) {
      const batch = cases.slice(i, i + 30);
      const levels = await Promise.all(batch.map((c) => replay(c, env, `${rep}-${a}-${c.id}`)));
      batch.forEach((c, j) => outcomes[a].set(c.id, [...(outcomes[a].get(c.id) ?? []), levels[j]]));
    }
  }
}

const escalated = (l: Level) => l === 'guide' || l === 'block';
console.log(`reps: ${REPS}; counts are reads (case x rep)`);
console.log(
  `| set | pos/neg cases | ${ARMS.map((a) => `${a.name}: caught / FA / soft`).join(' | ')} |`
);
for (const set of [...new Set(cases.map((c) => c.set))]) {
  const inSet = cases.filter((c) => c.set === set);
  const cells = ARMS.map((_, a) => {
    let caught = 0,
      fa = 0,
      soft = 0;
    for (const c of inSet)
      for (const l of outcomes[a].get(c.id) ?? []) {
        if (c.label !== 'none' && escalated(l)) caught++;
        if (c.label === 'none' && escalated(l)) fa++;
        if (l === 'soft') soft++;
      }
    return `${caught} / ${fa} / ${soft}`;
  });
  const pos = inSet.filter((c) => c.label !== 'none').length;
  console.log(`| ${set} | ${pos}/${inSet.length - pos} | ${cells.join(' | ')} |`);
}
console.log('\nPositives not escalated in some rep (and block-labelled reads that did not block):');
for (const c of cases.filter((x) => x.label !== 'none')) {
  const misses = ARMS.map(
    (_, a) => (outcomes[a].get(c.id) ?? []).filter((l) => !escalated(l)).length
  );
  const unblocked = ARMS.map(
    (_, a) => (outcomes[a].get(c.id) ?? []).filter((l) => l !== 'block').length
  );
  if (misses.some(Boolean) || (c.label === 'block' && unblocked.some(Boolean)))
    console.log(
      `- ${c.id} [${c.label}] misses ${misses.join('/')}${c.label === 'block' ? `, not block ${unblocked.join('/')}` : ''}${c.private ? '' : `: ${c.variants[0].latest}`}`
    );
}
console.log('\nNegatives escalated in some rep (reads per arm):');
for (const c of cases.filter((x) => x.label === 'none' && !x.private)) {
  const fa = ARMS.map((_, a) => (outcomes[a].get(c.id) ?? []).filter(escalated).length);
  if (fa.some(Boolean)) console.log(`- ${c.id} ${fa.join('/')}: ${c.variants[0].latest}`);
}
console.log('\nPer-case outcomes for the private turns (arm order as above):');
for (const c of cases.filter((x) => x.private))
  console.log(
    `- ${c.id}: ${ARMS.map((_, a) => (outcomes[a].get(c.id) ?? []).join(',')).join(' | ')}`
  );
console.log(`\ntransport failures after retries: ${tally.failures}`);
process.exit(0);
