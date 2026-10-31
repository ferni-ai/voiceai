/**
 * Roll out the frozen honest-friend scenarios through Ferni's live per-turn
 * setup: fixtures/scenarios.json (57, five groups) by default, or
 * fixtures/heldout.json (15, phrased differently). Manual tool: calls Vertex AI.
 *
 *   GOOGLE_CLOUD_PROJECT=<p> npx tsx scripts/voice-eval/honest-friend/rollout.ts \
 *     --arm <label> [--dev] [--set FLAG=value ...] [--samples 2] [--only group,...] \
 *     [--scenarios f.json] [--out f.json]
 *
 * Every request goes through the real withTurnReminder (turn-request.ts): the
 * turn shape and candor lines, FERNI_STATE, told-this-call and, with
 * DIRECTOR_NOTES=on, real director notes written by the director model after
 * each reply, as live. The system instruction is the character prompt
 * (PROMPT_MODE=character) after the base instructions; the model call is the
 * cascade's: gemini-3.5-flash, thinking MINIMAL, temperature 0.8. Context-builder
 * notes, recall and tools are not replayed. --dev sets the reply-shaping flags
 * dev runs with (2026-10-11 call log).
 *
 * Writes { arm, flags, rows: [{ scenario, group, sample, turns: [{ caller,
 * reply, notes, reminder }] }] }; judge.mjs and report.mjs read it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { llm } from '@livekit/agents';

const { values } = parseArgs({
  options: {
    arm: { type: 'string', default: 'arm' },
    dev: { type: 'boolean', default: false },
    set: { type: 'string', multiple: true, default: [] },
    samples: { type: 'string', default: '1' },
    only: { type: 'string' },
    scenarios: { type: 'string' },
    out: { type: 'string' },
  },
});

/** Reply-shaping flags on dev for Seth's 2026-10-11 call (TURN_SHAPE extras, FERNI_STATE, director logs). */
const DEV_FLAGS = {
  CANDOR: 'on',
  ASK_ADVICE: 'on',
  LAUGH_ALONG: 'on',
  DIRECTOR_NOTES: 'on',
  FERNI_STATE: 'on',
};
const flags: Record<string, string> = values.dev ? { ...DEV_FLAGS } : {};
for (const kv of values.set ?? []) {
  const [k, v] = kv.split('=');
  flags[k] = v;
}
Object.assign(process.env, flags, { PROMPT_MODE: 'character' });

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
let token = '';
let tokenAt = 0;
function accessToken(): string {
  if (Date.now() - tokenAt > 30 * 60_000) {
    token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
      .toString()
      .trim();
    tokenAt = Date.now();
  }
  return token;
}

type Content = { role: 'user' | 'model'; parts: Array<{ text: string }> };

async function generate(
  system: string,
  contents: Content[],
  opts: { temperature?: number; max?: number } = {}
): Promise<string> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.8,
      maxOutputTokens: opts.max ?? 400,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  });
  const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${MODEL}:generateContent`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
      body,
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
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

const { loadSystemPrompt, loadModelBaseInstructions } =
  await import('../../../src/agents/personas/prompt-loader.js');
const { withTurnReminder } = await import('../../../src/agents/personas/turn-request.js');
const { Director, setDirector, linesFromChat, directorNotesEnabled } =
  await import('../../../src/agents/personas/director-notes.js');

const system = `${(await loadModelBaseInstructions()).trim()}\n\n---\n\n${await loadSystemPrompt('ferni', 'voice_agent')}`;

/** The request as Vertex contents (the character sheet is the system instruction). */
function contentsOf(ctx: llm.ChatContext): Content[] {
  const out: Content[] = [];
  for (const item of ctx.items) {
    if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue;
    const role = item.role === 'user' ? 'user' : 'model';
    const last = out[out.length - 1];
    if (last?.role === role) last.parts[0].text += `\n${item.textContent ?? ''}`;
    else out.push({ role, parts: [{ text: item.textContent ?? '' }] });
  }
  return out;
}

/** What withTurnReminder appended to the caller's latest words. */
function reminderIn(contents: Content[], said: string): string {
  const text = contents[contents.length - 1]?.parts[0].text ?? '';
  return text.startsWith(said) ? text.slice(said.length).trim() : text;
}

interface Scenario {
  id: string;
  group: string;
  update?: boolean;
  turns: string[];
}

async function rollOut(s: Scenario, sample: number) {
  const sessionId = `voice-eval-honest-${values.arm}-${s.id}-${sample}`;
  const session = {
    userData: { personaId: 'ferni', services: { sessionId, sessionStartTime: Date.now() } },
  };
  const director = new Director({
    sessionId,
    userName: 'Sam',
    writeNotes: directorNotesEnabled(),
    budgetMs: 10_000,
    writer: (sys, prompt) =>
      generate(sys, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.7, max: 120 }),
  });
  setDirector(session, director);
  const ctx = llm.ChatContext.empty();
  const turns = [];
  for (let k = 0; k < s.turns.length; k++) {
    const said = s.turns[k];
    ctx.addMessage({ role: 'user', content: said });
    const notes = [...director.current()];
    const contents = contentsOf(withTurnReminder(ctx, session));
    const reply = await generate(system, contents);
    ctx.addMessage({ role: 'assistant', content: reply || 'Mm.' });
    turns.push({ caller: said, reply, notes, reminder: reminderIn(contents, said) });
    if (k < s.turns.length - 1) await director.observe(linesFromChat(ctx.items));
  }
  return { scenario: s.id, group: s.group, update: Boolean(s.update), sample, turns };
}

const all = (
  JSON.parse(
    readFileSync(values.scenarios ?? new URL('./fixtures/scenarios.json', import.meta.url), 'utf8')
  ) as {
    scenarios: Scenario[];
  }
).scenarios;
const only = values.only?.split(',');
const scenarios = only ? all.filter((s) => only.includes(s.group)) : all;
const jobs = scenarios.flatMap((s) =>
  Array.from({ length: Number(values.samples) }, (_, i) => [s, i] as const)
);
const rows: Array<Awaited<ReturnType<typeof rollOut>>> = [];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      rows.push(await rollOut(job[0], job[1]));
      process.stderr.write('.');
    }
  })
);
rows.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.sample - b.sample);
const out = values.out ?? `scripts/voice-eval/out/honest-friend-${values.arm}.json`;
writeFileSync(out, JSON.stringify({ arm: values.arm, flags, rows }, null, 2));
console.error(`\n${rows.length} rollouts -> ${out}`);
process.exit(0);
