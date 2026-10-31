/**
 * Full-path crisis simulator: every caller turn of every call through the real
 * per-turn crisis decision (full-path-turn.ts), multi-turn, with Ferni's reply
 * fed back into the call, scoring catches and false alarms on the same run.
 *
 *   HOME=$(mktemp -d) GOOGLE_APPLICATION_CREDENTIALS=<adc.json> \
 *   USE_VERTEX_AI=true GOOGLE_CLOUD_PROJECT=<project> CRISIS_EVAL_REPS=3 \
 *   CRISIS_SIM_PROFILE=prod-2026-10-31 \
 *     npx tsx scripts/crisis-eval/full-path-sim.ts \
 *       --baseline scripts/crisis-eval/baselines/full-path-prod-2026-10-31.json \
 *       --out report.md [--json summary.json] [--write-baseline <file>]
 *
 * Env: CRISIS_SIM_PROFILE (full-path-profiles.ts), CRISIS_SIM_SET overrides,
 * CRISIS_EVAL_REPS (default 3), CRISIS_EVAL_SETS (filter by set),
 * CRISIS_SIM_CONCURRENCY (calls at once, default 8), CRISIS_SIM_CALLER=anon
 * (no recentTranscripts, #2615), CRISIS_SIM_MUTATION (below, to prove the
 * instrument can go red).
 *
 * Exit 1: a must-catch turn caught in fewer reps than in --baseline. Exit 2:
 * inconclusive (model calls failing or empty). False alarms are reported, not
 * gated. Firestore is pointed at a closed local port: nothing reaches a database.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import {
  CRISIS_CLASSIFIER_PROMPT,
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../src/services/safety/crisis-classifier.js';
import { hasRiskContent } from '../../src/services/safety/crisis-agreement.js';
import { resetCrisisCallRisk } from '../../src/services/safety/crisis-call-risk.js';
import { resetCallRiskSnapshots } from '../../src/services/safety/crisis-lone-imminent.js';
import { allCalls, NEUTRAL_REPLIES, type SimCallSpec } from './full-path-corpus.js';
import { resolveProfile } from './full-path-profiles.js';
import { costOf, renderReport } from './full-path-report.js';
import {
  recallRegressions,
  summarise,
  type SimSummary,
  type TurnRecord,
} from './full-path-summary.js';
import { addContext, newCall, simulateTurn } from './full-path-turn.js';
import { selectedSets } from './labelled-cases.js';
import { retriedGenerate } from './retried-generate.js';

// No database, ever: the Firestore client goes to a closed port instead of a real project.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:9';

const TIE_BREAK =
  'When unsure between crisis and none, choose crisis if a trained crisis counselor would want to check in.';
const NONE = '{"risk":"none","subject":"self"}';
let mutationHits = 0;

/**
 * Mutations, to prove the instrument can go red. tiebreak-crisis: the
 * classifier prompt's crisis/none tie-break line says always choose crisis.
 * classifier-crisis: every read the model gives as none comes back crisis
 * (false alarms must rise). classifier-none: every model call reads none
 * (classifier-only catches must be missed). gate-off: the agreement gate off on
 * top of the profile. `hits` counts the calls a prompt mutation changed: a
 * mutation that changed nothing is refused, not reported as a clean run.
 */
function mutate(
  name: string,
  generate: CrisisGenerateFn,
  flags: Record<string, string>
): { generate: CrisisGenerateFn; flags: Record<string, string> } {
  if (!name) return { generate, flags };
  if (name === 'tiebreak-crisis') {
    if (!CRISIS_CLASSIFIER_PROMPT.includes(TIE_BREAK)) throw new Error('tie-break line not found');
    const forced = 'When unsure between crisis and none, always choose crisis.';
    const mutated: CrisisGenerateFn = (p, c, s) => {
      if (p.includes(TIE_BREAK)) mutationHits++;
      return generate(p.replace(TIE_BREAK, forced), c, s);
    };
    return { generate: mutated, flags };
  }
  if (name === 'classifier-crisis') {
    const mutated: CrisisGenerateFn = async (p, c, s) => {
      const reply = await generate(p, c, s);
      if (!/"risk"\s*:\s*"none"/.test(reply)) return reply;
      mutationHits++;
      return reply.replace(/"risk"\s*:\s*"none"/, '"risk":"crisis"');
    };
    return { generate: mutated, flags };
  }
  if (name === 'classifier-none') return { generate: async () => NONE, flags };
  if (name === 'gate-off') return { generate, flags: { ...flags, CRISIS_AGREEMENT_GATE: 'off' } };
  throw new Error(`unknown CRISIS_SIM_MUTATION ${name}`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function pool<T>(items: readonly T[], width: number, work: (t: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  });
  await Promise.all(lanes);
}

async function runCall(
  spec: SimCallSpec,
  rep: number,
  run: { env: Record<string, string>; generate: CrisisGenerateFn; anon: boolean }
): Promise<TurnRecord[]> {
  const call = newCall(`sim-${rep}-${spec.id}`, run.anon);
  for (const line of spec.opening) addContext(call, line.who, line.text);
  const records: TurnRecord[] = [];
  for (const [index, turn] of spec.turns.entries()) {
    const outcome = await simulateTurn(call, turn.text, { ...run, ferni: turn.ferni });
    records.push({
      callId: spec.id,
      set: spec.set,
      shape: spec.shape,
      index,
      turnId: `${spec.id}#${index}`,
      label: turn.label,
      rep,
      ...outcome,
    });
  }
  return records;
}

async function main(): Promise<number> {
  for (const line of NEUTRAL_REPLIES)
    if (hasRiskContent(line)) throw new Error(`neutral reply has risk words: ${line}`);
  const profile = resolveProfile();
  const mutation = process.env.CRISIS_SIM_MUTATION?.trim() ?? '';
  const reps = Number(process.env.CRISIS_EVAL_REPS) || 3;
  const width = Number(process.env.CRISIS_SIM_CONCURRENCY) || 8;
  const anon = process.env.CRISIS_SIM_CALLER === 'anon';
  const { generate: retried, tally } = retriedGenerate();
  const { generate, flags } = mutate(mutation, retried, { ...profile.flags });
  // A 10 s bound, as replay-turns.ts: a slow read must not count as the model's answer.
  const env = { ...flags, CRISIS_CLASSIFIER_TIMEOUT_MS: '10000' };
  // Flags read through process.env (flagOn without an env) see the same profile.
  Object.assign(process.env, env);

  const calls = allCalls(selectedSets());
  const started = Date.now();
  const records: TurnRecord[] = [];
  for (let rep = 0; rep < reps; rep++) {
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    resetCallRiskSnapshots();
    await pool(calls, width, async (spec) => {
      records.push(...(await runCall(spec, rep, { env, generate, anon })));
    });
    process.stderr.write(`rep ${rep + 1}/${reps} done, ${records.length} reads\n`);
  }
  const minutes = (Date.now() - started) / 60000;

  const summary = summarise(records, {
    profile: anon ? `${profile.name} anon` : profile.name,
    mutation,
    reps,
  });
  const baselinePath = arg('--baseline');
  const regressions = baselinePath
    ? recallRegressions(summary, JSON.parse(readFileSync(baselinePath, 'utf8')) as SimSummary)
    : [];
  const text = new Map<string, string>();
  for (const c of calls) c.turns.forEach((t, i) => text.set(`${c.id}#${i}`, t.text));
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
  const report = renderReport(summary, costOf(tally, minutes), {
    commit,
    textOf: (id) => text.get(id),
    regressions: regressions.map(
      (r) =>
        `${r.turnId}: baseline ${r.baseline.join('/')}, now ${r.now.join('/')}: ${text.get(r.turnId) ?? ''}`
    ),
  });
  const alarmed = new Map<string, { n: number; paths: Set<string> }>();
  for (const r of records)
    if (r.label === 'must-not-alarm' && r.activated) {
      const a = alarmed.get(r.turnId) ?? { n: 0, paths: new Set<string>() };
      a.n++;
      r.paths.forEach((p) => a.paths.add(p));
      alarmed.set(r.turnId, a);
    }
  const faLines = [...alarmed.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, a]) => `- ${id} ${a.n}/${reps} [${[...a.paths].join(', ')}]: ${text.get(id) ?? ''}`);
  const full = `${report}\n## Must-not-alarm turns that alarmed\n\n${faLines.join('\n') || 'None.'}\n`;
  const out = arg('--out');
  if (out) writeFileSync(out, full);
  else process.stdout.write(full);
  const jsonPath = arg('--json');
  // Counts only, never words; one [caught, reps] pair per line.
  const asJson =
    JSON.stringify(summary, null, 2).replace(/\[\s+(\d+),\s+(\d+)\s+\]/g, '[$1, $2]') + '\n';
  if (jsonPath) writeFileSync(jsonPath, asJson);
  const baselineOut = arg('--write-baseline');
  if (baselineOut) writeFileSync(baselineOut, asJson);

  const asked = tally.calls + tally.failures;
  if (mutation.startsWith('tiebreak') || mutation === 'classifier-crisis') {
    process.stderr.write(`mutation ${mutation} changed ${mutationHits} model calls\n`);
    if (mutationHits === 0) return 2;
  }
  if (
    mutation !== 'classifier-none' &&
    (asked === 0 || tally.empty / Math.max(1, tally.calls) > 0.01)
  ) {
    process.stderr.write(`INCONCLUSIVE: ${tally.calls} model calls, ${tally.empty} empty\n`);
    return 2;
  }
  if (tally.failures / Math.max(1, asked) > 0.002) {
    process.stderr.write(`INCONCLUSIVE: ${tally.failures} of ${asked} model calls failed\n`);
    return 2;
  }
  if (regressions.length) {
    process.stderr.write(
      `RECALL REGRESSION: ${regressions.length} must-catch turn(s) vs baseline\n`
    );
    return 1;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    );
    process.exit(2);
  }
);
