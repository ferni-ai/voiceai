#!/usr/bin/env node
// Compare two or more flag arms from their calls' TURN_RECEIPT lines: the
// latency of each step, the share of the prompt Gemini served from its cache,
// and which turn detector ended each turn. Built for the dev A/Bs on
// LLM_CONTEXT_CACHE (#1505) and TURN_DETECTOR (#1632), and for any arm set
// whose calls write receipts.
//
// Per metric and arm: p50 and p90 over turns, turns and calls. Per later arm,
// the change in p50 and p90 against the first arm, with a 95% interval from a
// bootstrap that resamples whole calls (turns in one call are not independent).
// Seeded, so a rerun prints the same numbers. Receipts hold timings, counts and
// enums only, so nothing here prints what anyone said.
//
// usage: ab-receipts.mjs --arm off=RM_a,RM_b --arm on=RM_c,RM_d
//          [--file entries.json] [--project johnb-2025] [--freshness 7d] [--json]
//   --file: a saved `gcloud logging read --format=json` holding every arm's calls.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { rng } from './judge-stats.mjs';
import { logFilter, receiptsFrom } from './receipts.mjs';

/** What each arm is measured on. `pick` returns a number, or null when the turn has none. */
export const METRICS = [
  { name: 'eouDelayMs', pick: (r) => r.timing?.eouDelayMs },
  { name: 'llmTtftMs', pick: (r) => r.timing?.llmTtftMs },
  { name: 'llmReadyMs', pick: (r) => r.timing?.llmReadyMs },
  { name: 'firstAudioMs', pick: (r) => r.timing?.firstAudioMs },
  {
    name: 'cachedPct',
    pick: (r) => (r.tokens?.prompt ? (100 * (r.tokens.promptCached ?? 0)) / r.tokens.prompt : null),
  },
  { name: 'pauseHoldMs', pick: (r) => r.pauseHoldMs },
  // Tool turns (turn-receipt-tool-timing.ts, 2026-10-25): null on receipts written before.
  {
    name: 'toolFirstAudioMs',
    pick: (r) => (r.tools?.called?.length ? r.timing?.firstAudioMs : null),
  },
  { name: 'answerAudioMs', pick: (r) => r.audio?.answerAudioMs },
  { name: 'ackClipMs', pick: (r) => r.audio?.ackClipMs },
  {
    name: 'llmRequests',
    pick: (r) => r.timing?.requests?.filter((q) => !q.cancelled).length ?? null,
  },
  { name: 'toolExecMs', pick: (r) => sumOrNull(Object.values(r.tools?.execMs ?? {})) },
];

/** The sum of a turn's numbers, or null when it has none. */
export function sumOrNull(xs) {
  return xs.length ? xs.reduce((n, x) => n + x, 0) : null;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** The q-quantile of numbers (linear interpolation), or null for none. */
export function quantile(xs, q) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}

/** One metric's values grouped by call: [[v, ...], ...], calls with no value dropped. */
export function byCall(receipts, pick) {
  const calls = new Map();
  for (const r of receipts) {
    const v = pick(r);
    if (!isNum(v)) continue;
    if (!calls.has(r.sessionId)) calls.set(r.sessionId, []);
    calls.get(r.sessionId).push(v);
  }
  return [...calls.values()];
}

/** p50/p90 of an arm, from its calls' values. */
export function summary(calls) {
  const all = calls.flat();
  return { n: all.length, calls: calls.length, p50: quantile(all, 0.5), p90: quantile(all, 0.9) };
}

/**
 * The change in the q-quantile from arm A to arm B, with a 95% interval from a
 * bootstrap that resamples whole calls within each arm. Null when either arm
 * has fewer than 2 calls (no interval can be drawn).
 */
export function quantileDiff(callsA, callsB, q, { B = 2000, seed = 1 } = {}) {
  if (callsA.length < 2 || callsB.length < 2) return null;
  const point = quantile(callsB.flat(), q) - quantile(callsA.flat(), q);
  const r = rng(seed);
  const draw = (calls) => calls.map(() => calls[Math.floor(r() * calls.length)]).flat();
  const diffs = [];
  for (let b = 0; b < B; b++) diffs.push(quantile(draw(callsB), q) - quantile(draw(callsA), q));
  return { diff: point, low: quantile(diffs, 0.025), high: quantile(diffs, 0.975) };
}

/** How often each value of a label appears in an arm, e.g. the turn detector's model. */
export function shares(receipts, label) {
  const counts = {};
  for (const r of receipts) {
    const v = label(r);
    if (v === undefined || v === null) continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

/** The whole comparison: arms is [{ name, receipts }], the first is the baseline. */
export function compare(arms, opts = {}) {
  const [base, ...rest] = arms;
  const metrics = METRICS.map(({ name, pick }) => {
    const baseCalls = byCall(base.receipts, pick);
    return {
      metric: name,
      arms: arms.map((a) => {
        const calls = a === base ? baseCalls : byCall(a.receipts, pick);
        const s = summary(calls);
        if (a === base) return { arm: a.name, ...s };
        return {
          arm: a.name,
          ...s,
          vsBase: {
            p50: quantileDiff(baseCalls, calls, 0.5, opts),
            p90: quantileDiff(baseCalls, calls, 0.9, opts),
          },
        };
      }),
    };
  });
  const labels = arms.map((a) => ({
    arm: a.name,
    turns: a.receipts.length,
    turnDetection: shares(a.receipts, (r) => r.turnDetection),
    eotModel: shares(a.receipts, (r) => r.eot?.model),
  }));
  return { baseline: base.name, others: rest.map((a) => a.name), metrics, labels };
}

const fmt = (v) => (v === null || v === undefined ? '-' : String(Math.round(v)));
const signed = (v) => (v > 0 ? `+${Math.round(v)}` : String(Math.round(v)));
const diffText = (d) => (d ? `${signed(d.diff)} [${signed(d.low)}, ${signed(d.high)}]` : '-');

/** A plain-text report of compare()'s result. */
export function report(result) {
  const lines = [];
  for (const m of result.metrics) {
    lines.push(m.metric);
    for (const a of m.arms) {
      const head = `  ${a.arm.padEnd(12)} p50 ${fmt(a.p50).padStart(5)}  p90 ${fmt(a.p90).padStart(5)}  (${a.n} turns, ${a.calls} calls)`;
      lines.push(
        a.vsBase
          ? `${head}  vs ${result.baseline}: p50 ${diffText(a.vsBase.p50)}  p90 ${diffText(a.vsBase.p90)}`
          : head
      );
    }
  }
  for (const l of result.labels) {
    const parts = [`turns ${l.turns}`, `turnDetection ${JSON.stringify(l.turnDetection)}`];
    if (Object.keys(l.eotModel).length) parts.push(`eot model ${JSON.stringify(l.eotModel)}`);
    lines.push(`${l.arm}: ${parts.join('  ')}`);
  }
  return lines.join('\n');
}

/** "--arm name=RM_a,RM_b" values as [{ name, sessions }]. */
export function parseArms(values) {
  const arms = values.map((v) => {
    const eq = v.indexOf('=');
    const name = eq > 0 ? v.slice(0, eq) : '';
    const sessions =
      eq > 0
        ? v
            .slice(eq + 1)
            .split(',')
            .filter(Boolean)
        : [];
    if (!name || sessions.length === 0) throw new Error(`--arm wants name=session,session: ${v}`);
    return { name, sessions };
  });
  if (arms.length < 2) throw new Error('give at least two --arm values; the first is the baseline');
  const seen = new Set();
  for (const s of arms.flatMap((a) => a.sessions)) {
    if (seen.has(s)) throw new Error(`session ${s} is in more than one arm`);
    seen.add(s);
  }
  return arms;
}

function argValues(args, name) {
  const out = [];
  args.forEach((a, i) => {
    if (a === name && args[i + 1]) out.push(args[i + 1]);
  });
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const arms = parseArms(argValues(args, '--arm'));
  const project = argValues(args, '--project')[0] ?? 'johnb-2025';
  const file = argValues(args, '--file')[0];
  const freshness = argValues(args, '--freshness')[0] ?? '7d';
  const fileEntries = file ? JSON.parse(readFileSync(file, 'utf8') || '[]') : null;
  const entriesFor = (session) =>
    fileEntries ??
    JSON.parse(
      execFileSync(
        'gcloud',
        [
          'logging',
          'read',
          logFilter(session, project),
          `--project=${project}`,
          '--format=json',
          `--freshness=${freshness}`,
          '--limit=2000',
        ],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
      ) || '[]'
    );
  const withReceipts = arms.map((a) => ({
    name: a.name,
    receipts: a.sessions.flatMap((s) => receiptsFrom(entriesFor(s), s)),
  }));
  const result = compare(withReceipts);
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : report(result));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
