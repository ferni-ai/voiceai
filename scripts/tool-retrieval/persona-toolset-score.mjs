#!/usr/bin/env node
// Scores the persona toolsets (eval-choice.ts, TOOL_SET=persona) in two parts.
// usage: persona-toolset-score.mjs <dir>
//
// 1. In set, paired: out/choice-inset-<persona>-set.json (the persona's set) against
//    out/choice-inset-<persona>-96.json (the Phase 0 96-tool set, label always in) and
//    out/choice-inset-<persona>-today.json (today's prod set, TOOL_SET=today), all run with
//    TOOL_PERSONA=<persona> EVAL_LABELS=persona: every test request whose label is in the persona's
//    set, with that persona's prompt. Right-or-equivalent, missed, lookalike; paired difference with
//    a request-resampled 95% CI; McNemar.
// 2. Out of set: out/choice-persona-<persona>-r<run>-s<seed>.json, a uniform sample of the test set
//    (as the Phase 0 sweep drew it). A request whose label is registered (the 96-tool baseline,
//    out/choice-count96-r1-s<seed>.json, offered it) but not in the set is the coverage cost: the
//    share the model still served (a tool the judge says serves as well), handed off, left
//    uncalled, or got wrong. False calls on the no-tool negatives come from these files too.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pairedChoice } from './choice-score.mjs';
import { discordant, rates } from './tool-count-sweep.mjs';

const right = (r) => r.final === r.label || r.sufficient === true;
/** The arms a persona set is paired with: the Phase 0 96-tool set, and today's prod set. */
const BASELINES = ['96', 'today'];
const pct = (x) => (100 * x).toFixed(1);
const share = (xs, f) => xs.filter(f).length / Math.max(1, xs.length);
const read = (dir, f, extra) =>
  JSON.parse(readFileSync(join(dir, f), 'utf8')).map((r) => ({ ...r, ...extra }));

/** Uniform-sample rows whose label the baseline offered (registered), split by the persona set. */
export function split(rows, baseline) {
  const registered = new Set(
    baseline.filter((r) => r.label !== null && r.labelSent).map((r) => `${r.seed}|${r.query}`)
  );
  const known = rows.filter(
    (r) => !r.error && r.label !== null && registered.has(`${r.seed}|${r.query}`)
  );
  return { inSet: known.filter((r) => r.labelSent), outOfSet: known.filter((r) => !r.labelSent) };
}

function inSetTable(dir, files) {
  console.log('In set, paired (same requests, 1 run each):\n');
  console.log(
    '| persona | baseline | n | right-or-equiv: set / base | lookalike: set / base | missed: set / base | label offered by base | paired diff [95% CI] | McNemar |'
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const f of files) {
    const m = /^choice-inset-(.+)-set\.json$/.exec(f);
    if (!m) continue;
    const tag = { run: 1, seed: 1 };
    const set = read(dir, f, tag);
    for (const base of BASELINES) {
      const baseFile = `choice-inset-${m[1]}-${base}.json`;
      if (!files.includes(baseFile)) continue;
      // Every request counts at both arms: a label the base never offered is its miss.
      const all = (rows) => rows.map((r) => ({ ...r, labelSent: true }));
      const [a, bRows] = [all(set), all(read(dir, baseFile, tag))];
      const [x, y] = [rates(a), rates(bRows)];
      const p = pairedChoice(a, bRows);
      const d = discordant(a, bRows);
      const offered = share(
        read(dir, baseFile, tag).filter((r) => !r.error),
        (r) => r.labelSent
      );
      console.log(
        `| ${m[1]} | ${base} | ${x.n} | ${pct(x.right)} / ${pct(y.right)} | ` +
          `${pct(x.lookalike)} / ${pct(y.lookalike)} | ${pct(x.missed)} / ${pct(y.missed)} | ${pct(offered)}% | ` +
          `${p ? `${pct(p.diff)} [${pct(p.ci[0])}, ${pct(p.ci[1])}]` : '-'} | b=${d.b} c=${d.c} p=${d.p.toPrecision(2)} |`
      );
    }
  }
}

function outOfSetTable(dir, files) {
  console.log('\nOut of set (uniform sample of the test set):\n');
  console.log(
    '| persona | sampled (registered) | in set | out of set | served | handed off | no call | other tool | false call on negatives |'
  );
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const f of files) {
    const m = /^choice-persona-(.+)-r(\d+)-s(\d+)\.json$/.exec(f);
    if (!m) continue;
    const [run, seed] = [Number(m[2]), Number(m[3])];
    const baseFile = `choice-count96-r1-s${seed}.json`;
    if (!files.includes(baseFile)) continue;
    const rows = read(dir, f, { run, seed });
    const { inSet, outOfSet } = split(rows, read(dir, baseFile, { run: 1, seed }));
    const neg = rates(rows);
    const known = inSet.length + outOfSet.length;
    const handoff = (r) => r.final?.startsWith('handoffTo');
    console.log(
      `| ${m[1]} (s${seed}) | ${known} | ${inSet.length} | ${outOfSet.length} (${pct(outOfSet.length / Math.max(1, known))}%) | ` +
        `${pct(share(outOfSet, right))}% | ${pct(share(outOfSet, handoff))}% | ${pct(share(outOfSet, (r) => !r.final))}% | ` +
        `${pct(share(outOfSet, (r) => r.final && !right(r) && !handoff(r)))}% | ${pct(neg.falseCall)}% of ${neg.negatives} |`
    );
  }
}

function main([dir]) {
  const files = readdirSync(dir).sort();
  inSetTable(dir, files);
  outOfSetTable(dir, files);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
