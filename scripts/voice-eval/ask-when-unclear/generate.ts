/**
 * Ask-when-unclear eval, step 1: Ferni's reply to each case in
 * fixtures/cases.jsonl, through the per-turn request path a live call uses.
 * Manual tool: calls Vertex AI. Score with score.mjs.
 *
 * The 45 cases come in four groups: garbled (what ink-2 actually wrote on dev,
 * prod and eval calls, 2026-10-10/11: "Still still on there.", "That's
 * trading?"), ambiguous requests ("call her" with a mom and a sister on the
 * call), clear controls where asking would be needless, and corrections ("No,
 * I said Tuesday."). Each case's `src` says whether its line is ink's or
 * written; the calls around the lines are written, so no real call is stored.
 *
 *   GOOGLE_CLOUD_PROJECT=<p> npx tsx scripts/voice-eval/ask-when-unclear/generate.ts \
 *     --arm off|repair|ask [--samples 3] [--out file.json]
 *
 * Arms set the flags before any turn is built: off (neither), repair
 * (REPAIR_MODE=on), ask (REPAIR_MODE=on ASK_WHEN_UNCLEAR=on). Each case
 * becomes a ChatContext (character prompt, the call so far, the caller's
 * words as ink transcribed them) that goes through withTurnReminder, the
 * function ferni-agent.ts runs on every request, so the turn style, the
 * director's slot and the repair note are the ones a call would carry. The
 * model call matches the cascade: gemini-3.5-flash, thinking MINIMAL,
 * temperature 0.8, with stand-ins for the always-on tools these cases reach
 * for (same names, string arguments; a tool call is recorded as the reply,
 * "[quickCall contact=Priya]", and judged as acting). Not replayed: memory and
 * the per-turn context packet.
 *
 * Writes { arm, flags, replies: [{ id, group, sample, reminder, reply }] }.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { llm } from '@livekit/agents';

const ARMS: Record<string, Record<string, string>> = {
  off: { REPAIR_MODE: 'off', ASK_WHEN_UNCLEAR: 'off' },
  repair: { REPAIR_MODE: 'on', ASK_WHEN_UNCLEAR: 'off' },
  ask: { REPAIR_MODE: 'on', ASK_WHEN_UNCLEAR: 'on' },
};

const { values } = parseArgs({
  options: {
    arm: { type: 'string', default: 'off' },
    samples: { type: 'string', default: '3' },
    out: { type: 'string' },
  },
});
const flags = ARMS[values.arm ?? ''];
if (!flags) throw new Error(`--arm must be one of ${Object.keys(ARMS).join(', ')}`);
Object.assign(process.env, flags, { PROMPT_MODE: 'character' });

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
  .toString()
  .trim();
const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${MODEL}:generateContent`;

export interface Case {
  id: string;
  group: 'garbled' | 'ambiguous' | 'clear' | 'repair';
  history: Array<['caller' | 'ferni', string]>;
  said: string;
  expect: 'ask' | 'either' | 'answer' | 'repair';
  likely?: string;
  fix?: string;
  wrong?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const cases: Case[] = readFileSync(join(here, 'fixtures', 'cases.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Case);

// Imported after the flags are set: some modules read them at load.
const { withTurnReminder } = await import('../../../src/agents/personas/turn-request.js');
const { loadSystemPrompt, loadModelBaseInstructions } =
  await import('../../../src/agents/personas/prompt-loader.js');
const system = `${(await loadModelBaseInstructions()).trim()}\n\n---\n\n${await loadSystemPrompt('ferni', 'voice_agent')}`;

/**
 * A fresh call per request (per-call state such as REPAIR_MODE's corrections
 * must not leak between cases), for a caller whose name and family come from
 * the profile, as on a call.
 */
const sessionFor = (): object => ({
  userData: {
    userName: 'Sam',
    services: {
      sessionId: 'voice-eval-ask-when-unclear',
      userProfile: {
        name: 'Sam',
        familyMembers: [{ name: 'Priya' }, { name: 'Nadia' }, { name: 'Jordan' }],
      },
    },
  },
});

/** The request a call would send for this case: the context after withTurnReminder. */
function requestFor(c: Case): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: system });
  for (const [who, text] of c.history)
    ctx.addMessage({ role: who === 'ferni' ? 'assistant' : 'user', content: text });
  ctx.addMessage({ role: 'user', content: c.said });
  return withTurnReminder(ctx, sessionFor());
}

/** Stand-ins for essential tools (tool-config.ts) a case might call; only the decision is judged. */
const TOOLS: Record<string, string[]> = {
  playMusic: ['query'],
  getWeather: ['location'],
  searchWeb: ['query'],
  setReminder: ['text', 'when'],
  addTask: ['text'],
  createCalendarEvent: ['title', 'when'],
  quickCall: ['contact'],
  quickText: ['contact', 'message'],
  quickEmail: ['to', 'subject', 'body'],
};
const functionDeclarations = Object.entries(TOOLS).map(([name, args]) => ({
  name,
  description: name.replace(/([A-Z])/g, ' $1').toLowerCase(),
  parameters: {
    type: 'OBJECT',
    properties: Object.fromEntries(args.map((a) => [a, { type: 'STRING' }])),
  },
}));

/** The ChatContext as Gemini contents: system turns become the instruction. */
function geminiBody(ctx: llm.ChatContext): string {
  const systemText: string[] = [];
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const item of ctx.items) {
    if (item.type !== 'message') continue;
    const text = item.content.filter((p) => typeof p === 'string').join('');
    if (item.role === 'system' || item.role === 'developer') systemText.push(text);
    else contents.push({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text }] });
  }
  // A Gemini conversation starts with the user, as replay.ts does with the greeting.
  while (contents[0]?.role === 'model') contents.shift();
  return JSON.stringify({
    systemInstruction: { parts: [{ text: systemText.join('\n\n') }] },
    contents,
    tools: [{ functionDeclarations }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });
}

async function generate(body: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } };
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Part[] } }> };
    const said = (json.candidates?.[0]?.content?.parts ?? []).map((p) =>
      p.functionCall
        ? `[${p.functionCall.name} ${Object.entries(p.functionCall.args ?? {})
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' ')}]`
        : (p.text ?? '')
    );
    const reply = said.join(' ').trim();
    if (reply) return reply;
  }
  return '';
}

/** The reminder withTurnReminder appended to the caller's words (diagnostics only). */
function reminderOf(ctx: llm.ChatContext): string {
  const last = [...ctx.items].reverse().find((i) => i.type === 'message' && i.role === 'user');
  const parts = last?.type === 'message' ? last.content.filter((p) => typeof p === 'string') : [];
  return parts.length > 1 ? String(parts[parts.length - 1]).trim() : '';
}

const samples = Number(values.samples);
const jobs = cases.flatMap((c) => Array.from({ length: samples }, (_, sample) => ({ c, sample })));
const replies: Array<Record<string, unknown>> = [];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const ctx = requestFor(job.c);
      const reply = await generate(geminiBody(ctx));
      replies.push({
        id: job.c.id,
        group: job.c.group,
        sample: job.sample,
        reminder: reminderOf(ctx),
        reply,
      });
    }
  })
);
replies.sort(
  (a, b) => String(a.id).localeCompare(String(b.id)) || Number(a.sample) - Number(b.sample)
);
const out = values.out ?? join(here, `out-${values.arm}.json`);
writeFileSync(out, JSON.stringify({ arm: values.arm, flags, model: MODEL, replies }, null, 2));
console.log(
  `${replies.length} replies (${replies.filter((r) => !r.reply).length} empty) -> ${out}`
);
process.exit(0); // the persona modules leave timers open
