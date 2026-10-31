#!/usr/bin/env node
// Score briefed handoffs (scenarios bh-*): is the teammate a caller is handed to
// already briefed? Reads recorded calls (run.sh output), finds the handoff, and
// scores the teammate's first two turns (their arrival line and their reply to
// the caller's "Hi <name>."):
//   ackReason   names why the caller came, specifically (a detail they gave Ferni)
//   usesFact    uses a detail the caller gave (code: a fact word from the scenario's
//               "# bh:" line appears; judges: any relevant fact)
//   noReAsk     doesn't ask for what was already said, or a generic "what's up"
//   ownVoice    sounds like the teammate, not Ferni (judges only, 1-5)
// Code checks run on every call; JUDGES=gemini,qwen adds model judges (qwen on a
// sample: QWEN_SAMPLE, default 8, it shares the GPU).
//
// usage: node scripts/voice-eval/handoff-brief-score.mjs <label> [<label>...]
//   reads out/bh-*-<label>.json, writes out/handoff-brief-<label>.json and prints
//   a per-arm summary. Env: JUDGES (default "gemini"), JUDGE_MODEL
//   (default flash; pro for Pro), GCP_PROJECT, QWEN_MODEL (qwen3:30b-a3b).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { judgeModel } from '../lib/judge-model.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'out');
const NAMES = {
  'peter-john': 'Peter',
  'maya-santos': 'Maya',
  'alex-chen': 'Alex',
  'jordan-taylor': 'Jordan',
  'nayan-patel': 'Nayan',
  'john-bogle': 'John',
  ferni: 'Ferni',
};
const VOICES = {
  Peter: 'a calm, thoughtful money mentor; steady and plain-spoken',
  Maya: 'an upbeat, encouraging habits coach; practical and kind',
  Alex: 'a crisp, friendly organizer and communicator; efficient and warm',
  Jordan: 'an energetic, celebratory planner; bright and personal',
  Nayan: 'a gentle, reflective guide; unhurried and wise',
  John: 'a plain-spoken, frugal investing elder',
};
// Asking the caller to start over, as a stranger would.
const GENERIC_REASK =
  /\b(what'?s up|what'?s going on|what brings you|how can i help|what can i (do|help) (you )?with|what would you like to (talk|chat)|what'?s on your mind|what do you need|how are you( doing)?\??$|tell me (a bit )?about (yourself|what'?s going on))/i;

function scenarioMeta(n) {
  const text = readFileSync(join(HERE, 'scenarios', `bh-${n}.txt`), 'utf8');
  const line = text.split('\n').find((l) => l.startsWith('# bh: '));
  const callerLines = text
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('@'));
  return { ...JSON.parse(line.slice(6)), callerLines };
}

/** The call around the handoff: who spoke when, and the teammate's first turns. */
export function segment(run, callerLines = []) {
  const agent = run.events.filter((e) => e.who === 'agent');
  const dataOf = (type) => (run.data ?? []).find((d) => d.payload?.type === type);
  const started = dataOf('handoff_started');
  const complete = dataOf('handoff_complete');
  const failed = dataOf('handoff_failed');
  const speech = run.userSpeech; // [start, end] per caller line, in order
  const target = complete?.payload?.target ?? started?.payload?.target ?? null;
  if (!started || !complete) return { ok: false, target, failed: Boolean(failed) };
  const nextCaller = speech.findIndex(([s]) => s > complete.t);
  const until = (i) => (i >= 0 && i < speech.length ? speech[i][0] : Infinity);
  const between = (from, to) => agent.filter((e) => e.t > from && e.t < to).map((e) => e.text);
  // After handoff_started: the outgoing persona's goodbye line, then the teammate's.
  const afterStart = between(started.t, until(nextCaller));
  const t1 = afterStart.slice(1).join(' ');
  const t2 = nextCaller >= 0 ? between(speech[nextCaller][1], until(nextCaller + 1)).join(' ') : '';
  const t3 =
    nextCaller >= 0
      ? between(speech[nextCaller + 1]?.[1] ?? Infinity, until(nextCaller + 2)).join(' ')
      : '';
  // The talk before the handoff, in order: caller lines (one per recorded speech) and agent lines.
  const before = [
    ...speech.flatMap(([s], i) =>
      s < started.t && callerLines[i] ? [{ t: s, who: 'Caller', text: callerLines[i] }] : []
    ),
    ...agent.filter((e) => e.t < started.t).map((e) => ({ t: e.t, who: 'Ferni', text: e.text })),
  ].sort((a, b) => a.t - b.t);
  const callerNext = callerLines[nextCaller] ?? '';
  return { ok: true, target, goodbye: afterStart[0] ?? '', t1, t2, t3, before, callerNext };
}

const hasFact = (text, facts) => facts.some((f) => text.toLowerCase().includes(f.toLowerCase()));

function codeChecks(seg, meta) {
  const first2 = `${seg.t1} ${seg.t2}`;
  return {
    arrivalSpoken: seg.t1.trim().length > 0,
    ackInFirstLine: hasFact(seg.t1, meta.facts),
    usesFact: hasFact(first2, meta.facts),
    noReAsk: !GENERIC_REASK.test(seg.t1) && !GENERIC_REASK.test(seg.t2),
  };
}

function transcript(seg, name) {
  const lines = seg.before.map((l) => `${l.who}: ${l.text}`);
  if (seg.goodbye) lines.push(`Ferni: ${seg.goodbye}`);
  lines.push('--- handoff ---');
  lines.push(`${name} (TURN 1): ${seg.t1 || '(said nothing)'}`);
  lines.push(`Caller: ${seg.callerNext}`, `${name} (TURN 2): ${seg.t2 || '(said nothing)'}`);
  return lines.join('\n');
}

function judgePrompt(seg, meta, name) {
  return `A caller explained something to Ferni, then Ferni handed them to a teammate, ${name} (${VOICES[name] ?? 'a teammate'}). A great handoff is like a friend introducing you to someone already briefed: ${name} knows why you came and what you said, so you never repeat yourself.

Judge ONLY ${name}'s TURN 1 and TURN 2.

${transcript(seg, name)}

Return JSON:
{"ackReason": 0|1|2,   // 2 = names why the caller came, specifically (a detail they gave); 1 = vague nod ("I hear you need help"); 0 = no sign of knowing
 "usesFact": true|false, // uses a specific detail the caller gave Ferni (a name, number, place, situation)
 "reAsks": true|false,   // asks for something the caller already said, or a generic "what's up / how can I help / what's going on"
 "ownVoice": 1-5,        // sounds like ${name} as described, not a generic assistant or Ferni; 3 = fine
 "why": "one sentence"}`;
}

function gcloud(args) {
  return execFileSync('gcloud', args, { encoding: 'utf8' }).trim();
}

async function askGemini(prompt) {
  const project = process.env.GCP_PROJECT || gcloud(['config', 'get-value', 'project']);
  const model = judgeModel();
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gcloud(['auth', 'print-access-token'])}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        maxOutputTokens: 4096,
      },
    }),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(`gemini ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
  return parseJson((body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''));
}

async function askQwen(prompt) {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: process.env.QWEN_MODEL || 'qwen3:30b-a3b',
      messages: [{ role: 'user', content: `${prompt}\n/no_think` }],
      stream: false,
      format: 'json',
      options: { temperature: 0.2 },
    }),
  });
  const body = await res.json();
  return parseJson(body.message?.content ?? '');
}

function parseJson(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error(`no JSON: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(s, e + 1));
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rate = (rows, f) => {
  const xs = rows.map(f).filter((v) => v !== undefined && v !== null);
  return xs.length
    ? `${Math.round((100 * xs.filter(Boolean).length) / xs.length)}% (${xs.filter(Boolean).length}/${xs.length})`
    : '-';
};

async function scoreLabel(label) {
  const judges = (process.env.JUDGES ?? 'gemini').split(',').filter(Boolean);
  const qwenSample = Number(process.env.QWEN_SAMPLE ?? 8);
  const files = readdirSync(OUT)
    .filter((f) => new RegExp(`^bh-\\d+-${label}\\.json$`).test(f))
    .sort();
  const rows = [];
  for (const f of files) {
    const n = f.match(/^bh-(\d+)-/)[1];
    const meta = scenarioMeta(n);
    const run = JSON.parse(readFileSync(join(OUT, f), 'utf8'));
    const seg = segment(run, meta.callerLines);
    const row = { scenario: `bh-${n}`, path: meta.path, expected: meta.to, ...seg };
    if (seg.ok) {
      const name = NAMES[seg.target] ?? seg.target;
      Object.assign(row, { name, code: codeChecks(seg, meta) });
      for (const judge of judges) {
        if (judge === 'qwen' && rows.filter((r) => r.qwen).length >= qwenSample) continue;
        try {
          row[judge] = await (judge === 'qwen' ? askQwen : askGemini)(judgePrompt(seg, meta, name));
        } catch (error) {
          row[judge] = { error: String(error).slice(0, 200) };
        }
      }
    }
    rows.push(row);
    process.stderr.write(
      `${row.scenario} ${seg.ok ? `${row.name}: ${seg.t1.slice(0, 70)}` : 'no handoff'}\n`
    );
  }
  writeFileSync(join(OUT, `handoff-brief-${label}.json`), JSON.stringify(rows, null, 2));
  const ok = rows.filter((r) => r.ok);
  const summary = {
    label,
    calls: rows.length,
    handoffs: ok.length,
    code: {
      arrivalSpoken: rate(ok, (r) => r.code.arrivalSpoken),
      ackInFirstLine: rate(ok, (r) => r.code.ackInFirstLine),
      usesFact: rate(ok, (r) => r.code.usesFact),
      noReAsk: rate(ok, (r) => r.code.noReAsk),
    },
  };
  for (const judge of judges) {
    const j = ok.map((r) => r[judge]).filter((v) => v && !v.error);
    summary[judge] = {
      n: j.length,
      ackSpecific: rate(j, (v) => v.ackReason === 2),
      ackMean: mean(j.map((v) => Number(v.ackReason)))?.toFixed(2),
      usesFact: rate(j, (v) => v.usesFact === true),
      noReAsk: rate(j, (v) => v.reAsks === false),
      ownVoice: mean(j.map((v) => Number(v.ownVoice)))?.toFixed(2),
    };
  }
  return summary;
}

const labels = process.argv.slice(2);
if (labels.length === 0 || !existsSync(OUT)) {
  console.error('usage: handoff-brief-score.mjs <label>...');
  process.exit(2);
}
for (const label of labels) console.log(JSON.stringify(await scoreLabel(label), null, 2));
