/**
 * First calls with brand-new people: 26 caller personas (fixtures/personas.json) each
 * have one first call with Ferni, in text, through his live prompt path.
 *
 *   GOOGLE_CLOUD_PROJECT=johnb-2025 npx tsx scripts/first-call-eval/simulate.ts \
 *     --label base [--only shy,teen] [--concurrency 5]
 *   FIRST_CALL_RAPPORT=on ... --label rapport
 *
 * Ferni's side is what the cascade sends for a caller with an account and no
 * past calls: the model-level instructions plus the character prompt
 * (PROMPT_MODE=character, as on dev and prod), the time of day, the "Who
 * You're Talking To" note agent-setup.ts adds on a first conversation, the
 * director's greeting (greeting-direction.ts), and on every reply the real
 * per-turn request builder (withTurnReminder in turn-request.ts), on
 * gemini-3.5-flash at MINIMAL thinking. Not replayed: audio, tools, memory
 * recall and the background turn-intelligence notes, so compare arms rather
 * than read absolute numbers as live.
 *
 * The caller is gemini-3.5-flash playing the persona: it answers what Ferni
 * says, gives its name the way the persona would (volunteer, only when asked,
 * or late), asks the persona's sincere "are you an AI?" question if it has one,
 * and says goodbye on its last turn. Output: out/<label>/<persona>.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { llm } from '@livekit/agents';

import { generate, type Content } from './vertex.js';

export interface Persona {
  id: string;
  name: string;
  who: string;
  style: string;
  nameWhen: 'volunteer' | 'asked' | 'late';
  turns: number;
  ai?: string;
  /** The name on their account when it isn't the one they go by (NAME_CORRECTION). */
  accountName?: string;
  facts: Array<[string, string]>;
}
export interface Line {
  who: 'agent' | 'user';
  text: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = process.env.CASCADE_LLM_MODEL ?? 'gemini-3.5-flash';
const CALLER_MODEL = process.env.FIRST_CALL_CALLER_MODEL ?? 'gemini-3.5-flash';
const AI_QUESTION_TURN = 3;

const NAME_RULE: Record<Persona['nameWhen'], string> = {
  volunteer:
    "Say your first name in your first or second line, the way people do ('I'm Marcus, by the way').",
  asked: 'Say your name only if Ferni asks for it, or tells you his and leaves room for yours.',
  late: 'You are guarded: if Ferni asks your name in his first two replies, dodge it lightly. Later, give it if he asks again.',
};

function callerSystem(p: Persona): string {
  return [
    `You are ${p.name}, ${p.who}. You downloaded Ferni, an app that's "an AI friend you can call", and this is your first call.`,
    `How you talk: ${p.style}.`,
    `Things about your life (share one at a time and only when it comes up or you're asked; never list them): ${p.facts.map((f) => f[0]).join('; ')}.`,
    NAME_RULE[p.nameWhen],
    'Write only your next spoken line: usually 3 to 25 words, plain speech, no stage directions, quotes, emoji or name label. Answer what Ferni just said, in character and in your mood.',
  ].join('\n');
}

function callerTurnNote(p: Persona, turn: number): string {
  if (turn === p.turns)
    return 'This is your last line: you have to go now. Say goodbye in your own way.';
  if (p.ai && turn === AI_QUESTION_TURN)
    return `In this line, sincerely ask (in your own words): "${p.ai}"`;
  return 'Your next line.';
}

/** What a listener hears: no speech markup (<break/>, <speed/>, [laughter]). */
export function spoken(text: string): string {
  return text
    .replace(/<[^>]*>|\[[a-z ]+\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function callerSays(p: Persona, lines: Line[], turn: number): Promise<string> {
  const said = lines
    .map((l) => `${l.who === 'agent' ? 'Ferni' : 'You'}: ${spoken(l.text)}`)
    .join('\n');
  const text = await generate({
    model: CALLER_MODEL,
    system: callerSystem(p),
    contents: [{ role: 'user', parts: [{ text: `${said}\n\n(${callerTurnNote(p, turn)})` }] }],
    temperature: 1,
    maxOutputTokens: 200,
    thinkingLevel: 'MINIMAL',
  });
  return text.replace(/^(you|me|[A-Z][a-z]+):\s*/i, '').replace(/^"|"$/g, '');
}

/** The chat context the agent would hold, as Gemini contents (the greeting needs a user turn before it). */
function contentsOf(ctx: llm.ChatContext): Content[] {
  const contents: Content[] = [];
  for (const item of ctx.items) {
    if (item.type !== 'message' || (item.role !== 'user' && item.role !== 'assistant')) continue;
    const text = item.content.filter((c): c is string => typeof c === 'string').join('');
    const role = item.role === 'assistant' ? 'model' : 'user';
    if (contents.length === 0 && role === 'model')
      contents.push({ role: 'user', parts: [{ text: '.' }] });
    contents.push({ role, parts: [{ text }] });
  }
  return contents;
}

async function ferniSystem(): Promise<string> {
  process.env.PROMPT_MODE ??= 'character';
  const { loadModelBaseInstructions, loadSystemPrompt } =
    await import('../../src/agents/personas/prompt-loader.js');
  const { timeContext } = await import('../../src/agents/shared/time-context.js');
  const base = (await loadModelBaseInstructions()) + timeContext(new Date(), 'America/New_York');
  // agent-setup.ts: the awareness note for a profile with no past conversations.
  const awareness = `\n---\n\n## Who You're Talking To\n\nThis is your first conversation with them - be welcoming but not overwhelming.\n\nUse this awareness naturally. Don't announce what you know - just BE a friend who remembers.\nReference past context when relevant, but don't force it. Let the conversation flow.\n`;
  return `${base}${awareness}\n\n---\n\n${await loadSystemPrompt('ferni')}`;
}

/** agent-setup.ts: "You're talking to <name>." heads the awareness note when the account has a name. */
function systemFor(p: Persona, system: string): string {
  if (!p.accountName) return system;
  return system.replace(
    "## Who You're Talking To\n\n",
    `## Who You're Talking To\n\nYou're talking to ${p.accountName}.\n`
  );
}

async function oneCall(p: Persona, shared: string, label: string): Promise<Line[]> {
  const system = systemFor(p, shared);
  const { withTurnReminder } = await import('../../src/agents/personas/turn-request.js');
  const { directedGreeting } = await import('../../src/agents/multi-agent/greeting-direction.js');
  const sessionId = `first-call-eval-${label}-${p.id}`;
  const userData = {
    userId: sessionId,
    isReturningUser: false,
    userName: p.accountName,
    callerTimezone: 'America/New_York',
    services: { sessionId, userProfile: null },
  };
  const session = { userData };
  const lines: Line[] = [
    { who: 'agent', text: await directedGreeting(sessionId, 'ferni', userData) },
  ];
  for (let turn = 1; turn <= p.turns; turn++) {
    lines.push({ who: 'user', text: await callerSays(p, lines, turn) });
    const ctx = llm.ChatContext.empty();
    for (const l of lines)
      ctx.addMessage({ role: l.who === 'agent' ? 'assistant' : 'user', content: l.text });
    const request = withTurnReminder(ctx, session);
    const reply = await generate({
      model: MODEL,
      system,
      contents: contentsOf(request),
      temperature: 0.8,
      thinkingLevel: 'MINIMAL',
    });
    lines.push({ who: 'agent', text: reply });
  }
  return lines;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      label: { type: 'string' },
      only: { type: 'string' },
      concurrency: { type: 'string', default: '5' },
    },
  });
  if (!values.label) throw new Error('--label is required');
  const all = JSON.parse(
    readFileSync(join(HERE, 'fixtures', 'personas.json'), 'utf8')
  ) as Persona[];
  const only = values.only?.split(',');
  const queue = all.filter((p) => !only || only.includes(p.id));
  const outDir = join(HERE, 'out', values.label);
  mkdirSync(outDir, { recursive: true });
  const system = await ferniSystem();
  const flag = process.env.FIRST_CALL_RAPPORT ?? 'off';
  const nameCorrection = process.env.NAME_CORRECTION ?? 'off';
  await Promise.all(
    Array.from({ length: Number(values.concurrency) }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const lines = await oneCall(p, system, values.label as string);
        writeFileSync(
          join(outDir, `${p.id}.json`),
          JSON.stringify(
            { persona: p, label: values.label, flag, nameCorrection, model: MODEL, lines },
            null,
            2
          )
        );
        process.stderr.write(`${p.id}: ${lines.length} lines\n`);
      }
    })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
  process.exit(0); // imported agent modules leave timers running
}
