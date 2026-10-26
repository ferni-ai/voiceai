#!/usr/bin/env node
// Judge attunement rollouts (rollout.ts): for every Ferni reply, "did this
// reply meet the caller where they are?" 1-5, with a one-line reason.
//
// usage: node scripts/voice-eval/attunement/judge.mjs [--provider gemini|qwen] [--sample n]
//          [--only state,...] <rollout.json>...
//
// --sample and --only narrow what is judged: qwen takes 1-3 min a row locally
// (QWEN_PARALLEL, default 1, requests at a time).
//
// gemini: JUDGE_MODEL (default flash; pro for Pro) on Vertex, GCP_PROJECT or
//         GOOGLE_CLOUD_PROJECT. Same family as Ferni's model, so never alone.
// qwen:   qwen3:30b-a3b on local Ollama (OLLAMA_URL, default localhost:11434),
//         /api/chat with think on and the JSON shape constrained. Not qwen2.5:
//         it is not a valid judge here (kappa 0.27 against Gemini, 2026-10-11).
//
// The judge sees the whole scenario (the caller's turns and Ferni's replies) and
// is not told the caller's state: reading it is part of the job. Writes
// <rollout>.judge.<provider>.json: { "<scenario>#<sample>": [{ score, why }] }.
// Already-judged rows are kept, so a stopped run resumes.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { judgeModel } from '../../lib/judge-model.mjs';

const RUBRIC = `You are judging a voice AI called Ferni, who is meant to talk like a close friend on the phone. Score each of Ferni's replies on ONE question: did this reply meet the caller where they are?

A good friend reads the room from what the caller says and how they say it, and fits the reply to it:
- tired, quiet, giving short answers: shorter replies, gentle and unhurried, at most one easy question, no advice or life lessons, no long stories of his own; leave them room.
- excited, good news: match and amplify their energy about that specific thing; a curious question about it is welcome.
- venting or frustrated: stay with them, reflect the specific thing; no advice or fixing unless they ask for it.
- sad or low: gentle and present, specific to what they said; no silver linings, advice or stories of his own.
- playful: play along, quick and light.
- distracted or multitasking: short and easy to half-hear; don't demand answers.
- in a hurry: brief, get to the point, let them go.
- neutral: a natural, friendly reply of sensible length.
When they ask Ferni something directly, answering it is right, but still sized to their energy.

Score 1-5 per reply:
5 = exactly what a perceptive good friend would do in this moment (length, energy, questions, restraint).
4 = fits, with a small miss.
3 = acceptable but generic or somewhat off in length or energy.
2 = clearly mismatched (lectures, talks over them, too long for a quiet caller, flat to big news, advice nobody asked for).
1 = badly mismatched; it would make the caller feel unheard.

Reply with JSON only: {"replies":[{"n":1,"score":<1-5>,"why":"<under 20 words>"}, ...]} with one entry per Ferni reply, in order.`;

function promptFor(row) {
  const lines = [];
  row.turns.forEach((t, i) => {
    lines.push(`CALLER: ${t.caller}`);
    lines.push(`FERNI [reply ${i + 1}]: ${String(t.reply).replace(/<[^>]+>/g, '')}`);
  });
  return `${RUBRIC}\n\nTHE CALL:\n${lines.join('\n')}`;
}

const SCHEMA = {
  type: 'object',
  properties: {
    replies: {
      type: 'array',
      items: {
        type: 'object',
        properties: { n: { type: 'integer' }, score: { type: 'integer' }, why: { type: 'string' } },
        required: ['n', 'score', 'why'],
      },
    },
  },
  required: ['replies'],
};

let token = '';
let tokenAt = 0;
async function askGemini(prompt) {
  if (Date.now() - tokenAt > 30 * 60_000) {
    token = execFileSync('gcloud', ['auth', 'print-access-token']).toString().trim();
    tokenAt = Date.now();
  }
  const project = process.env.GCP_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  const model = judgeModel();
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    }),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(`gemini ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
  return JSON.parse((body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''));
}

async function askQwen(prompt) {
  const url = `${process.env.OLLAMA_URL ?? 'http://localhost:11434'}/api/chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3:30b-a3b',
      messages: [{ role: 'user', content: prompt }],
      think: true,
      stream: false,
      format: SCHEMA,
      options: { temperature: 0.2, num_ctx: 8192 },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`qwen ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return JSON.parse(body.message?.content ?? '');
}

const ASK = { gemini: askGemini, qwen: askQwen };

async function judgeRow(ask, row) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { replies } = await ask(promptFor(row));
      const scores = row.turns.map((_, i) => replies.find((r) => r.n === i + 1) ?? replies[i]);
      if (scores.every((s) => s && s.score >= 1 && s.score <= 5))
        return scores.map((s) => ({ score: s.score, why: s.why }));
    } catch (error) {
      if (attempt === 3)
        console.error(`  ${row.scenario}#${row.sample}: ${String(error).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return null;
}

const args = process.argv.slice(2);
const at = args.indexOf('--provider');
const provider = at >= 0 ? args.splice(at, 2)[1] : 'gemini';
if (!ASK[provider]) throw new Error(`unknown provider ${provider}`);
const sat = args.indexOf('--sample');
const onlySample = sat >= 0 ? Number(args.splice(sat, 2)[1]) : null;
const oat = args.indexOf('--only');
const onlyStates = oat >= 0 ? args.splice(oat, 2)[1].split(',') : null;
const parallel = provider === 'qwen' ? Number(process.env.QWEN_PARALLEL ?? 1) : 6;

for (const file of args) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  const out = file.replace(/\.json$/, `.judge.${provider}.json`);
  const verdicts = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
  const queue = run.rows.filter(
    (r) =>
      !verdicts[`${r.scenario}#${r.sample}`] &&
      (onlySample === null || r.sample === onlySample) &&
      (!onlyStates || onlyStates.includes(r.state))
  );
  console.error(`${file}: ${queue.length} rows to judge with ${provider}`);
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        const scores = await judgeRow(ASK[provider], row);
        if (scores) verdicts[`${row.scenario}#${row.sample}`] = scores;
        writeFileSync(out, JSON.stringify(verdicts, null, 1));
        process.stderr.write('.');
      }
    })
  );
  console.error(`\n-> ${out}`);
}
