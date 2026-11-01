/**
 * next-turn-vs-human, step 2: Ferni's reply to each moment, made as prod makes it. System:
 * model base instructions + the Ferni character prompt (PROMPT_MODE=character); the turn-shape
 * reminder (TURN_SHAPE=model, prod's extras flags) on the caller's last message; the fast lane
 * picks the model (chit-chat: gemini-3.5-flash-lite, else 3.5-flash); MINIMAL thinking,
 * temperature 0.8. Ferni sits in the real friend's seat (their earlier turns are his), named
 * Ferni; the other speaker is Sam. Not replayed: tools, memory, director notes, deliberation.
 *
 *   npx tsx scripts/voice-eval/next-turn/generate.ts [--arm <name>] [--out <dir>]
 *
 * --arm runs prod plus one arm's flags (ARMS) into ferni.<arm>.json; base (the default) is prod as
 * is, in ferni.json. A trailing digit (lt2, lt3) is the same arm drawn again with another seed,
 * for pooling several samples per moment (compare-arms.mjs).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

// @ts-expect-error plain .mjs script, no types
import { neutralise, runDir } from './corpus.mjs';
// @ts-expect-error plain .mjs script, no types
import { gemini, pool } from './models.mjs';

// What prod set for reply shaping at the 2026-10-09/10 deploys (agent CA_GeFvEpsNXLSF), less
// HUMAN_TEXTURE, THINK_ALOUD and CURIOUS_DETAIL, which are no longer flags.
const PROD =
  'PROMPT_MODE=character CASCADE_FAST_LANE=on LAUGH_ALONG=on ASK_ADVICE=on LIFE_MOVES_ON=on';
for (const [k, v] of PROD.split(' ').map((kv) => kv.split('='))) process.env[k] ??= v;
const ARMS: Record<string, string> = {
  base: '',
  rep: '', // base again: how far a re-run moves on its own
  length: 'TURN_LENGTH=learned',
  texture: 'TURN_TEXTURE=learned',
  lt: 'TURN_LENGTH=learned TURN_TEXTURE=learned',
  // Learned, plus room to answer when the turn needs substance (turn-substance.ts).
  adaptive: 'TURN_LENGTH=adaptive TURN_TEXTURE=learned',
};
const opts = parseArgs({ options: { out: { type: 'string' }, arm: { type: 'string' } } }).values;
const arm = (opts.arm as string | undefined) ?? 'base';
const [, name, salt = ''] = arm.match(/^(.*?)(\d*)$/) ?? [];
if (!(name in ARMS))
  throw new Error(`--arm must be one of ${Object.keys(ARMS)} (optionally + digit)`);
for (const [k, v] of ARMS[name]
  .split(' ')
  .filter(Boolean)
  .map((kv) => kv.split('=')))
  process.env[k] = v;
const loader = await import('../../../src/agents/personas/prompt-loader.js');
const { turnShapeFor, rngFor } = await import('../../../src/agents/personas/turn-shape.js');
const { laneReason } = await import('../../../src/agents/model-provider/fast-lane.js');
const { lengthAdaptive, recentTurns } = await import('../../../src/agents/personas/turn-length.js');
const { substanceOf } = await import('../../../src/agents/personas/turn-substance.js');
const { regexSignals } = await import('../../../src/agents/personas/turn-extras.js');
const { callerMove } = await import('../../../src/agents/personas/turn-shape.js');

type Turn = { who: 'caller' | 'friend'; text: string };
type Moment = { id: string; context: Turn[]; names: { friend: string; caller: string } };

const out = runDir(opts.out) as string;
const moments = JSON.parse(readFileSync(join(out, 'moments.json'), 'utf8')) as Moment[];
const file = join(out, arm === 'base' ? 'ferni.json' : `ferni.${arm}.json`);
const done: Record<string, object> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const persona = await loader.loadSystemPrompt('ferni', 'voice_agent');
const system = `${(await loader.loadModelBaseInstructions()).trim()}\n\n---\n\n${persona}`;
const temperature = Number(process.env.GEMINI_TEMPERATURE ?? 0.8);

/** Gemini turns: start with the caller; one speaker's lines in a row are one turn. */
function contentsOf(m: Moment, reminder: string) {
  const turns: Turn[] = [];
  for (const t of m.context) {
    const text = neutralise(t.text, m.names) as string;
    if (turns.at(-1)?.who === t.who) turns[turns.length - 1].text += ` ${text}`;
    else if (turns.length || t.who === 'caller') turns.push({ who: t.who, text });
  }
  return turns.map((t, i) => ({
    role: t.who === 'friend' ? 'model' : 'user',
    parts: [{ text: i === turns.length - 1 ? `${t.text}\n\n(${reminder})` : t.text }],
  }));
}

await pool(
  moments.filter((m) => !done[m.id]),
  6,
  async (m: Moment) => {
    const said = neutralise(m.context[m.context.length - 1].text, m.names) as string;
    // The turns before this reply, which the learned length reads (turn-length.ts).
    const recent = recentTurns(m.context.map((t) => ({ ferni: t.who === 'friend', text: t.text })));
    const move = callerMove(said);
    // No tools are replayed, so only a question (to Ferni, who has no beat) can need substance.
    const substance = lengthAdaptive() ? substanceOf(said, move) : undefined;
    const sig = { ...regexSignals(said, move), recent, substance };
    const shape = turnShapeFor(said, rngFor(`${salt}${m.id}:${said}`), undefined, sig);
    const lane = laneReason(said);
    const lite = process.env.CASCADE_FAST_LANE === 'on' && lane === 'chat';
    const model = lite ? 'gemini-3.5-flash-lite' : 'gemini-3.5-flash';
    const generationConfig = {
      temperature,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    };
    for (let attempt = 0; attempt < 3 && !done[m.id]; attempt++) {
      const contents = contentsOf(m, shape.reminder);
      const reply = (await gemini(model, {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig,
      })) as string;
      if (reply) done[m.id] = { reply, model, lane, shape: shape.shape, extras: shape.extras };
    }
    if (!done[m.id]) throw new Error(`${m.id}: no reply after 3 tries`);
    writeFileSync(file, JSON.stringify(done, null, 1));
  }
);
console.log(`${Object.keys(done).length}/${moments.length} replies in ${file}`);
