#!/usr/bin/env node
// Replay bench, step 3: does a new reply repeat the mistake Ferni made at that moment? Each judge
// (Gemini and Claude by default: Ferni's replies come from Gemini, and judges favour their own
// family) sees the call so far, the bad reply with the reasons it failed, and the new reply, and
// says whether the new one makes the same kind of mistake, any other real mistake, and a 1-5
// score. Resumable: <out>/judge.<arm>.<provider>.json is saved after every call.
//
//   node scripts/voice-eval/replay/judge.mjs [--arm <name>] [--out <dir>]    judge one arm's replies
//   node scripts/voice-eval/replay/judge.mjs --report [--out <dir>]          every arm judged so far
//
// Env: JUDGE_PROVIDERS (default gemini,claude), and judge.mjs's model and key variables.
// An arm is a next-turn generate.ts arm: base is prod's prompt; draw base2, base3 for how often prod
// repeats each mistake, then add a fix's flags as an arm there and compare it with base.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { PROVIDERS, providersFrom } from '../judge.mjs';
import { pool } from '../next-turn/models.mjs';
import { CATEGORIES, replayDir } from './harvest.mjs';

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const transcript = (context) =>
  context
    .map((t, i) => `${i + 1}. ${t.who === 'friend' ? 'FERNI' : 'CALLER'}: ${t.text}`)
    .join('\n');

export const replayPrompt = (
  m,
  reply
) => `You are checking a voice companion called Ferni, who should talk like a good friend on the phone. The lines are transcribed speech.

CALL SO FAR:
${transcript(m.context)}

On the real call Ferni said next: "${m.bad}"
That reply failed. Reviewers said:
${m.why.map((w) => `- ${w.replace(/^\w+: /, '')}`).join('\n')}

A NEW reply for the same moment:
"${reply}"

Judge the NEW reply only. Answer JSON only:
{"repeats": <true if it makes the same kind of mistake, false if not>,
 "otherProblem": <a short description of a different real mistake it makes, or null>,
 "score": <1-5: 3 is what a good friend would say, 5 better than any friend could>,
 "why": "<one sentence>"}`;

/** One arm's results: how often each judge, all judges and any judge said it repeats the mistake. */
export function tally(moments, byProvider) {
  const providers = Object.keys(byProvider);
  const judged = moments.filter((m) => providers.every((p) => byProvider[p][m.id]));
  const rate = (xs) => (judged.length ? xs.length / judged.length : null);
  const repeats = (m) => providers.map((p) => byProvider[p][m.id].repeats === true);
  const mean = (p) =>
    judged.reduce((s, m) => s + (byProvider[p][m.id].score ?? 0), 0) / (judged.length || 1);
  const byCategory = {};
  for (const m of judged) {
    const c = (byCategory[m.category ?? 'other'] ??= { n: 0, all: 0 });
    c.n++;
    if (repeats(m).every(Boolean)) c.all++;
  }
  return {
    n: judged.length,
    repeats: Object.fromEntries(
      providers.map((p) => [p, rate(judged.filter((m) => byProvider[p][m.id].repeats === true))])
    ),
    all: rate(judged.filter((m) => repeats(m).every(Boolean))),
    any: rate(judged.filter((m) => repeats(m).some(Boolean))),
    score: Object.fromEntries(providers.map((p) => [p, mean(p)])),
    byCategory,
    ids: judged.map((m) => m.id),
    stuck: new Set(judged.filter((m) => repeats(m).every(Boolean)).map((m) => m.id)),
  };
}

const pct = (x) => (x === null ? '  -' : `${Math.round(x * 100)}%`.padStart(4));

/**
 * Draws of one arm (base, base2, base3) pooled: the mean all-judges repeat rate, and per moment the
 * share of draws where every judge said the mistake came back. One draw against another moves a
 * lot on its own (base vs base3: 6 moments flipped, 2026-10-16), so arms are compared pooled.
 */
export function pooledArms(results) {
  const groups = {};
  for (const [arm, r] of Object.entries(results)) (groups[arm.replace(/\d+$/, '')] ??= []).push(r);
  return Object.fromEntries(
    Object.entries(groups).map(([name, rs]) => {
      const [seen, stuck] = [{}, {}];
      for (const r of rs)
        for (const id of r.ids) {
          seen[id] = (seen[id] ?? 0) + 1;
          stuck[id] = (stuck[id] ?? 0) + (r.stuck.has(id) ? 1 : 0);
        }
      const share = Object.fromEntries(Object.keys(seen).map((id) => [id, stuck[id] / seen[id]]));
      return [
        name,
        { draws: rs.length, all: rs.reduce((s, r) => s + r.all, 0) / rs.length, share },
      ];
    })
  );
}

/** Verdict files per arm: judge.<arm>.<provider>.json. */
export function armsIn(files) {
  const arms = {};
  for (const f of files) {
    const [, arm, provider] = f.match(/^judge\.(.+)\.([a-z]+)\.json$/) ?? [];
    if (arm && PROVIDERS[provider]) (arms[arm] ??= []).push(provider);
  }
  return arms;
}

function report(out, moments) {
  const arms = armsIn(readdirSync(out));
  const results = Object.fromEntries(
    Object.entries(arms).map(([arm, ps]) => [
      arm,
      tally(
        moments,
        Object.fromEntries(ps.map((p) => [p, read(join(out, `judge.${arm}.${p}.json`))]))
      ),
    ])
  );
  console.log(
    `${moments.length} moments; "all" = every judge says the mistake came back, "any" = at least one\n`
  );
  for (const [arm, r] of Object.entries(results)) {
    const each = Object.entries(r.repeats)
      .map(([p, x]) => `${p} ${pct(x)}`)
      .join('  ');
    const score = Object.entries(r.score)
      .map(([p, x]) => `${p} ${x.toFixed(2)}`)
      .join(' ');
    console.log(
      `${arm.padEnd(10)} n=${r.n}  repeats: ${each}  all ${pct(r.all)}  any ${pct(r.any)}  score: ${score}`
    );
    const cats = Object.keys(CATEGORIES).filter((c) => r.byCategory[c]);
    console.log(
      `           ${cats.map((c) => `${c} ${r.byCategory[c].all}/${r.byCategory[c].n}`).join('  ')}`
    );
  }
  const pooled = pooledArms(results);
  console.log("\npooled (an arm's draws averaged; compare arms here, not draw by draw):");
  for (const [name, a] of Object.entries(pooled)) {
    const base = pooled.base;
    const ids =
      base && name !== 'base' ? Object.keys(a.share).filter((id) => id in base.share) : [];
    const lower = ids.filter((id) => a.share[id] < base.share[id]).length;
    const higher = ids.filter((id) => a.share[id] > base.share[id]).length;
    const vs = ids.length ? `  vs base: lower on ${lower} moments, higher on ${higher}` : '';
    console.log(`${name.padEnd(10)} ${a.draws} draw(s)  all ${pct(a.all)}${vs}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, arm: { type: 'string' }, report: { type: 'boolean' } },
  });
  const out = replayDir(values.out);
  const moments = read(join(out, 'moments.json'));
  if (values.report) return report(out, moments);
  const arm = values.arm ?? 'base';
  const replies = read(join(out, arm === 'base' ? 'ferni.json' : `ferni.${arm}.json`));
  const project =
    process.env.GCP_PROJECT ??
    execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8' }).trim();
  for (const provider of providersFrom({
    JUDGE_PROVIDERS: process.env.JUDGE_PROVIDERS ?? 'gemini,claude',
  })) {
    const file = join(out, `judge.${arm}.${provider}.json`);
    const verdicts = existsSync(file) ? read(file) : {};
    const ctx = { model: PROVIDERS[provider].model(process.env), project };
    await pool(
      moments.filter((m) => replies[m.id] && !verdicts[m.id]),
      4,
      async (m) => {
        verdicts[m.id] = {
          ...(await PROVIDERS[provider].ask(replayPrompt(m, replies[m.id].reply), ctx)),
          model: ctx.model,
        };
        writeFileSync(file, JSON.stringify(verdicts, null, 1));
      }
    );
    console.log(`${provider}: ${Object.keys(verdicts).length}/${moments.length} judged in ${file}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => (console.error(e), process.exit(1)));
