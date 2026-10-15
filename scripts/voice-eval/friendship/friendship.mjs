#!/usr/bin/env node
// Friendship across calls: does Ferni act like a friend who remembers, over a
// series of calls with the same caller? (#1510)
//
// A series is one seed call followed by recall calls, in order, recorded with
// converse.mjs like play-bit-seed / play-bit-recall. Per-call judges (judge.mjs)
// cannot see a joke that comes back three calls later, so this counts across
// the series. The anchor is the same as judge.mjs: 3 = a good friend. It is
// not "better than any friend": a metric that needs a 5 to be good is not one
// we can trust (judge.mjs:9-21).
//
// A scenario lists its checks as comment lines (run.sh skips '#'):
//
//   #@fact bit:mastermind \bmastermind\b|treat cabinet
//   #@fact ans:plant-name \bfern\b
//   #@avoid life:wife-coffee \byour wife\b.*\b(tea|cocoa)\b
//   #@avoid decoy:dog \bbeagle\b
//   #@ask help:plant-name \bwhat (should|would) (we|i) (name|call)\b|any ideas
//
// fact   Ferni brings back something the caller told him earlier. It counts
//        only in the recall calls (after the seed) and only when Ferni says it
//        before the caller does, so repeating the caller's words isn't memory.
//        An id prefix names the kind: bit:, ans: (the caller's answer, used
//        later) or any other shared history.
// avoid  Ferni says something he must never say: a decoy the caller never
//        mentioned, or a life detail that contradicts canon. life: ids count as
//        contradictions, the rest as fabricated callbacks.
// ask    Ferni asks the caller for something (help, a take, a name).
//
// usage: friendship.mjs [--json] --scenario <name> <seed.json> <recall.json>...
//   The first run is the seed; calls are scored in the order given.
import { readFileSync } from 'node:fs';
import { LAUGHTER } from '../humanness.mjs';

const SCENARIOS = new URL('./scenarios/', import.meta.url);

/** The anchor the rubric is scored against (judge.mjs ANCHOR, 3 = good friend). */
export const ANCHOR = '3 = a good friend on a casual phone call; 5 = better than most friends, never a machine trick';

/**
 * Gates. A friendship that fabricates history or contradicts canon is not
 * friendship, so those two are zero. Asking for help is a mutuality signal,
 * but a friend who asks every call is a chore: at most one call in five.
 */
export const TARGETS = {
  fabricated: { max: 0 },
  lifeContradictions: { max: 0 },
  askRate: { max: 0.2 },
};

const KINDS = ['fact', 'avoid', 'ask'];

/** The #@fact / #@avoid / #@ask lines of a scenario file. */
export function parseChecks(text) {
  const checks = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^#@(fact|avoid|ask)\s+(\S+)\s+(.+)$/);
    if (m && KINDS.includes(m[1])) checks.push({ kind: m[1], id: m[2], re: new RegExp(m[3].trim(), 'i') });
  }
  return checks;
}

/** The call in order, greeting kept: [{ who: 'agent'|'user', text, t }]. */
function eventsOf(run) {
  return (run.events ?? [])
    .filter((e) => (e.who === 'agent' || e.who === 'user') && typeof e.text === 'string')
    .sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
}

/** One call's checks: which facts Ferni brought back, avoids he said, asks he made, laughs. */
export function scoreCall(run, checks) {
  const events = eventsOf(run);
  const agentLine = (re) => events.find((e) => e.who === 'agent' && re.test(e.text));
  const firstMatch = (re) => events.find((e) => re.test(e.text));
  const facts = checks
    .filter((c) => c.kind === 'fact')
    .map((c) => {
      const first = firstMatch(c.re);
      const recalled = first?.who === 'agent';
      return { id: c.id, recalled, quote: recalled ? first.text : null };
    });
  const avoids = checks
    .filter((c) => c.kind === 'avoid')
    .flatMap((c) => events.filter((e) => e.who === 'agent' && c.re.test(e.text)).map((e) => ({ id: c.id, quote: e.text })));
  const asks = checks
    .filter((c) => c.kind === 'ask')
    .map((c) => ({ id: c.id, asked: Boolean(agentLine(c.re)) }))
    .filter((a) => a.asked);
  const laughs = events.filter((e) => e.who === 'agent' && LAUGHTER.test(e.text)).length;
  return { facts, avoids, asks, laughs };
}

const round = (x) => (x === null ? null : Math.round(x * 100) / 100);
const rate = (hits, n) => (n ? round(hits / n) : null);

/**
 * Metrics across a series. calls[0] is the seed and is not scored for facts
 * (the bit is born there); it is scored for asks, avoids and laughs like the rest.
 */
export function scoreSeries(runs, checks) {
  const scored = runs.map((run, i) => ({ index: i, seed: i === 0, ...scoreCall(run, checks) }));
  const recallCalls = scored.filter((c) => !c.seed);
  const n = recallCalls.length;
  const perFact = {};
  for (const c of recallCalls)
    for (const f of c.facts) {
      perFact[f.id] ??= { hits: 0, n: 0 };
      perFact[f.id].n += 1;
      if (f.recalled) perFact[f.id].hits += 1;
    }
  const sumOf = (prefix) =>
    Object.entries(perFact).filter(([id]) => id.startsWith(prefix));
  const factHits = (entries) => entries.reduce((a, [, v]) => a + v.hits, 0);
  const factN = (entries) => entries.reduce((a, [, v]) => a + v.n, 0);
  const bits = sumOf('bit:');
  const answers = sumOf('ans:');
  const allFacts = Object.entries(perFact);
  const avoids = scored.flatMap((c) => c.avoids);
  const asks = scored.flatMap((c) => c.asks);
  const callsWithAsk = scored.filter((c) => c.asks.length > 0).length;
  const metrics = {
    calls: scored.length,
    recallCalls: n,
    callbacksPerCall: n ? round(recallCalls.reduce((a, c) => a + c.facts.filter((f) => f.recalled).length, 0) / n) : null,
    factRecall: rate(factHits(allFacts), factN(allFacts)),
    jokeRecall: rate(factHits(bits), factN(bits)),
    answerReuse: rate(factHits(answers), factN(answers)),
    fabricated: avoids.filter((a) => !a.id.startsWith('life:')).length,
    lifeContradictions: avoids.filter((a) => a.id.startsWith('life:')).length,
    asksPerCall: scored.length ? round(asks.length / scored.length) : null,
    askRate: scored.length ? round(callsWithAsk / scored.length) : null,
    laughsPerCall: scored.length ? round(scored.reduce((a, c) => a + c.laughs, 0) / scored.length) : null,
  };
  const gates = Object.fromEntries(
    Object.entries(TARGETS).map(([k, t]) => {
      const v = metrics[k];
      const ok = v !== null && (t.max === undefined || v <= t.max) && (t.min === undefined || v >= t.min);
      return [k, { value: v, ...t, ok }];
    })
  );
  return { anchor: ANCHOR, metrics, gates, perFact, perCall: scored.map(({ index, seed, facts, avoids: av, asks: as, laughs }) => ({ index, seed, facts, avoids: av, asks: as, laughs })) };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const sIdx = args.indexOf('--scenario');
  const scenario = sIdx >= 0 ? args[sIdx + 1] : null;
  const files = args.filter((a, i) => a !== '--json' && a !== '--scenario' && i !== sIdx + 1);
  if (!scenario || files.length < 2) {
    console.error('usage: friendship.mjs [--json] --scenario <name> <seed.json> <recall.json>...');
    process.exit(2);
  }
  const checks = parseChecks(readFileSync(new URL(`${scenario}.txt`, SCENARIOS), 'utf8'));
  if (!checks.some((c) => c.kind === 'fact')) {
    console.error(`scenario ${scenario} has no #@fact lines`);
    process.exit(2);
  }
  const runs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const result = scoreSeries(runs, checks);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const c of result.perCall) {
    const hit = c.facts.filter((f) => f.recalled).map((f) => f.id);
    console.log(`call ${c.index}${c.seed ? ' (seed)' : ''}: recalled ${hit.join(', ') || '-'}; asks ${c.asks.map((a) => a.id).join(', ') || '-'}; laughs ${c.laughs}`);
    for (const a of c.avoids) console.log(`  AVOID ${a.id}: "${a.quote}"`);
  }
  console.log(`\nanchor: ${result.anchor}`);
  for (const [k, g] of Object.entries(result.gates)) console.log(`  ${k.padEnd(18)} ${g.value ?? '-'}  ${g.ok ? 'ok' : 'FAIL'}`);
  for (const [k, v] of Object.entries(result.metrics)) if (!(k in result.gates)) console.log(`  ${k.padEnd(18)} ${v ?? '-'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
