#!/usr/bin/env node
// Attunement report: per caller state, the baseline arm's numbers, and with
// --arm the paired change (arm - base) on the same frozen scenarios.
//
// usage: node scripts/voice-eval/attunement/report.mjs <base.json> [<arm.json>] [--json]
//
// Reads the rollouts (rollout.ts) and any <rollout>.judge.<provider>.json next
// to them (judge.mjs). Every Ferni reply is one observation; replies in one
// scenario are not independent, so intervals resample whole scenarios
// (judge-stats.mjs: cluster bootstrap with 10+ scenarios, t over scenario means
// below that). Deltas pair the same scenario, sample and turn across arms.
// 95% intervals. An interval that crosses 0 is noise, whatever the mean says.

import { existsSync, readFileSync } from 'node:fs';
import { estimate, intervalAt } from '../judge-stats.mjs';

const PROVIDERS = ['gemini', 'qwen'];
const METRICS = [
  ['gemini', 'judge gemini 1-5'],
  ['qwen', 'judge qwen 1-5'],
  ['fit', 'in band (code)'],
  ['words', 'words/reply'],
  ['lengthRatio', 'len ratio'],
  ['questions', 'questions'],
  ['advice', 'advice'],
  ['selfShare', 'self-share'],
];

function load(file) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  const judged = Object.fromEntries(
    PROVIDERS.map((p) => {
      const f = file.replace(/\.json$/, `.judge.${p}.json`);
      return [p, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}];
    })
  );
  const obs = new Map();
  for (const row of run.rows) {
    const key = `${row.scenario}#${row.sample}`;
    row.turns.forEach((t, i) => {
      const m = t.metrics;
      const o = {
        scenario: row.scenario,
        state: row.state,
        fit: m.fit === null ? null : Number(m.fit),
        words: m.words,
        lengthRatio: m.lengthRatio,
        questions: m.questions,
        advice: Number(m.advice),
        selfShare: Number(m.selfShare),
      };
      for (const p of PROVIDERS) o[p] = judged[p][key]?.[i]?.score ?? null;
      obs.set(`${key}#${i}`, o);
    });
  }
  const shares = run.rows.map((r) => ({
    key: `${r.scenario}#${r.sample}`,
    scenario: r.scenario,
    state: r.state,
    share: share(r.turns),
  }));
  return { arm: run.arm, obs, shares };
}

/** Caller words / all words over one scenario (rollout metrics carry both counts). */
function share(turns) {
  const c = turns.reduce((n, t) => n + t.metrics.callerWords, 0);
  const f = turns.reduce((n, t) => n + t.metrics.words, 0);
  return c + f ? c / (c + f) : 0;
}

function summarize(values, clusters) {
  const keep = values
    .map((v, i) => [v, clusters[i]])
    .filter(([v]) => v !== null && v !== undefined);
  if (keep.length < 2) return null;
  const est = estimate(
    keep.map(([v]) => v),
    keep.map(([, c]) => c)
  );
  const [lo, hi] = intervalAt(est, 0.05);
  return { mean: est.mean, lo, hi, n: keep.length, G: est.G };
}

const fmt = (s, d = 2) =>
  s ? `${s.mean.toFixed(d)} [${s.lo?.toFixed(d) ?? '?'}, ${s.hi?.toFixed(d) ?? '?'}]` : 'n/a';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const [baseFile, armFile] = args.filter((a) => !a.startsWith('--'));
const base = load(baseFile);
const arm = armFile ? load(armFile) : null;
const states = [...new Set([...base.obs.values()].map((o) => o.state))];
const report = { base: base.arm, arm: arm?.arm ?? null, states: {} };

for (const state of [...states, 'all']) {
  const inState = (o) => state === 'all' || o.state === state;
  const rows = [...base.obs.entries()].filter(([, o]) => inState(o));
  const out = { baseline: {}, delta: {} };
  for (const [k] of METRICS)
    out.baseline[k] = summarize(
      rows.map(([, o]) => o[k]),
      rows.map(([, o]) => o.scenario)
    );
  const sh = base.shares.filter(inState);
  out.baseline.callerShare = summarize(
    sh.map((s) => s.share),
    sh.map((s) => s.scenario)
  );
  if (arm) {
    for (const [k] of METRICS) {
      const pairs = rows
        .map(([key, o]) => [o, arm.obs.get(key)])
        .filter(([a, b]) => b && a[k] !== null && b[k] !== null);
      out.delta[k] = summarize(
        pairs.map(([a, b]) => b[k] - a[k]),
        pairs.map(([a]) => a.scenario)
      );
    }
    const armShares = new Map(arm.shares.map((x) => [x.key, x.share]));
    const paired = sh.filter((x) => armShares.has(x.key));
    out.delta.callerShare = summarize(
      paired.map((x) => armShares.get(x.key) - x.share),
      paired.map((x) => x.scenario)
    );
  }
  report.states[state] = out;
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const cols = [...METRICS.map(([k, label]) => [k, label]), ['callerShare', 'caller share']];
  console.log(`baseline: ${report.base}${arm ? `   delta: ${report.arm} - ${report.base}` : ''}`);
  for (const [state, out] of Object.entries(report.states)) {
    console.log(`\n== ${state} (n=${out.baseline.words?.n ?? 0} replies)`);
    for (const [k, label] of cols) {
      const d = arm ? `   delta ${fmt(out.delta[k])}` : '';
      console.log(`  ${label.padEnd(18)} ${fmt(out.baseline[k])}${d}`);
    }
  }
}
