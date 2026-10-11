#!/usr/bin/env node
// Did Ferni bring back what the caller told it in the earlier call?
//
// judge.mjs gives recall one holistic 1-5 score, so a lenient judge can give a
// 4 to a call that names none of the facts. This counts them. A recall
// scenario lists its facts and avoids as comment lines (run.sh skips '#'):
//
//   #@fact interview \bstripe\b|interview
//   #@avoid ex \bex\b|ex-boyfriend
//
// A fact is recalled when one of Ferni's turns (greeting included) matches it
// BEFORE the caller says it: repeating what the caller just said isn't memory.
// An avoid counts as a slip whenever Ferni says it.
//
// usage: recall-facts.mjs <run.json>...   (prints per run, then pooled rates)
import { readFileSync } from 'node:fs';

const SCENARIOS = new URL('./scenarios/', import.meta.url);

/** The #@fact / #@avoid lines of a scenario file. */
export function parseChecks(text) {
  const checks = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^#@(fact|avoid)\s+(\S+)\s+(.+)$/);
    if (m) checks.push({ kind: m[1], id: m[2], re: new RegExp(m[3].trim(), 'i') });
  }
  return checks;
}

/** The call in order, greeting kept: [{ who: 'agent'|'user', text }]. */
function eventsOf(run) {
  return (run.events ?? [])
    .filter((e) => (e.who === 'agent' || e.who === 'user') && typeof e.text === 'string')
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

/** Which facts Ferni recalled unprompted, and which avoids it said. */
export function checkRun(run, checks) {
  const events = eventsOf(run);
  const facts = checks
    .filter((c) => c.kind === 'fact')
    .map((c) => {
      const first = events.find((e) => c.re.test(e.text));
      return { id: c.id, recalled: first?.who === 'agent', quote: first?.who === 'agent' ? first.text : null };
    });
  const slips = checks
    .filter((c) => c.kind === 'avoid')
    .flatMap((c) => events.filter((e) => e.who === 'agent' && c.re.test(e.text)).map((e) => ({ id: c.id, quote: e.text })));
  const recalled = facts.filter((f) => f.recalled).length;
  return { facts, slips, rate: facts.length ? recalled / facts.length : null };
}

/** Per-fact hit rate and the mean per-call recall rate with a 95% interval. */
export function poolRuns(results) {
  const perFact = {};
  for (const r of results)
    for (const f of r.facts) {
      perFact[f.id] ??= { hits: 0, n: 0 };
      perFact[f.id].n += 1;
      if (f.recalled) perFact[f.id].hits += 1;
    }
  const rates = results.map((r) => r.rate).filter((x) => x !== null);
  const n = rates.length;
  const mean = n ? rates.reduce((a, b) => a + b, 0) / n : null;
  const sd = n > 1 ? Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  const half = sd === null ? null : (1.96 * sd) / Math.sqrt(n);
  const round = (x) => (x === null ? null : Math.round(x * 100) / 100);
  return {
    n,
    mean: round(mean),
    lo: half === null ? null : round(Math.max(0, mean - half)),
    hi: half === null ? null : round(Math.min(1, mean + half)),
    perFact,
    slips: results.reduce((a, r) => a + r.slips.length, 0),
  };
}

function scenarioOf(file, run) {
  if (run.meta?.scenario) return run.meta.scenario;
  // out/<scenario>-<label>.json; labels have no dashes in run.sh's examples
  return file.split('/').pop().replace(/\.json$/, '').replace(/-[^-]+(-\d+)?$/, '');
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: recall-facts.mjs <run.json>...');
    process.exit(2);
  }
  const results = [];
  // A glob like out/facts-recall-*.json also picks up the seed call and the
  // score/judge sidecars; only the recall calls themselves are counted.
  for (const f of files.filter((x) => !/\.(seed|score|judge)\.json$/.test(x))) {
    const run = JSON.parse(readFileSync(f, 'utf8'));
    const scenario = scenarioOf(f, run);
    const checks = parseChecks(readFileSync(new URL(`${scenario}.txt`, SCENARIOS), 'utf8'));
    if (!checks.length) {
      console.error(`${f}: scenario ${scenario} has no #@fact lines, skipped`);
      continue;
    }
    const r = checkRun(run, checks);
    results.push(r);
    const hit = r.facts.filter((x) => x.recalled).map((x) => x.id);
    const miss = r.facts.filter((x) => !x.recalled).map((x) => x.id);
    console.log(`${f}\n  recalled ${hit.length}/${r.facts.length}: ${hit.join(', ') || '-'}  missed: ${miss.join(', ') || '-'}`);
    for (const s of r.slips) console.log(`  AVOID SLIP ${s.id}: "${s.quote}"`);
  }
  const p = poolRuns(results);
  const ci = p.lo === null ? '' : ` [${p.lo}, ${p.hi}]`;
  console.log(`\npooled over ${p.n} call(s): recall rate ${p.mean}${ci}, avoid slips ${p.slips}`);
  for (const [id, { hits, n }] of Object.entries(p.perFact)) console.log(`  ${id.padEnd(14)} ${hits}/${n}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
