/**
 * Roll out a scripted quiet caller against Ferni's live per-turn setup and
 * measure who does the talking. Manual tool: calls Vertex AI.
 *
 *   GOOGLE_CLOUD_PROJECT=<p> npx tsx scripts/humanness-eval/quiet-caller.ts \
 *     --arm <label> [--runs 8] [--out-dir dir] [--set FLAG=value ...]
 *
 * Unlike replay.ts (one reply per recorded moment), each run is a whole call:
 * the caller's lines are fixed, Ferni's replies are generated one after
 * another, and every request goes through withTurnReminder (turn-request.ts),
 * so the turn shape, FERNI_STATE and, with DIRECTOR_NOTES=on, real director
 * notes (written by the director model after each reply, as live) all apply.
 * The caller is the 2026-10-11 dev call's: short, quiet, twice asking about
 * Ferni. Model call as the cascade: gemini-3.5-flash, thinking MINIMAL, 0.8.
 *
 * Writes one run JSON per call (voice-eval shape, so judge.mjs can score it)
 * and prints, per arm: caller talk share (caller words / all words), Ferni
 * words per reply, self-share rate (replies about himself), turn-back rate
 * (self-shares ending on a question about them), low-mood replies
 * (ferni-self-share.ts), self-shares in consecutive replies, and questions.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { llm } from '@livekit/agents';

const { values } = parseArgs({
  options: {
    arm: { type: 'string', default: 'arm' },
    runs: { type: 'string', default: '8' },
    'out-dir': { type: 'string', default: 'scripts/voice-eval/out/quiet-caller' },
    set: { type: 'string', multiple: true, default: [] },
  },
});
for (const kv of values.set ?? []) {
  const [k, v] = kv.split('=');
  process.env[k] = v;
}
process.env.PROMPT_MODE = 'character';

/** The caller, line by line: quiet, short, asking about Ferni twice. */
export const QUIET_CALLER = [
  'Hey. Still on here.',
  'Yeah, just a quiet Sunday.',
  'Not much.',
  'Mm.',
  'What are you up to today, Fern?',
  'Huh.',
  'Yeah.',
  "I don't know, just hanging around the house.",
  'Mm-hm.',
  'Yeah, I guess.',
  'What else is going on with you?',
  'Okay.',
];

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error('Set GOOGLE_CLOUD_PROJECT');
const MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'])
  .toString()
  .trim();
const urlFor = (model: string): string =>
  `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;

type Content = { role: 'user' | 'model'; parts: Array<{ text: string }> };

async function generate(
  system: string,
  contents: Content[],
  opts: { model?: string; temperature?: number; max?: number } = {}
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
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(urlFor(opts.model ?? MODEL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    }).catch(() => null);
    if (!res || res.status === 429 || res.status >= 500) {
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

const { loadSystemPrompt, loadModelBaseInstructions } =
  await import('../../src/agents/personas/prompt-loader.js');
const { withTurnReminder } = await import('../../src/agents/personas/turn-request.js');
const { Director, setDirector, linesFromChat, directorNotesEnabled } =
  await import('../../src/agents/personas/director-notes.js');
const { isSelfShare, soundsLow, turnsBack } =
  await import('../../src/agents/personas/ferni-self-share.js');

const persona = await loadSystemPrompt('ferni', 'voice_agent');
const base = await loadModelBaseInstructions();
const system = `${base.trim()}\n\n---\n\n${persona}`;

/** The request as Vertex contents: system messages dropped (the character sheet is the system). */
function contentsOf(ctx: llm.ChatContext): Content[] {
  const out: Content[] = [];
  for (const item of ctx.items) {
    if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue;
    const role = item.role === 'user' ? 'user' : 'model';
    const text = item.textContent ?? '';
    const last = out[out.length - 1];
    if (last?.role === role) last.parts[0].text += `\n${text}`;
    else out.push({ role, parts: [{ text }] });
  }
  return out;
}

const words = (t: string): number => t.split(/\s+/).filter(Boolean).length;

async function oneCall(
  i: number
): Promise<{ caller: string[]; ferni: string[]; notes: string[][] }> {
  const sessionId = `quiet-caller-${values.arm}-${i}-${Date.now()}`;
  const session = {
    userData: { personaId: 'ferni', services: { sessionId, sessionStartTime: Date.now() } },
  };
  const director = new Director({
    sessionId,
    userName: 'Seth',
    writeNotes: directorNotesEnabled(),
    budgetMs: 8000,
    writer: (sys, prompt) =>
      generate(sys, [{ role: 'user', parts: [{ text: prompt }] }], { temperature: 0.7, max: 120 }),
  });
  setDirector(session, director);
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  const ferni: string[] = [];
  const notes: string[][] = [];
  for (const line of QUIET_CALLER) {
    ctx.addMessage({ role: 'user', content: line });
    notes.push([...director.current()]);
    const reply = await generate(system, contentsOf(withTurnReminder(ctx, session)));
    ferni.push(reply);
    ctx.addMessage({ role: 'assistant', content: reply || 'Mm.' });
    await director.observe(linesFromChat(ctx.items));
  }
  return { caller: QUIET_CALLER, ferni, notes };
}

const runs = Number(values.runs);
const outDir = values['out-dir'] as string;
mkdirSync(outDir, { recursive: true });
const calls = await Promise.all(Array.from({ length: runs }, (_, i) => oneCall(i)));

let callerWords = 0;
let ferniWords = 0;
let replies = 0;
let self = 0;
let back = 0;
let low = 0;
let consecutive = 0;
let questions = 0;
calls.forEach((c, i) => {
  const events: Array<{ t: number; who: string; text: string }> = [];
  c.caller.forEach((line, k) => {
    events.push({ t: 1000 + k * 10, who: 'user', text: line });
    events.push({ t: 1001 + k * 10, who: 'agent', text: c.ferni[k] });
  });
  const label = `${values.arm}-${i}`;
  writeFileSync(
    `${outDir}/quiet-caller-${label}.json`,
    JSON.stringify(
      {
        meta: { scenario: 'quiet-caller', label, arm: values.arm },
        userSpeech: [[0, 1]],
        events,
        notes: c.notes,
      },
      null,
      2
    )
  );
  c.ferni.forEach((r, k) => {
    replies++;
    ferniWords += words(r);
    callerWords += words(c.caller[k]);
    if (/\?["”']?\s*$/.test(r)) questions++;
    if (soundsLow(r)) low++;
    if (isSelfShare(r)) {
      self++;
      if (turnsBack(r)) back++;
      if (k > 0 && isSelfShare(c.ferni[k - 1])) consecutive++;
    }
  });
});
const pct = (a: number, b: number): string => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
console.log(
  JSON.stringify(
    {
      arm: values.arm,
      set: values.set,
      calls: runs,
      replies,
      callerShare: +(callerWords / (callerWords + ferniWords)).toFixed(3),
      ferniWordsPerReply: +(ferniWords / replies).toFixed(1),
      selfShareRate: pct(self, replies),
      turnBackOfSelfShares: pct(back, self),
      consecutiveSelfShares: consecutive,
      lowMoodReplies: low,
      endsOnQuestion: pct(questions, replies),
    },
    null,
    2
  )
);
process.exit(0);
