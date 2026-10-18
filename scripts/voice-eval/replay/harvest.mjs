#!/usr/bin/env node
// Replay bench, step 1: the moments Ferni got wrong on recorded calls. Each judged call
// (judge.mjs verdicts beside it) gives its judges' worst moments and invented-history notes; each
// becomes a moment: the call up to the caller's line, the bad reply, and why the judges said it
// failed. Claude labels each with one failure kind, once, so the set stays fixed.
//
//   node scripts/voice-eval/replay/harvest.mjs [--out <dir>] <run.json>...
//
// Then make replies the way prod does (step 2, the next-turn generator reads <out>/moments.json):
//   npx tsx scripts/voice-eval/next-turn/generate.ts --out <dir> [--arm <name>]
// and judge them (step 3): node scripts/voice-eval/replay/judge.mjs --out <dir> [--arm <name>]
//
// Call text stays in ~/Documents/voiceai-evidence: never commit moments.json.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

import { turnsOf } from '../humanness.mjs';
import { PROVIDERS, verdictFile } from '../judge.mjs';
import { normalise } from '../next-turn/corpus.mjs';

/** Failure kinds seen in the 2026-10-11 calls (both judges' worst moments). */
export const CATEGORIES = {
  invented:
    'talks as if it already knows a person, pet, event or detail the caller never mentioned, or makes up numbers, times or specifics',
  misheard:
    'gets wrong or ignores a fact the caller just said (a date, what is happening, how they feel)',
  generic: 'a stock line or observation where a friend would ask, help or react to the specifics',
  stale: 'answers an earlier turn instead of what the caller just said',
  thanked: 'accepts thanks or agreement for help it never gave',
  crisis: 'a crisis or safety script nothing in the call called for',
  other: 'none of the above',
};

/** A run's directory (--out, else today's, local date, under voiceai-evidence): it holds call text. */
export const replayDir = (out) =>
  out ??
  join(homedir(), 'Documents/voiceai-evidence/replay', new Date().toLocaleDateString('en-CA'));

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** The agent turn a judge quoted: the turn holding the quote (or its first six words), else the numbered turn. */
export function turnOf(turns, quote, number) {
  const q = normalise(quote ?? '');
  const head = q.split(' ').slice(0, 6).join(' ');
  for (const needle of [q, head].filter(Boolean)) {
    const i = turns.findIndex((t) => t.who === 'agent' && normalise(t.text).includes(needle));
    if (i >= 0) return i;
  }
  const n = (number ?? 0) - 1;
  return turns[n]?.who === 'agent' ? n : -1;
}

/** What one verdict points at: each sample's worst moment and each invented-history note. */
export function failuresOf(verdict) {
  const out = (verdict.samples ?? [])
    .map((s) => s.worstMoment)
    .filter((w) => w?.why)
    .map((w) => ({ quote: w.quote, number: w.turn, why: w.why }));
  for (const note of verdict.inventedHistory ?? []) {
    const m = String(note).match(/^Turn (\d+):\s*(?:['"‘“](.+?)['"’”](?=[\s,.;]|$))?/);
    if (m) out.push({ quote: m[2] ?? '', number: Number(m[1]), why: String(note) });
  }
  return out;
}

/** One moment per bad agent turn in a call, with every judge's reason for it. */
export function momentsOf(file, run, verdicts) {
  const turns = turnsOf(run, { greeting: true });
  const byTurn = new Map();
  for (const v of verdicts)
    for (const f of failuresOf(v)) {
      const i = turnOf(turns, f.quote, f.number);
      if (i < 1) continue; // not found, or the greeting
      const m = byTurn.get(i) ?? {
        id: `${basename(file, '.json')}-t${i + 1}`,
        file,
        context: turns
          .slice(0, i)
          .map((t) => ({ who: t.who === 'agent' ? 'friend' : 'caller', text: t.text })),
        names: { friend: 'Ferni', caller: 'Sam' },
        bad: turns[i].text,
        why: [],
      };
      m.why.push(`${v.provider}: ${f.why}`);
      byTurn.set(i, m);
    }
  return [...byTurn.values()];
}

export const labelPrompt = (m) => `A voice companion called Ferni gave a bad reply on a phone call.

BAD REPLY: ${m.bad}

Reviewers said:
${m.why.map((w) => `- ${w.replace(/^\w+: /, '')}`).join('\n')}

Which ONE kind of failure is it?
${Object.entries(CATEGORIES)
  .map(([k, d]) => `${k}: ${d}`)
  .join('\n')}

Answer JSON only: {"category": "<one of ${Object.keys(CATEGORIES).join(', ')}>"}`;

async function main() {
  const { values, positionals } = parseArgs({
    options: { out: { type: 'string' } },
    allowPositionals: true,
  });
  if (!positionals.length) {
    console.error('usage: harvest.mjs [--out <dir>] <run.json>...');
    process.exit(2);
  }
  const out = replayDir(values.out);
  mkdirSync(out, { recursive: true });
  const file = join(out, 'moments.json');
  const moments = existsSync(file) ? read(file) : [];
  const ids = new Set(moments.map((m) => m.id));
  for (const f of positionals) {
    // Gemini verdicts saved before other judges existed carry no provider field.
    const verdicts = Object.keys(PROVIDERS)
      .filter((p) => existsSync(verdictFile(f, p)))
      .map((p) => ({ ...read(verdictFile(f, p)), provider: p }));
    for (const m of momentsOf(f, read(f), verdicts)) if (!ids.has(m.id)) moments.push(m);
  }
  const project =
    process.env.GCP_PROJECT ??
    execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8' }).trim();
  const ctx = { model: PROVIDERS.claude.model(process.env), project };
  for (const m of moments.filter((x) => !x.category)) {
    const { category } = await PROVIDERS.claude.ask(labelPrompt(m), ctx);
    m.category = category in CATEGORIES ? category : 'other';
    writeFileSync(file, JSON.stringify(moments, null, 1));
  }
  writeFileSync(file, JSON.stringify(moments, null, 1));
  const counts = moments.reduce((c, m) => ({ ...c, [m.category]: (c[m.category] ?? 0) + 1 }), {});
  console.log(`${moments.length} moments in ${file}: ${JSON.stringify(counts)}`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => (console.error(e), process.exit(1)));
