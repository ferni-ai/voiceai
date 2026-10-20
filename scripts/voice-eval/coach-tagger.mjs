// LLM tagger for the coaching rubric: one request per call, every turn numbered,
// JSON back. Assistant turns get MITI 4.2.1 behaviour codes; caller turns get
// change / sustain / neutral talk. Claude judges by default because the personas
// run on Gemini, and judges favour their own family (judge.mjs).
//
// Current Claude models reject `temperature`, so a rerun is made repeatable by
// the cache instead: results are stored under the hash of (prompt version,
// model, numbered transcript), and a cached call is never asked again.
//
// UNVALIDATED: these codes have not yet been checked against human-coded calls
// (target Cohen's kappa >= .6 on ~50 calls, CRAFT.md §8). Report them as the
// tagger's reading, not as MITI scores.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROVIDERS } from './judge.mjs';

export const PROMPT_VERSION = 'coach-tagger-v1';
export const CODES = ['Q', 'SR', 'CR', 'GI', 'AF', 'Seek', 'Emph', 'Persuade', 'PwP', 'Confront'];

const label = (id) => id.split('-')[0].toUpperCase();

export function transcriptFor(turns) {
  return turns
    .map(
      (t) =>
        `${t.n}. ${t.who === 'agent' ? `ASSISTANT (${label(t.persona)})${t.greeting ? ' [greeting]' : ''}` : 'CALLER'}: ${t.text}`
    )
    .join('\n');
}

export function promptFor(turns) {
  return `You are coding a voice call between a caller and an AI coach team (each ASSISTANT line names the persona speaking) with the MITI 4.2.1 coding manual (Moyers, Manuel & Ernst 2015). Code what is said, strictly by the manual.

ASSISTANT turns: list every MITI behaviour in the turn, one code per utterance in order ("codes"), from exactly these:
Q (question), SR (simple reflection: repeats or rephrases what the caller said, adds little), CR (complex reflection: adds meaning, feeling, or the next unstated step), GI (giving information), AF (affirm: genuine, tied to a specific caller behaviour, strength, effort or intention; agreement, cheerleading or non-specific praise like "great job" is NOT AF), Seek (seeking collaboration: asks the caller's ideas or permission), Emph (emphasizing autonomy), Persuade (advice, opinion or argument for change WITHOUT permission), PwP (persuade with permission: the caller asked for it within the last 2 turns, the assistant asked permission, or it is framed autonomy-supportively like "you might see if this fits"), Confront (disagreeing, correcting, warning, moralizing, labelling, shaming, doubting honesty).
Small talk, greetings and handoff lines ("I'll bring in Maya") get no code: use an empty list.
Also mark, true or false:
- "specificAffirm": an AF that names something specific the caller actually did, chose or values in this transcript.
- "evocative": a question asking the caller's own reasons, desires, ability or plan for change ("why does this matter to you?", "how would you do it?").
- "summary": a reflection that pulls together what the caller said across 3 or more of their earlier turns.
- "check": asks whether it understood ("did I get that right?").
- "agreementMove": asks or confirms what the caller wants from THIS conversation.

CALLER turns: "talk" is "change" (desire, ability, reasons, need, commitment or steps toward a change), "sustain" (the same, for the status quo: "I'm just not a morning person"), or "neutral". Also "statesGoal" (says what they want from this conversation) and "ownNextStep" (states, in their own words, a concrete next action they will take).

CALL: "goalDiscussed" is true if the call discusses a goal, change or problem the caller wants to work on.

Reply with JSON only, no prose:
{"turns": [{"n": <turn number>, "codes": [...], "specificAffirm": bool, "evocative": bool, "summary": bool, "check": bool, "agreementMove": bool} for each ASSISTANT turn, {"n": <turn number>, "talk": "change"|"sustain"|"neutral", "statesGoal": bool, "ownNextStep": bool} for each CALLER turn], "goalDiscussed": bool}

TRANSCRIPT:
${transcriptFor(turns)}`;
}

/** Tags keyed by turn number, unknown codes dropped and counted. */
export function parseTags(reply, turns) {
  const tags = {};
  let unknownCodes = 0;
  const who = new Map(turns.map((t) => [t.n, t.who]));
  for (const t of reply.turns ?? []) {
    if (!who.has(t.n)) continue;
    if (who.get(t.n) === 'agent') {
      const codes = (t.codes ?? []).filter((c) => CODES.includes(c));
      unknownCodes += (t.codes ?? []).length - codes.length;
      tags[t.n] = {
        codes,
        specificAffirm: !!t.specificAffirm,
        evocative: !!t.evocative,
        summary: !!t.summary,
        check: !!t.check,
        agreementMove: !!t.agreementMove,
      };
    } else {
      tags[t.n] = {
        talk: ['change', 'sustain'].includes(t.talk) ? t.talk : 'neutral',
        statesGoal: !!t.statesGoal,
        ownNextStep: !!t.ownNextStep,
      };
    }
  }
  return {
    tags,
    call: { goalDiscussed: !!reply.goalDiscussed },
    unknownCodes,
    missing: turns.filter((t) => !tags[t.n]).map((t) => t.n),
  };
}

export const cacheKey = (turns, model) =>
  createHash('sha256')
    .update(JSON.stringify([PROMPT_VERSION, model, transcriptFor(turns)]))
    .digest('hex')
    .slice(0, 24);

// $ per million tokens (input, output), for the report's cost line.
const PRICE = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

/** Tag one call's turns, reading and writing the cache under cacheDir. */
export async function tagCall(turns, { cacheDir, provider = 'claude', env = process.env } = {}) {
  const model = env.COACH_TAGGER_MODEL ?? PROVIDERS[provider].model(env);
  const file = join(cacheDir, `${cacheKey(turns, model)}.json`);
  if (existsSync(file)) return { ...JSON.parse(readFileSync(file, 'utf8')), cached: true };
  const project =
    env.GCP_PROJECT ??
    execFileSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8' }).trim();
  const ctx = { model, project };
  const started = Date.now();
  const reply = await PROVIDERS[provider].ask(promptFor(turns), ctx);
  const usage = ctx.usage ?? null;
  const price = PRICE[model];
  const result = {
    promptVersion: PROMPT_VERSION,
    provider,
    model,
    via: ctx.via ?? 'vertex',
    ms: Date.now() - started,
    usage,
    // List price; Vertex bills Claude at its own rates (see judge.mjs).
    usd:
      usage && price
        ? Math.round(
            ((usage.input_tokens * price[0] + usage.output_tokens * price[1]) / 1e6) * 10000
          ) / 10000
        : null,
    reply,
  };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(file, JSON.stringify(result, null, 2));
  return { ...result, cached: false };
}
