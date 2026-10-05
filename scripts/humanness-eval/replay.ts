/**
 * Replay recorded dev calls through Ferni's live model setup and score the
 * replies for humanness, so a change to what each turn asks for can be
 * compared offline before it goes to dev. Manual tool: calls Vertex AI.
 *
 *   GOOGLE_CLOUD_PROJECT=<p> npx tsx scripts/humanness-eval/replay.ts \
 *     --variant current|shaped [--samples 2] [--out file.json] <eval.json>...
 *
 * Each Ferni turn in a recording becomes one moment: the conversation up to
 * the caller's turn, the character prompt (PROMPT_MODE=character) as the
 * system instruction, and the per-turn reminder for the variant on the last
 * caller message. The model call matches the cascade: gemini-3.5-flash,
 * thinking MINIMAL, temperature 0.8. Context notes, recall and tools are not
 * replayed, so absolute numbers run a little short of live; compare variants.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { TURN_STYLE_REMINDER } from '../../src/agents/personas/turn-style.js';
// @ts-expect-error plain .mjs script, no types
import { computeHumanness } from '../voice-eval/humanness.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    variant: { type: 'string', default: 'current' },
    samples: { type: 'string', default: '1' },
    out: { type: 'string' },
  },
});
const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
  .toString()
  .trim();
const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${MODEL}:generateContent`;

type Turn = { who: 'agent' | 'user'; text: string };
type Run = { userSpeech?: number[][]; events: Array<{ t: number; who: string; text: string }> };

function turnsOf(run: Run): Turn[] {
  const firstUserAt = run.userSpeech?.[0]?.[0] ?? 0;
  const turns: Turn[] = [];
  for (const e of run.events) {
    const who = e.who === 'agent' ? 'agent' : 'user';
    const last = turns[turns.length - 1];
    if (last && last.who === who) last.text = who === 'user' ? e.text : `${last.text} ${e.text}`;
    else if (who === 'user' || e.t > firstUserAt) turns.push({ who, text: e.text });
    // The greeting is left out: a Gemini conversation starts with the user.
  }
  return turns;
}

async function reminderFor(history: Turn[]): Promise<string> {
  if (values.variant === 'current') return TURN_STYLE_REMINDER;
  const { reminderForTurn } = await import('../../src/agents/personas/turn-shape.js');
  const userText = history[history.length - 1]?.text ?? '';
  return reminderForTurn(userText, history.length);
}

async function generate(system: string, history: Turn[], reminder: string): Promise<string> {
  const contents = history.map((t, i) => ({
    role: t.who === 'agent' ? 'model' : 'user',
    parts: [{ text: i === history.length - 1 ? `${t.text}\n\n(${reminder})` : t.text }],
  }));
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    }).catch(() => null);
    if (res?.status === 429 || !res) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
  }
  return '';
}

process.env.PROMPT_MODE = 'character';
const { loadSystemPrompt, loadModelBaseInstructions } =
  await import('../../src/agents/personas/prompt-loader.js');
const persona = await loadSystemPrompt('ferni', 'voice_agent');
const base = await loadModelBaseInstructions();
const system = `${base.trim()}\n\n---\n\n${persona}`;

const moments: Turn[][] = [];
for (const f of positionals) {
  const turns = turnsOf(JSON.parse(readFileSync(f, 'utf8')) as Run);
  turns.forEach((t, i) => {
    if (t.who === 'agent' && i > 0 && turns[i - 1].who === 'user') moments.push(turns.slice(0, i));
  });
}

const samples = Number(values.samples);
const replies: Array<{ caller: string; reply: string }> = [];
const queue = moments.flatMap((m) => Array.from({ length: samples }, () => m));
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      const reply = await generate(system, m, await reminderFor(m));
      if (reply) replies.push({ caller: m[m.length - 1].text, reply });
    }
  })
);

// Score as one synthetic call: caller line, then the reply, per moment.
const events = replies.flatMap((r, i) => [
  { t: 1000 + i * 10, who: 'user', text: r.caller },
  { t: 1001 + i * 10, who: 'agent', text: r.reply },
]);
const metrics = computeHumanness([{ userSpeech: [[0, 1]], events }]);
console.log(
  JSON.stringify(
    { variant: values.variant, moments: moments.length, replies: replies.length, metrics },
    null,
    2
  )
);
if (values.out)
  writeFileSync(values.out, JSON.stringify({ variant: values.variant, metrics, replies }, null, 2));
