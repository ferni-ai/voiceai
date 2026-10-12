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
 * --arm runs prod plus one arm's flags (ARMS) into ferni.<arm>.json; the default arm, base, is
 * prod as is (ferni.json). With TURN_PLAN=on, gemini-3.5-flash-lite first reads what the reply has
 * to pick up, and with TURN_PLAN_CHECK=on checks the draft against it, regenerating once on a
 * clear miss; both calls are timed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

// @ts-expect-error plain .mjs script, no types
import { neutralise, runDir } from './corpus.mjs';
// @ts-expect-error plain .mjs script, no types
import { gemini, pool } from './models.mjs';

// What prod set for reply shaping at the 2026-10-09/10 deploys (agent CA_GeFvEpsNXLSF).
const PROD =
  'PROMPT_MODE=character CASCADE_FAST_LANE=on HUMAN_TEXTURE=on LAUGH_ALONG=on THINK_ALOUD=on CURIOUS_DETAIL=on ASK_ADVICE=on LIFE_MOVES_ON=on';
for (const [k, v] of PROD.split(' ').map((kv) => kv.split('='))) process.env[k] ??= v;
const ARMS: Record<string, string> = {
  base: '',
  rep: '', // base again: how far a re-run moves on its own
  length: 'TURN_LENGTH=learned',
  texture: 'TURN_TEXTURE=learned',
  plan: 'TURN_PLAN=on TURN_PLAN_CHECK=on',
  all: 'TURN_LENGTH=learned TURN_TEXTURE=learned TURN_PLAN=on TURN_PLAN_CHECK=on',
  lt: 'TURN_LENGTH=learned TURN_TEXTURE=learned',
  inflight:
    'TURN_LENGTH=learned TURN_TEXTURE=learned TURN_PLAN=on TURN_PLAN_CHECK=on ATTUNE=on QUIET_CALLER=on HONEST_FRIEND=on',
};
const opts = parseArgs({ options: { out: { type: 'string' }, arm: { type: 'string' } } }).values;
const arm = (opts.arm as string | undefined) ?? 'base';
if (!(arm in ARMS)) throw new Error(`--arm must be one of ${Object.keys(ARMS)}`);
for (const [k, v] of ARMS[arm]
  .split(' ')
  .filter(Boolean)
  .map((kv) => kv.split('=')))
  process.env[k] = v;
const loader = await import('../../../src/agents/personas/prompt-loader.js');
const { turnShapeFor, rngFor } = await import('../../../src/agents/personas/turn-shape.js');
const { laneReason } = await import('../../../src/agents/model-provider/fast-lane.js');
const { recentTurns } = await import('../../../src/agents/personas/turn-length.js');
const { regexSignals } = await import('../../../src/agents/personas/turn-extras.js');
const { callerMove } = await import('../../../src/agents/personas/turn-shape.js');
const { llm } = await import('@livekit/agents');
const { attunementNote } = await import('../../../src/agents/personas/turn-attunement.js');
const { honestFriendNote } = await import('../../../src/agents/personas/honest-friend.js');
const quietMod = await import('../../../src/agents/personas/quiet-caller.js');

type Turn = { who: 'caller' | 'friend'; text: string };
type Moment = { id: string; context: Turn[]; names: { friend: string; caller: string } };

const out = runDir(opts.out) as string;
const moments = JSON.parse(readFileSync(join(out, 'moments.json'), 'utf8')) as Moment[];
const file = join(out, arm === 'base' ? 'ferni.json' : `ferni.${arm}.json`);
const done: Record<string, object> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const persona = await loader.loadSystemPrompt('ferni', 'voice_agent');
const system = `${(await loader.loadModelBaseInstructions()).trim()}\n\n---\n\n${persona}`;
const temperature = Number(process.env.GEMINI_TEMPERATURE ?? 0.8);

const FAST = 'gemini-3.5-flash-lite';
const PLAN = `Two friends are talking; "ferni" is about to reply to "sam". From the last turns, say in under 20 words what ferni's reply has to pick up: the specific thing sam just said or asked, and who it is about or who did it. JSON only: {"pickUp": "..."}`;
const CHECK = `Two friends are talking; "ferni" replied to "sam". Did the reply clearly miss: ignore or misread what sam just said, mix up who did what, or mostly repeat sam's words back? Be lenient: a short or plain reply is fine. JSON only: {"miss": true|false, "why": "<short, if missed>"}`;
const lines = (m: Moment) =>
  m.context
    .slice(-6)
    .map((t) => `${t.who === 'friend' ? 'ferni' : 'sam'}: ${neutralise(t.text, m.names)}`)
    .join('\n');
async function fastJson(
  prompt: string,
  input: string
): Promise<{ json: Record<string, unknown>; ms: number }> {
  const t0 = Date.now();
  const text = (await gemini(FAST, {
    contents: [{ role: 'user', parts: [{ text: `${prompt}\n\n${input}` }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
  })) as string;
  return {
    json: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) || '{}'),
    ms: Date.now() - t0,
  };
}

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
    const recent = recentTurns(m.context.map((t) => ({ ferni: t.who === 'friend', text: t.text })));
    const plan = process.env.TURN_PLAN === 'on' ? await fastJson(PLAN, lines(m)) : null;
    const pickUp = typeof plan?.json.pickUp === 'string' ? plan.json.pickUp : undefined;
    // In-flight flags (ATTUNE, HONEST_FRIEND, QUIET_CALLER), as turn-request.ts adds them.
    const ctx = llm.ChatContext.empty();
    for (const t of m.context) ctx.addMessage({ role: t.who === 'friend' ? 'assistant' : 'user', content: neutralise(t.text, m.names) as string });
    const callerTurns = m.context.filter((t) => t.who === 'caller').map((t) => neutralise(t.text, m.names) as string);
    const quiet = quietMod.quietCallerEnabled() && quietMod.isQuietCaller(callerTurns);
    const move = quietMod.quietCallerEnabled() && quietMod.presentAck(said) ? 'ack' : callerMove(said);
    const sig = { ...regexSignals(said, move), recent, pickUp, ...(quiet ? { quiet } : {}) };
    const shape = turnShapeFor(said, rngFor(`${m.id}:${said}`), undefined, sig);
    const lane = laneReason(said);
    const model = lane === 'chat' ? 'gemini-3.5-flash-lite' : 'gemini-3.5-flash';
    const generationConfig = {
      temperature,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    };
    const draft = async (note = '') => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const reminder = [honestFriendNote(ctx, said), shape.reminder, attunementNote(ctx, {})].filter(Boolean).join(' ');
        const contents = contentsOf(m, `${reminder}${note}`);
        const reply = (await gemini(model, {
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig,
        })) as string;
        if (reply) return reply;
      }
      throw new Error(`${m.id}: no reply after 3 tries`);
    };
    let reply = await draft();
    const meta: Record<string, unknown> = {
      model,
      lane,
      shape: shape.shape,
      extras: shape.extras,
      pickUp,
      planMs: plan?.ms,
    };
    if (process.env.TURN_PLAN_CHECK === 'on') {
      const check = await fastJson(CHECK, `${lines(m)}\nferni's reply: ${reply}`);
      Object.assign(meta, {
        checkMs: check.ms,
        miss: check.json.miss === true,
        why: check.json.why,
        firstDraft: reply,
      });
      if (check.json.miss === true)
        reply = await draft(` Your first try missed (${String(check.json.why)}): reply again.`);
    }
    done[m.id] = { reply, ...meta };
    if (!done[m.id]) throw new Error(`${m.id}: no reply after 3 tries`);
    writeFileSync(file, JSON.stringify(done, null, 1));
  }
);
console.log(`${Object.keys(done).length}/${moments.length} replies in ${file}`);
