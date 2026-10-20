#!/usr/bin/env node
// Coaching-craft scorecard for recorded calls (CRAFT.md §8; COACH-RUBRIC.md).
//
// usage: node scripts/voice-eval/coach-score.mjs [--no-llm] [--out <dir>] [--md <file>] <run.json>...
//
// Each call is split by persona (handoff_complete events), scored on the
// deterministic items (3, 6, 10a, 13, 14, 15) and, unless --no-llm, on the items
// read from the LLM tagger's MITI codes (1, 2, 4, 5, 7, 8, 9, 10, 11). Item 12
// (follow-up on the last commitment) needs the previous call and is not scored.
// Writes <out>/<run>.coach.json per call, prints the per-persona pool as JSON,
// and with --md writes the pooled table as Markdown.
//
// Env: COACH_TAGGER_PROVIDER (default claude; any judge.mjs provider),
// COACH_TAGGER_MODEL, plus judge.mjs's JUDGE_CLAUDE_* and GCP_PROJECT.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  coachTurns,
  deterministicItems,
  handoffsOf,
  poolItems,
  taggedItems,
  talkTime,
  timingOf,
  weightedScore,
} from './coach-rubric.mjs';
import { parseTags, tagCall } from './coach-tagger.mjs';

export function scoreCall(run, tagged = null) {
  const turns = coachTurns(run);
  const handoffs = handoffsOf(run);
  const talk = talkTime(run, handoffs);
  const timing = timingOf(run, handoffs);
  const personas = [
    ...new Set(turns.filter((t) => t.who === 'agent' && !t.greeting).map((t) => t.persona)),
  ];
  return personas.map((persona) => {
    const mine = turns.filter((t) => t.persona === persona);
    const det = deterministicItems(persona, mine, { talk: talk[persona], timing: timing[persona] });
    const praise = det.find((x) => x.item === '10a').value;
    const durationMs = mine.length ? mine[mine.length - 1].t - mine[0].t : 0;
    const llm = tagged
      ? taggedItems(persona, mine, tagged.tags, tagged.call, { durationMs, praise })
      : [];
    const items = [...det, ...llm].sort((a, b) => parseFloat(a.item) - parseFloat(b.item));
    return {
      persona,
      turns: mine.length,
      agentTurns: mine.filter((t) => t.who === 'agent').length,
      items,
      score: weightedScore(items, persona),
    };
  });
}

const fmt = (v) => {
  if (v === null || v === undefined) return '-';
  if (typeof v !== 'object') return String(v);
  return (
    Object.entries(v)
      .filter(([, x]) => x !== null && x !== undefined)
      .map(([k, x]) => `${k} ${x}`)
      .join(', ') || '0'
  );
};

export function markdownTable(pool) {
  const personas = Object.keys(pool);
  const items = [
    ...new Set(personas.flatMap((p) => pool[p].items.map((i) => String(i.item)))),
  ].sort((a, b) => parseFloat(a) - parseFloat(b));
  const head = `| # | item | threshold | ${personas.map((p) => `${p} (${pool[p].calls} calls)`).join(' | ')} |`;
  const rows = items.map((n) => {
    const any = personas.map((p) => pool[p].items.find((i) => String(i.item) === n)).find(Boolean);
    const cells = personas.map((p) => {
      const it = pool[p].items.find((i) => String(i.item) === n);
      return it ? `${it.status} ${it.calls}<br>${it.values.map(fmt).join(' / ')}` : '-';
    });
    return `| ${n} | ${any.name} | ${any.threshold} | ${cells.join(' | ')} |`;
  });
  const score = `| | weighted pass share | | ${personas.map((p) => pool[p].score ?? '-').join(' | ')} |`;
  return [head, `|${'---|'.repeat(personas.length + 3)}`, ...rows, score].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? null : args.splice(i, 2)[1];
  };
  const noLlm = args.includes('--no-llm') && args.splice(args.indexOf('--no-llm'), 1);
  const out = opt('--out') ?? join(dirname(fileURLToPath(import.meta.url)), 'out-coach');
  const md = opt('--md');
  if (!args.length) {
    console.error('usage: coach-score.mjs [--no-llm] [--out <dir>] [--md <file>] <run.json>...');
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const segments = {};
  const tagger = [];
  for (const file of args) {
    const run = JSON.parse(readFileSync(file, 'utf8'));
    let tagged = null;
    if (!noLlm) {
      const turns = coachTurns(run);
      const res = await tagCall(turns, {
        cacheDir: join(out, '.cache'),
        provider: process.env.COACH_TAGGER_PROVIDER ?? 'claude',
      });
      tagged = parseTags(res.reply, turns);
      tagger.push({
        file: basename(file),
        model: res.model,
        ms: res.ms,
        usd: res.usd,
        usage: res.usage,
        cached: res.cached,
        missing: tagged.missing,
        unknownCodes: tagged.unknownCodes,
      });
    }
    const call = {
      file,
      scenario: run.meta?.scenario ?? null,
      env: run.meta?.env ?? null,
      tagged: Boolean(tagged),
      segments: scoreCall(run, tagged),
    };
    writeFileSync(
      join(out, basename(file).replace(/\.json$/, '.coach.json')),
      JSON.stringify(call, null, 2)
    );
    for (const seg of call.segments) (segments[seg.persona] ??= []).push(seg);
  }
  const pool = Object.fromEntries(
    Object.entries(segments).map(([p, segs]) => {
      const items = poolItems(segs);
      return [
        p,
        {
          calls: segs.length,
          agentTurns: segs.reduce((a, s) => a + s.agentTurns, 0),
          score: weightedScore(items, p),
          items,
        },
      ];
    })
  );
  if (md) writeFileSync(md, `${markdownTable(pool)}\n`);
  console.log(JSON.stringify({ tagger, pool }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
